const Staff = require('../models/Staff');
const Booking = require('../models/Booking');
const { sendWorkerDaySchedule, sendWorkerManualPing } = require('../utils/notifications');

// ── Slot overlap helpers ──────────────────────────────────────────────────────
// Convert "08:30 AM" → minutes since midnight
const timeToMins = (t) => {
  if (!t) return 0;
  const [timePart, period] = t.trim().split(' ');
  const [hStr, mStr] = timePart.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};
// "08:00 AM - 10:00 AM" → { start: 480, end: 600 }
const slotToRange = (slot) => {
  const parts = (slot || '').split(' - ');
  return { start: timeToMins(parts[0]), end: timeToMins(parts[1]) };
};
// Two slots overlap when one starts before the other ends (open-interval: touching is NOT a clash)
const slotsOverlap = (a, b) => {
  const ra = slotToRange(a);
  const rb = slotToRange(b);
  return ra.start < rb.end && rb.start < ra.end;
};

// @desc    Get all staff
const getStaff = async (req, res, next) => {
  try {
    const { active } = req.query;
    const filter = {};
    if (active !== undefined) filter.isActive = active === 'true';
    const staff = await Staff.find(filter).sort({ name: 1 });
    res.json({ success: true, count: staff.length, data: staff });
  } catch (err) { next(err); }
};

// @desc    Get single staff member
const getStaffMember = async (req, res, next) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });
    res.json({ success: true, data: staff });
  } catch (err) { next(err); }
};

// @desc    Create staff member
const createStaff = async (req, res, next) => {
  try {
    const staff = await Staff.create(req.body);
    res.status(201).json({ success: true, data: staff });
  } catch (err) { next(err); }
};

// @desc    Update staff member
const updateStaff = async (req, res, next) => {
  try {
    const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });
    res.json({ success: true, data: staff });
  } catch (err) { next(err); }
};

// @desc    Soft-delete staff member
const deleteStaff = async (req, res, next) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });
    staff.isActive = false;
    await staff.save();
    res.json({ success: true, message: 'Staff member deactivated' });
  } catch (err) { next(err); }
};

// @desc    Get all staff with availability status for a specific date + timeSlot
// @route   GET /api/staff/slots?date=YYYY-MM-DD&timeSlot=08:00 AM - 10:00 AM
// Used by admin new-booking form to show who is free/busy at that exact slot
const getStaffBySlot = async (req, res, next) => {
  try {
    const { date, timeSlot } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

    const dayOfWeek = new Date(date).getDay();

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const allStaff = await Staff.find({ isActive: true }).sort({ name: 1 });

    // Fetch ALL bookings for that day in one query — used for both overlap check and day load
    const allDayBookings = await Booking.find({
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['cancelled'] },
    }).select('assignedStaff customerName serviceLabel timeSlot status').lean();

    // staffBookingMap: staffId → bookings whose slot OVERLAPS with the requested timeSlot
    // (exact match is wrong — "10 AM-1 PM" and "10 AM-11 AM" overlap even though strings differ)
    const staffBookingMap = {};
    const dayLoadMap = {};
    allDayBookings.forEach((b) => {
      if (!b.assignedStaff) return;
      const key = b.assignedStaff.toString();

      // day load — every booking counts
      if (!dayLoadMap[key]) dayLoadMap[key] = [];
      dayLoadMap[key].push(b);

      // clash check — only bookings that overlap with the requested slot
      if (timeSlot && slotsOverlap(timeSlot, b.timeSlot)) {
        if (!staffBookingMap[key]) staffBookingMap[key] = [];
        staffBookingMap[key].push(b);
      }
    });

    const result = allStaff.map((s) => {
      const id = s._id.toString();
      const worksOnDay = s.availability?.some(
        (a) => a.dayOfWeek === dayOfWeek && a.isAvailable
      );
      const slotBookingsForStaff = staffBookingMap[id] || [];
      const busyAtSlot = timeSlot ? slotBookingsForStaff.length > 0 : false;
      const dayLoad = dayLoadMap[id] || [];

      return {
        _id: s._id,
        name: s.name,
        phone: s.phone,
        rating: s.rating,
        worksOnDay,
        busyAtSlot,
        slotBooking: busyAtSlot ? slotBookingsForStaff[0] : null,
        dayLoad: dayLoad.length,
        dayBookings: dayLoad,
      };
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// @desc    Legacy: get available staff for a date (day-level check)
const getAvailableStaff = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

    const dayOfWeek = new Date(date).getDay();
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);

    const allStaff = await Staff.find({
      isActive: true,
      'availability.dayOfWeek': dayOfWeek,
      'availability.isAvailable': true,
    });

    const bookedIds = await Booking.distinct('assignedStaff', {
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['cancelled'] },
    });

    const available = allStaff.filter(
      (s) => !bookedIds.some((id) => id && id.toString() === s._id.toString())
    );

    res.json({ success: true, count: available.length, data: available });
  } catch (err) { next(err); }
};

// @desc  Send day schedule to a worker via WhatsApp
// @route POST /api/staff/:id/notify-schedule?date=YYYY-MM-DD
const sendDaySchedule = async (req, res, next) => {
  try {
    const worker = await Staff.findById(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Staff member not found' });

    const date = req.query.date || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(date); endOfDay.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      assignedStaff: worker._id,
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['cancelled'] },
    }).sort({ timeSlot: 1 }).lean();

    const result = await sendWorkerDaySchedule(worker, bookings, new Date(date));
    res.json({
      success: true,
      sent: result.success,
      message: result.success
        ? `Schedule sent to ${worker.name}`
        : result.reason || 'Failed to send WhatsApp message',
      jobCount: bookings.length,
    });
  } catch (err) { next(err); }
};

// @desc  Send a manual ping / custom message to a worker
// @route POST /api/staff/:id/notify  { message, bookingId? }
const notifyWorker = async (req, res, next) => {
  try {
    const worker = await Staff.findById(req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Staff member not found' });

    const { message, bookingId } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId).lean();
    }

    const result = await sendWorkerManualPing(worker, booking, message.trim());
    res.json({
      success: true,
      sent: result.success,
      message: result.success
        ? `Message sent to ${worker.name}`
        : result.reason || 'Failed to send WhatsApp message',
    });
  } catch (err) { next(err); }
};

module.exports = {
  getStaff, getStaffMember, createStaff, updateStaff, deleteStaff,
  getStaffBySlot, getAvailableStaff,
  sendDaySchedule, notifyWorker,
};
