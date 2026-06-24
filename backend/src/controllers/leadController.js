const Lead = require('../models/Lead');

const getLeads = async (req, res, next) => {
  try {
    const { stage, search } = req.query;
    const filter = {};
    if (stage) filter.stage = stage;
    if (search) {
      const q = new RegExp(search, 'i');
      filter.$or = [{ name: q }, { phone: q }];
    }
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: leads.length, data: leads });
  } catch (err) {
    next(err);
  }
};

const createLead = async (req, res, next) => {
  try {
    const { name, phone, serviceInterest, quotedAmount, source, notes, followUpDate } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }
    const lead = await Lead.create({
      name, phone, serviceInterest, quotedAmount, source, notes, followUpDate,
      addedBy: req.user._id,
    });
    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

const updateLead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

const deleteLead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    next(err);
  }
};

const getLeadStats = async (req, res, next) => {
  try {
    const [total, byStage] = await Promise.all([
      Lead.countDocuments(),
      Lead.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
    ]);
    const stageMap = Object.fromEntries(byStage.map((s) => [s._id, s.count]));
    res.json({ success: true, data: { total, byStage: stageMap } });
  } catch (err) {
    next(err);
  }
};

// Public endpoint — called from SofaShine website checkout (no JWT, API key only)
const createWebsiteLead = async (req, res, next) => {
  try {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.WEBSITE_API_KEY) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { name, phone, serviceInterest, quotedAmount, notes } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }

    const lead = await Lead.create({
      name: name.trim(),
      phone: phone.trim(),
      serviceInterest,
      quotedAmount: quotedAmount || 0,
      notes,
      source: 'website',
      stage: 'new',
    });

    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

const confirmLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.stage = 'booked';
    await lead.save();

    // Send WhatsApp confirmation to customer
    if (lead.phone) {
      const { sendText } = require('../utils/metaWhatsApp');
      const phoneNumberId = process.env.SOFASHINE_PHONE_NUMBER_ID;
      const token         = process.env.SOFASHINE_META_TOKEN;

      if (phoneNumberId && token) {
        const msg =
          `✅ *Booking Confirmed!*\n\n` +
          `Namaste *${lead.name}*! 🙏\n\n` +
          `Aapki booking confirm ho gayi hai.\n\n` +
          `🧹 Service: ${lead.serviceInterest || 'Cleaning Service'}\n` +
          (lead.notes ? `📋 ${lead.notes}\n` : '') +
          `💰 Amount: ₹${lead.quotedAmount}\n\n` +
          `Hamaari team jald aapke paas pahunchegi.\n` +
          `Koi sawaal ho toh hume yahan message karein. 🙏\n\n` +
          `_Thank you for choosing SofaShine!_`;

        sendText(lead.phone, msg, phoneNumberId, token)
          .catch((err) => console.error('[CONFIRM] WhatsApp send failed:', err.message));
      }
    }

    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

module.exports = { getLeads, createLead, updateLead, deleteLead, getLeadStats, createWebsiteLead, confirmLead };
