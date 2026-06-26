const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const Lead         = require('../models/Lead');

// GET /api/inbox — list recent conversations (one row per phone+business)
const getConversations = async (req, res, next) => {
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

    const phones = convos.map((c) => c._id.customerPhone);

    const [leads, activeConvs] = await Promise.all([
      Lead.find({ phone: { $in: phones } }).select('phone name stage').lean(),
      Conversation.find({ customerPhone: { $in: phones } }).select('customerPhone businessId step').lean(),
    ]);

    const leadMap = Object.fromEntries(leads.map((l) => [l.phone, l]));
    const convMap = Object.fromEntries(
      activeConvs.map((c) => [`${c.customerPhone}:${c.businessId}`, c.step])
    );

    const result = convos.map((c) => ({
      customerPhone: c._id.customerPhone,
      businessId:    c._id.businessId,
      lastMessage:   c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      lastDirection: c.lastDirection,
      botStep:       convMap[`${c._id.customerPhone}:${c._id.businessId}`] || null,
      lead:          leadMap[c._id.customerPhone] || null,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/inbox/:phone — full message history for one conversation
const getMessages = async (req, res, next) => {
  try {
    const { phone }              = req.params;
    const { businessId = 'sofashine' } = req.query;

    const [messages, lead, conv] = await Promise.all([
      Message.find({ customerPhone: phone, businessId }).sort({ createdAt: 1 }).limit(300).lean(),
      Lead.findOne({ phone }).lean(),
      Conversation.findOne({ customerPhone: phone, businessId }).lean(),
    ]);

    res.json({ success: true, data: { messages, lead, conv } });
  } catch (err) {
    next(err);
  }
};

// POST /api/inbox/:phone/reply — admin sends a manual message
const sendReply = async (req, res, next) => {
  try {
    const { phone }                    = req.params;
    const { text, businessId = 'sofashine' } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    const { sendText } = require('../utils/metaWhatsApp');

    const phoneNumberId = businessId === 'sofashine'
      ? process.env.SOFASHINE_PHONE_NUMBER_ID
      : process.env.CLEANCRUISERS_PHONE_NUMBER_ID;
    const token = businessId === 'sofashine'
      ? process.env.SOFASHINE_META_TOKEN
      : process.env.CLEANCRUISERS_META_TOKEN;

    const digits  = String(phone).replace(/\D/g, '');
    const toPhone = digits.length === 10 ? `91${digits}` : digits;

    await sendText(toPhone, text.trim(), phoneNumberId, token);

    const saved = await Message.create({
      customerPhone: phone,
      businessId,
      direction: 'outbound',
      text:      text.trim(),
      sentBy:    'admin',
      msgType:   'text',
    });

    res.json({ success: true, data: saved });
  } catch (err) {
    next(err);
  }
};

module.exports = { getConversations, getMessages, sendReply };
