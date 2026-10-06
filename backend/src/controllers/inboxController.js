const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const Lead         = require('../models/Lead');
const ChatLabel    = require('../models/ChatLabel');
const WhatsAppContact = require('../models/WhatsAppContact');
const Booking      = require('../models/Booking');
const Customer     = require('../models/Customer');

// GET /api/inbox — every WhatsApp contact ever seen, newest first (chat text may have expired)
const getConversations = async (req, res) => {
  try {
    const convos = await WhatsAppContact.find().sort({ lastMessageAt: -1 }).lean();

    const phones = [...new Set(convos.map((c) => c.customerPhone))];
    const [leads, convDocs, labels] = await Promise.all([
      Lead.find({ phone: { $in: phones } }).sort({ createdAt: -1 }).select('phone name stage serviceInterest convertedBookingId').lean(),
      Conversation.find({ customerPhone: { $in: phones } }).select('customerPhone businessId step').lean(),
      ChatLabel.find({ customerPhone: { $in: phones } }).lean(),
    ]);

    // Sorted newest-first, so the first lead seen per phone is the latest one
    const leadByPhone = new Map();
    for (const l of leads) if (!leadByPhone.has(l.phone)) leadByPhone.set(l.phone, l);
    const key = (phone, bizId) => `${phone}:${bizId}`;
    const convByKey  = new Map(convDocs.map((d) => [key(d.customerPhone, d.businessId), d]));
    const labelByKey = new Map(labels.map((d) => [key(d.customerPhone, d.businessId), d]));

    const enriched = convos.map((c) => {
      const phone = c.customerPhone;
      const bizId = c.businessId;
      const lead      = leadByPhone.get(phone) || null;
      const conv      = convByKey.get(key(phone, bizId));
      const chatLabel = labelByKey.get(key(phone, bizId));
      return {
        customerPhone: phone,
        businessId:    bizId,
        lastMessage:   c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        lastDirection: c.lastDirection,
        profileName:   c.profileName || '',
        lead,
        botStep:   conv?.step,
        chatLabel: chatLabel?.label  || null,
        chatNote:  chatLabel?.note   || '',
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/inbox/:phone — messages for a single conversation
const getMessages = async (req, res) => {
  try {
    const { phone } = req.params;
    const { businessId } = req.query;
    const [messages, lead, conv, chatLabel, contact] = await Promise.all([
      Message.find({ customerPhone: phone, ...(businessId && { businessId }) }).sort({ createdAt: 1 }).lean(),
      Lead.findOne({ phone }).sort({ createdAt: -1 }).lean(),
      Conversation.findOne({ customerPhone: phone, ...(businessId && { businessId }) }).lean(),
      ChatLabel.findOne({ customerPhone: phone, ...(businessId && { businessId }) }).lean(),
      WhatsAppContact.findOne({ customerPhone: phone, ...(businessId && { businessId }) }).lean(),
    ]);
    res.json({ success: true, data: { messages, lead, conv, chatLabel, contact } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/inbox/:phone/label — set label and note for a conversation
const updateChatLabel = async (req, res) => {
  try {
    const { phone } = req.params;
    const { businessId, label, note } = req.body;
    if (!businessId) return res.status(400).json({ success: false, message: 'businessId required' });

    const update = {};
    if (label !== undefined) update.label = label || null;
    if (note  !== undefined) update.note  = note;

    const result = await ChatLabel.findOneAndUpdate(
      { customerPhone: phone, businessId },
      { $set: update },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/inbox/:phone/reply — admin sends a WhatsApp message
const sendReply = async (req, res) => {
  try {
    const { phone } = req.params;
    const { text, businessId } = req.body;
    if (!text || !businessId) return res.status(400).json({ success: false, message: 'text and businessId required' });

    const { sendText } = require('../utils/metaWhatsApp');
    const phoneNumberId = businessId === 'sofashine'
      ? process.env.SOFASHINE_PHONE_NUMBER_ID
      : process.env.CLEANCRUISERS_PHONE_NUMBER_ID;
    const token = businessId === 'sofashine'
      ? process.env.SOFASHINE_META_TOKEN
      : process.env.CLEANCRUISERS_META_TOKEN;

    await sendText(phone, text, phoneNumberId, token);
    await Message.create({ customerPhone: phone, businessId, direction: 'outbound', text, sentBy: 'admin' });

    // Auto-set label to 'active' when admin replies, if label is null or closed
    const existing = await ChatLabel.findOne({ customerPhone: phone, businessId });
    if (!existing?.label || existing.label === 'closed') {
      await ChatLabel.findOneAndUpdate(
        { customerPhone: phone, businessId },
        { $set: { label: 'active' } },
        { upsert: true }
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// WhatsApp sends 919876543210, bookings store 9876543210 — reduce both to one key
const normalizePhone = (raw) => {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0'))  return d.slice(1);
  return d;
};

// GET /api/inbox/contacts — every customer number from WhatsApp, leads, bookings and customers, de-duplicated
const getAllContacts = async (req, res) => {
  try {
    const [waContacts, leads, bookings, customers] = await Promise.all([
      WhatsAppContact.find().select('customerPhone businessId profileName firstMessageAt lastMessageAt').lean(),
      Lead.find().select('phone name serviceInterest stage createdAt updatedAt').lean(),
      Booking.find().select('customerPhone customerName serviceLabel status createdAt').lean(),
      Customer.find().select('phone name createdAt updatedAt').lean(),
    ]);

    const byPhone = new Map();
    const get = (raw) => {
      const phone = normalizePhone(raw);
      if (phone.length < 10) return null;
      if (!byPhone.has(phone)) {
        byPhone.set(phone, {
          phone, names: {}, sources: new Set(), businesses: new Set(),
          booked: false, serviceInterest: '', serviceAt: null, firstSeen: null, lastSeen: null,
        });
      }
      return byPhone.get(phone);
    };
    const seen = (e, ...dates) => {
      for (const d of dates.filter(Boolean).map((x) => new Date(x))) {
        if (!e.firstSeen || d < e.firstSeen) e.firstSeen = d;
        if (!e.lastSeen  || d > e.lastSeen)  e.lastSeen  = d;
      }
    };
    const service = (e, label, at) => {
      if (label && (!e.serviceAt || new Date(at) > e.serviceAt)) { e.serviceInterest = label; e.serviceAt = new Date(at); }
    };

    for (const c of waContacts) {
      const e = get(c.customerPhone); if (!e) continue;
      e.sources.add('WhatsApp');
      if (c.businessId && c.businessId !== 'unknown') e.businesses.add(c.businessId);
      if (c.profileName) e.names.whatsapp = c.profileName;
      seen(e, c.firstMessageAt, c.lastMessageAt);
    }
    for (const l of leads) {
      const e = get(l.phone); if (!e) continue;
      e.sources.add('Lead');
      if (l.name && l.name !== 'Incomplete') e.names.lead = l.name;
      if (l.stage === 'booked') e.booked = true;
      service(e, l.serviceInterest, l.createdAt);
      seen(e, l.createdAt, l.updatedAt);
    }
    for (const b of bookings) {
      const e = get(b.customerPhone); if (!e) continue;
      e.sources.add('Booking');
      if (b.customerName) e.names.booking = b.customerName;
      if (b.status !== 'cancelled') e.booked = true;
      service(e, b.serviceLabel, b.createdAt);
      seen(e, b.createdAt);
    }
    for (const c of customers) {
      const e = get(c.phone); if (!e) continue;
      e.sources.add('Customer');
      if (c.name) e.names.customer = c.name;
      seen(e, c.createdAt);
    }

    const data = [...byPhone.values()]
      .map((e) => ({
        phone:           e.phone,
        name:            e.names.customer || e.names.booking || e.names.lead || e.names.whatsapp || '',
        booked:          e.booked,
        serviceInterest: e.serviceInterest,
        sources:         [...e.sources],
        businesses:      [...e.businesses],
        firstSeen:       e.firstSeen,
        lastSeen:        e.lastSeen,
      }))
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getConversations, getMessages, updateChatLabel, sendReply, getAllContacts };
