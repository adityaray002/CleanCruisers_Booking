const Booking = require('../models/Booking');

// Available time slots
const TIME_SLOTS = [
  '08:00 AM - 10:00 AM',
  '10:00 AM - 12:00 PM',
  '12:00 PM - 02:00 PM',
  '02:00 PM - 04:00 PM',
  '04:00 PM - 06:00 PM',
  '06:00 PM - 08:00 PM',
];

// Max bookings per slot per day
const MAX_BOOKINGS_PER_SLOT = 3;

/**
 * Get available slots for a given date
 */
const getAvailableSlots = async (date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get all active bookings for the day
  const existingBookings = await Booking.find({
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    status: { $nin: ['cancelled'] },
  }).select('timeSlot');

  // Count bookings per slot
  const slotCounts = {};
  existingBookings.forEach((b) => {
    slotCounts[b.timeSlot] = (slotCounts[b.timeSlot] || 0) + 1;
  });

  // Build availability response
  const now = new Date();
  const isToday = startOfDay.toDateString() === now.toDateString();

  return TIME_SLOTS.map((slot) => {
    const count = slotCounts[slot] || 0;
    const isFull = count >= MAX_BOOKINGS_PER_SLOT;

    // Disable past slots for today
    let isPast = false;
    if (isToday) {
      const slotHour = parseInt(slot.split(':')[0]);
      isPast = now.getHours() >= slotHour;
    }

    return {
      slot,
      available: !isFull && !isPast,
      count,
      maxCapacity: MAX_BOOKINGS_PER_SLOT,
      reason: isFull ? 'Slot fully booked' : isPast ? 'Slot has passed' : null,
    };
  });
};

/**
 * Check if a specific slot is available
 */
const isSlotAvailable = async (date, timeSlot) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const count = await Booking.countDocuments({
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    timeSlot,
    status: { $nin: ['cancelled'] },
  });

  return count < MAX_BOOKINGS_PER_SLOT;
};

/**
 * Validate booking date is not in the past and within booking window
 */
const isValidBookingDate = (date) => {
  const bookingDate = new Date(date);
  const now = new Date();
  const maxAdvance = new Date();
  maxAdvance.setDate(maxAdvance.getDate() + 90); // 90 days in advance

  // At least 2 hours from now
  const minDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  return bookingDate >= minDate && bookingDate <= maxAdvance;
};

module.exports = {
  TIME_SLOTS,
  MAX_BOOKINGS_PER_SLOT,
  getAvailableSlots,
  isSlotAvailable,
  isValidBookingDate,
};
