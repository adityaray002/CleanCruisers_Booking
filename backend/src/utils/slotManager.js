const Booking = require('../models/Booking');
const Staff = require('../models/Staff');

const TIME_SLOTS = [
  '08:00 AM - 10:00 AM',
  '10:00 AM - 12:00 PM',
  '12:00 PM - 02:00 PM',
  '02:00 PM - 04:00 PM',
  '04:00 PM - 06:00 PM',
  '06:00 PM - 08:00 PM',
];

const getDayBounds = (date) => {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end   = new Date(date); end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Workers available for a given calendar day (respects date overrides + day-of-week schedule)
const getWorkersAvailableForDay = async (date) => {
  const dayOfWeek = new Date(date).getDay();
  const dateStr   = new Date(date).toDateString();
  const staff     = await Staff.find({ isActive: true }).lean();

  return staff.filter((s) => {
    const override = s.dateOverrides?.find((o) => new Date(o.date).toDateString() === dateStr);
    if (override !== undefined) return override.isAvailable;
    return s.availability?.some((a) => a.dayOfWeek === dayOfWeek && a.isAvailable);
  });
};

// Workers available for a specific slot — day-available AND not already booked in that slot
const getWorkersAvailableForSlot = async (date, timeSlot) => {
  const { start, end } = getDayBounds(date);

  const dayWorkers = await getWorkersAvailableForDay(date);
  if (!dayWorkers.length) return [];

  const bookedIds = await Booking.distinct('assignedStaff', {
    scheduledDate: { $gte: start, $lte: end },
    timeSlot,
    status: { $nin: ['cancelled'] },
    assignedStaff: { $ne: null },
  });

  const bookedSet = new Set(bookedIds.map((id) => id?.toString()).filter(Boolean));
  return dayWorkers.filter((w) => !bookedSet.has(w._id.toString()));
};

// All 6 slots with worker-aware availability for a given date
const getAvailableSlots = async (date) => {
  const { start, end } = getDayBounds(date);

  const dayWorkers = await getWorkersAvailableForDay(date);
  const workerCapacity = dayWorkers.length;

  const existingBookings = await Booking.find({
    scheduledDate: { $gte: start, $lte: end },
    status: { $nin: ['cancelled'] },
  }).select('timeSlot assignedStaff');

  // Count bookings per slot
  const slotCounts = {};
  existingBookings.forEach((b) => {
    slotCounts[b.timeSlot] = (slotCounts[b.timeSlot] || 0) + 1;
  });

  const now     = new Date();
  const isToday = start.toDateString() === now.toDateString();

  return TIME_SLOTS.map((slot) => {
    const count  = slotCounts[slot] || 0;
    // Slot is full when every available worker already has a booking in it
    const maxCapacity = Math.max(workerCapacity, 1);
    const isFull = count >= maxCapacity;

    let isPast = false;
    if (isToday) {
      const slotHour = parseInt(slot.split(':')[0], 10);
      isPast = now.getHours() >= slotHour;
    }

    const noWorkers = workerCapacity === 0;

    return {
      slot,
      available: !isFull && !isPast && !noWorkers,
      count,
      maxCapacity,
      workersAvailable: Math.max(maxCapacity - count, 0),
      reason: noWorkers
        ? 'No staff available today'
        : isFull
          ? 'All workers booked for this slot'
          : isPast
            ? 'Slot has passed'
            : null,
    };
  });
};

// Check if a specific slot still has room (at least one free worker)
const isSlotAvailable = async (date, timeSlot) => {
  const workers = await getWorkersAvailableForSlot(date, timeSlot);
  return workers.length > 0;
};

const isValidBookingDate = (date) => {
  const bookingDate = new Date(date);
  const now         = new Date();
  const minDate     = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hrs ahead
  const maxDate     = new Date(now);
  maxDate.setDate(maxDate.getDate() + 90);
  return bookingDate >= minDate && bookingDate <= maxDate;
};

module.exports = {
  TIME_SLOTS,
  getAvailableSlots,
  isSlotAvailable,
  isValidBookingDate,
  getWorkersAvailableForDay,
  getWorkersAvailableForSlot,
};
