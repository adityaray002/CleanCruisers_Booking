const Lead = require('../models/Lead');

const getLeads = async (req, res, next) => {
  try {
    const { stage, source, search, dateFrom, dateTo, showArchived } = req.query;
    const filter = {};
    // By default hide archived leads; show them only when explicitly requested
    filter.archived = showArchived === 'true' ? true : { $ne: true };
    if (stage)  filter.stage  = stage;
    if (source) filter.source = source;
    if (search) {
      const q = new RegExp(search, 'i');
      filter.$or = [{ name: q }, { phone: q }, { serviceInterest: q }];
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
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

// Soft-delete — keeps data in DB for future reference
const archiveLead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, message: 'Lead archived' });
  } catch (err) {
    next(err);
  }
};

const restoreLead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, { archived: false }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

const getLeadStats = async (req, res, next) => {
  try {
    const [total, byStage, archivedCount] = await Promise.all([
      Lead.countDocuments({ archived: { $ne: true } }),
      Lead.aggregate([
        { $match: { archived: { $ne: true } } },
        { $group: { _id: '$stage', count: { $sum: 1 } } },
      ]),
      Lead.countDocuments({ archived: true }),
    ]);
    const stageMap = Object.fromEntries(byStage.map((s) => [s._id, s.count]));
    res.json({ success: true, data: { total, byStage: stageMap, archived: archivedCount } });
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

// Normalize Indian phone numbers to WhatsApp format (e.g. 9XXXXXXXXX → 919XXXXXXXXX)
const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
};

const confirmLead = async (req, res, next) => {
  try {
    const Booking = require('../models/Booking');
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    lead.stage = 'booked';

    // Auto-create booking if we have all required scheduling data (from WhatsApp bot)
    let bookingCreated = null;
    if (lead.scheduledDate && lead.timeSlot && lead.address && !lead.convertedBookingId) {
      bookingCreated = await Booking.create({
        customerName:  lead.name,
        customerEmail: '',
        customerPhone: lead.phone,
        serviceLabel:  lead.serviceInterest || 'Cleaning Service',
        scheduledDate: lead.scheduledDate,
        timeSlot:      lead.timeSlot,
        address:       { line1: lead.address },
        basePrice:     lead.quotedAmount || 0,
        totalAmount:   lead.quotedAmount || 0,
        payment:       { method: 'cod', amount: lead.quotedAmount || 0 },
        source:        'admin',
        status:        'confirmed',
        adminNotes:    lead.notes || '',
      });
      lead.convertedBookingId = bookingCreated._id.toString();
    }

    await lead.save();

    let whatsappSent = false;
    let whatsappError = null;

    if (lead.phone) {
      const { sendText } = require('../utils/metaWhatsApp');
      const phoneNumberId = process.env.SOFASHINE_PHONE_NUMBER_ID;
      const token         = process.env.SOFASHINE_META_TOKEN;

      if (phoneNumberId && token) {
        const toPhone = normalizePhone(lead.phone);
        const dateStr = lead.scheduledDate
          ? new Date(lead.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : '';
        const msg =
          `✅ *Booking Confirmed!*\n\n` +
          `Namaste *${lead.name}*! 🙏\n\n` +
          `Aapki booking confirm ho gayi hai.\n\n` +
          `🧹 Service: ${lead.serviceInterest || 'Cleaning Service'}\n` +
          (dateStr ? `📅 Date: ${dateStr}\n` : '') +
          (lead.timeSlot ? `🕐 Time: ${lead.timeSlot}\n` : '') +
          (lead.address ? `📍 Address: ${lead.address}\n` : '') +
          `💰 Amount: ₹${lead.quotedAmount}\n\n` +
          `Hamaari team aapke paas pahunchegi.\n` +
          `Koi sawaal ho toh hume yahan message karein. 🙏\n\n` +
          `_Thank you for choosing SofaShine!_`;

        try {
          await sendText(toPhone, msg, phoneNumberId, token);
          whatsappSent = true;
        } catch (err) {
          const errData = err.response?.data?.error;
          whatsappError = errData?.message || err.message;
          console.error(`[CONFIRM] WhatsApp send failed to ${toPhone}:`, errData || err.message);
        }
      }
    }

    res.json({ success: true, data: lead, whatsappSent, whatsappError, bookingCreated: !!bookingCreated });
  } catch (err) {
    next(err);
  }
};

const convertToBooking = async (req, res, next) => {
  try {
    const Booking = require('../models/Booking');
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (lead.convertedBookingId) {
      return res.status(400).json({ success: false, message: 'Booking already created for this lead' });
    }

    const {
      scheduledDate = lead.scheduledDate,
      timeSlot      = lead.timeSlot,
      address       = lead.address,
      staffId,
      adminNotes,
    } = req.body;

    if (!scheduledDate || !timeSlot || !address) {
      return res.status(400).json({ success: false, message: 'scheduledDate, timeSlot, and address are required' });
    }

    const booking = await Booking.create({
      customerName:  lead.name,
      customerEmail: '',
      customerPhone: lead.phone,
      serviceLabel:  lead.serviceInterest || 'Cleaning Service',
      scheduledDate,
      timeSlot,
      address:       { line1: address },
      basePrice:     lead.quotedAmount || 0,
      totalAmount:   lead.quotedAmount || 0,
      payment:       { method: 'cod', amount: lead.quotedAmount || 0 },
      source:        'admin',
      bookedBy:      req.user._id,
      status:        'confirmed',
      adminNotes:    adminNotes || lead.notes || '',
      ...(staffId && { assignedStaff: staffId }),
    });

    lead.stage              = 'booked';
    lead.convertedBookingId = booking._id.toString();
    if (!lead.scheduledDate && scheduledDate) lead.scheduledDate = scheduledDate;
    if (!lead.timeSlot && timeSlot)           lead.timeSlot      = timeSlot;
    if (!lead.address && address)             lead.address       = address;
    await lead.save();

    res.json({ success: true, data: { lead, booking } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getLeads, createLead, updateLead, archiveLead, restoreLead, getLeadStats, createWebsiteLead, confirmLead, convertToBooking };
