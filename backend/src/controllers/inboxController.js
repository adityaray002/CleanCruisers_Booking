const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const Lead         = require('../models/Lead');

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
      const lead  = await Lead.findOne({ phone }).sort({ createdAt: -1 }).select('name stage serviceInterest convertedBookingId').lean();
      const conv  = await Conversation.findOne({ customerPhone: phone, businessId: bizId }).select('step').lean();
      return {
        customerPhone: phone,
        businessId:    bizId,
        lastMessage:   c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        lastDirection: c.lastDirection,
        lead,
        botStep: conv?.step,
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
    const messages = await Message.find({ customerPhone: phone, ...(businessId && { businessId }) })
      .sort({ createdAt: 1 })
      .lean();
    const lead = await Lead.findOne({ phone }).sort({ createdAt: -1 }).lean();
    const conv = await Conversation.findOne({ customerPhone: phone, ...(businessId && { businessId }) }).lean();
    res.json({ success: true, data: { messages, lead, conv } });
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

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getConversations, getMessages, sendReply };
