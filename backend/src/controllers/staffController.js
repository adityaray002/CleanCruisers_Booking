const Staff = require('../models/Staff');
const Booking = require('../models/Booking');
const { sendWorkerDaySchedule, sendWorkerManualPing } = require('../utils/notifications');

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

    // Get bookings for that day (and specific slot if provided)
    const slotFilter = {
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['cancelled'] },
    };
    if (timeSlot) slotFilter.timeSlot = timeSlot;

    const slotBookings = await Booking.find(slotFilter)
      .select('assignedStaff customerName serviceLabel timeSlot status')
      .lean();

    // Build a map: staffId -> booking (for the requested slot)
    const staffBookingMap = {};
    slotBookings.forEach((b) => {
      if (b.assignedStaff) {
        const key = b.assignedStaff.toString();
        if (!staffBookingMap[key]) staffBookingMap[key] = [];
        staffBookingMap[key].push(b);
      }
    });

    // Also get all day bookings per worker for daily load info
    const dayBookings = await Booking.find({
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['cancelled'] },
    }).select('assignedStaff timeSlot serviceLabel customerName').lean();

    const dayLoadMap = {};
    dayBookings.forEach((b) => {
      if (b.assignedStaff) {
        const key = b.assignedStaff.toString();
        if (!dayLoadMap[key]) dayLoadMap[key] = [];
        dayLoadMap[key].push(b);
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
