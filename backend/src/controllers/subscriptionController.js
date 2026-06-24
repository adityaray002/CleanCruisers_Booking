const Subscription = require('../models/Subscription');
const Lead = require('../models/Lead');
const { sendText } = require('../utils/metaWhatsApp');

const getNextDueDate = (frequency, fromDate) => {
  const d = new Date(fromDate);
  if (frequency === 'weekly')   d.setDate(d.getDate() + 7);
  if (frequency === 'biweekly') d.setDate(d.getDate() + 14);
  if (frequency === 'monthly')  d.setMonth(d.getMonth() + 1);
  return d;
};

const getAll = async (req, res, next) => {
  try {
    const { status, businessId } = req.query;
    const filter = {};
    if (status)     filter.status = status;
    if (businessId) filter.businessId = businessId;
    const subs = await Subscription.find(filter).sort({ nextDueDate: 1 });
    res.json({ success: true, count: subs.length, data: subs });
  } catch (err) { next(err); }
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

const getPhoneConfig = (businessId) => {
  if (businessId === 'sofashine') {
    return { phoneNumberId: process.env.SOFASHINE_PHONE_NUMBER_ID, token: process.env.SOFASHINE_META_TOKEN };
  }
  return { phoneNumberId: process.env.CLEANCRUISERS_PHONE_NUMBER_ID, token: process.env.CLEANCRUISERS_META_TOKEN };
};

const create = async (req, res, next) => {
  try {
    const { name, phone, service, address, preferredTime, frequency, price, startDate, businessId, notes } = req.body;
    if (!name || !phone || !service || !frequency || !startDate) {
      return res.status(400).json({ success: false, message: 'name, phone, service, frequency, startDate required' });
    }
    const biz = businessId || 'cleancruisers';
    const start = new Date(startDate);
    const nextDueDate = getNextDueDate(frequency, start);

    const sub = await Subscription.create({
      name, phone, service, address, preferredTime, frequency,
      price: price || 0, startDate: start, nextDueDate,
      businessId: biz, notes,
    });

    // Create first lead immediately for the startDate visit
    await Lead.create({
      name,
      phone,
      serviceInterest: service,
      quotedAmount:    price || 0,
      source:          'whatsapp',
      stage:           'new',
      notes:           `📦 Subscription (${frequency})\n📅 First visit: ${fmtDate(start)}\n🕐 ${preferredTime || 'Flexible'}\n📍 ${address || ''}`,
    });

    // WhatsApp confirmation to customer
    const { phoneNumberId, token } = getPhoneConfig(biz);
    if (phoneNumberId && token && phone) {
      const freqText = { weekly: 'har hafte', biweekly: 'har 2 hafte mein', monthly: 'har mahine' }[frequency] || frequency;
      const msg =
        `Namaste *${name}*! 🎉\n\n` +
        `Aapka *${service}* subscription confirm ho gaya!\n\n` +
        `📅 Pehli visit: ${fmtDate(start)}\n` +
        (preferredTime ? `🕐 Time: ${preferredTime}\n` : '') +
        (address ? `📍 Address: ${address}\n` : '') +
        `🔁 Schedule: ${freqText}\n` +
        (price ? `💰 Price: ₹${price}/visit\n` : '') +
        `\nHamaari team time pe pahunchegi. _Thank you!_ 🙏`;
      sendText(phone, msg, phoneNumberId, token)
        .catch((err) => console.error('[SUB] WhatsApp failed:', err.message));
    }

    res.status(201).json({ success: true, data: sub });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const sub = await Subscription.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found' });
    res.json({ success: true, data: sub });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const sub = await Subscription.findByIdAndDelete(req.params.id);
    if (!sub) return res.status(404).json({ success: false, message: 'Subscription not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { next(err); }
};

const getStats = async (req, res, next) => {
  try {
    const [total, byStatus] = await Promise.all([
      Subscription.countDocuments(),
      Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueSoon = await Subscription.countDocuments({
      status: 'active',
      nextDueDate: { $lte: new Date(tomorrow.setHours(23, 59, 59, 999)) },
    });
    const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    res.json({ success: true, data: { total, byStatus: statusMap, dueSoon } });
  } catch (err) { next(err); }
};

// Parse "11:00 AM - 12:00 PM" → { start: 660, end: 720 } (minutes from midnight)
const parseSlotMins = (slot) => {
  if (!slot) return null;
  const parts = slot.split(' - ');
  if (parts.length !== 2) return null;
  const toMins = (t) => {
    const [timePart, period] = t.trim().split(' ');
    const [h, m] = timePart.split(':').map(Number);
    let hours = h;
    if (period === 'PM' && h !== 12) hours += 12;
    if (period === 'AM' && h === 12) hours = 0;
    return hours * 60 + (m || 0);
  };
  return { start: toMins(parts[0]), end: toMins(parts[1]) };
};

// True if two time ranges overlap (touching at boundary = no overlap)
const slotsOverlap = (slotA, slotB) => {
  const a = parseSlotMins(slotA);
  const b = parseSlotMins(slotB);
  if (!a || !b) return false;
  return a.start < b.end && b.start < a.end;
};

const checkConflict = async (req, res, next) => {
  try {
    const { date, timeSlot } = req.query;
    if (!date || !timeSlot) return res.json({ success: true, data: { conflict: false, conflicts: [] } });

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Fetch all active subscriptions that have a preferredTime set
    const subs = await Subscription.find({ status: 'active', preferredTime: { $exists: true, $ne: '' } });

    const conflicts = [];
    for (const sub of subs) {
      // 1. Check if this subscription falls on targetDate
      const startDate = new Date(sub.startDate);
      startDate.setHours(0, 0, 0, 0);
      if (targetDate < startDate) continue;

      const diffDays = Math.round((targetDate - startDate) / (1000 * 60 * 60 * 24));
      let dateMatch = false;
      if (sub.frequency === 'weekly')   dateMatch = diffDays % 7 === 0;
      if (sub.frequency === 'biweekly') dateMatch = diffDays % 14 === 0;
      if (sub.frequency === 'monthly')  dateMatch = targetDate.getDate() === startDate.getDate();
      if (!dateMatch) continue;

      // 2. Check if the time ranges overlap (not just exact match)
      if (!slotsOverlap(sub.preferredTime, timeSlot)) continue;

      conflicts.push({ name: sub.name, phone: sub.phone, service: sub.service, frequency: sub.frequency, preferredTime: sub.preferredTime });
    }

    res.json({ success: true, data: { conflict: conflicts.length > 0, conflicts } });
  } catch (err) { next(err); }
};

module.exports = { getAll, create, update, remove, getStats, checkConflict };
