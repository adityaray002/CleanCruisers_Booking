const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const Lead         = require('../models/Lead');
const ChatLabel    = require('../models/ChatLabel');

// GET /api/inbox — list all conversations grouped by phone+bizId
const getConversations = async (req, res) => {
  try {
    const convos = await Message.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: {
        _id:           { customerPhone: '$customerPhone', businessId: '$businessId' },
        lastMessage:   { $first: '$text' },
        lastMessageAt: { $first: '$createdAt' },
        lastDirection: { $first: '$direction' },
      }},
      { $sort: { lastMessageAt: -1 } },
      { $limit: 100 },
    ]);

    const enriched = await Promise.all(convos.map(async (c) => {
      const phone = c._id.customerPhone;
      const bizId = c._id.businessId;
      const [lead, conv, chatLabel] = await Promise.all([
        Lead.findOne({ phone }).sort({ createdAt: -1 }).select('name stage serviceInterest convertedBookingId').lean(),
        Conversation.findOne({ customerPhone: phone, businessId: bizId }).select('step').lean(),
        ChatLabel.findOne({ customerPhone: phone, businessId: bizId }).lean(),
      ]);
      return {
        customerPhone: phone,
        businessId:    bizId,
        lastMessage:   c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        lastDirection: c.lastDirection,
        lead,
        botStep:   conv?.step,
        chatLabel: chatLabel?.label  || null,
        chatNote:  chatLabel?.note   || '',
      };
    }));

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
    const [messages, lead, conv, chatLabel] = await Promise.all([
      Message.find({ customerPhone: phone, ...(businessId && { businessId }) }).sort({ createdAt: 1 }).lean(),
      Lead.findOne({ phone }).sort({ createdAt: -1 }).lean(),
      Conversation.findOne({ customerPhone: phone, ...(businessId && { businessId }) }).lean(),
      ChatLabel.findOne({ customerPhone: phone, ...(businessId && { businessId }) }).lean(),
    ]);
    res.json({ success: true, data: { messages, lead, conv, chatLabel } });
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

module.exports = { getConversations, getMessages, updateChatLabel, sendReply };
