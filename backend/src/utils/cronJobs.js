const cron = require('node-cron');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const { sendWinBackMessage } = require('./notifications');

const WIN_BACK_DAYS = 30;  // send message after 30 days of no booking
const MAX_PER_RUN   = 20;  // don't blast everyone at once — max 20 per day

// ─── Win-back job — runs every day at 10:00 AM ───────────────────────────────
const winBackJob = cron.schedule('0 10 * * *', async () => {
  console.log('[CRON] ⏰ Running win-back job...');

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - WIN_BACK_DAYS);

    // Find customers whose last booking was before the cutoff
    const inactivePhones = await Booking.aggregate([
      {
        $group: {
          _id: '$customerPhone',
          name: { $first: '$customerName' },
          phone: { $first: '$customerPhone' },
          lastBooking: { $max: '$scheduledDate' },
        },
      },
      { $match: { lastBooking: { $lte: cutoff } } },
      { $limit: MAX_PER_RUN },
    ]);

    if (!inactivePhones.length) {
      console.log('[CRON] ✅ No inactive customers today.');
      return;
    }

    console.log(`[CRON] 📋 Found ${inactivePhones.length} inactive customers — sending win-back messages...`);

    let sent = 0;
    let failed = 0;

    for (const customer of inactivePhones) {
      // Skip if already tagged as 'lost'
      const profile = await Customer.findOne({ phone: customer.phone });
      if (profile?.tags?.includes('lost')) continue;

      const result = await sendWinBackMessage(customer);
      if (result?.success) {
        sent++;
        // Auto-tag as 'at-risk' so you can see them in the Customers page
        await Customer.findOneAndUpdate(
          { phone: customer.phone },
          { $addToSet: { tags: 'at-risk' } },
          { upsert: true }
        );
      } else {
        failed++;
      }
    }

    console.log(`[CRON] ✅ Win-back done — sent: ${sent}, failed: ${failed}`);
  } catch (err) {
    console.error('[CRON] ❌ Win-back job error:', err.message);
  }
}, {
  timezone: 'Asia/Kolkata',
});

// ─── Booking reminder job — runs every day at 8:00 AM ────────────────────────
// Sends "reminder: your clean is tomorrow" to customers booked for the next day
const { sendBookingReminder } = require('./notifications');

const reminderJob = cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] ⏰ Running booking reminder job...');

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow.setHours(0, 0, 0, 0));
    const end   = new Date(tomorrow.setHours(23, 59, 59, 999));

    const bookings = await Booking.find({
      scheduledDate: { $gte: start, $lte: end },
      status: { $in: ['confirmed', 'pending'] },
      'notifications.reminderSent': false,
    }).populate('assignedStaff', 'name phone');

    if (!bookings.length) {
      console.log('[CRON] ✅ No reminders needed today.');
      return;
    }

    console.log(`[CRON] 📋 Sending reminders for ${bookings.length} bookings tomorrow...`);

    for (const booking of bookings) {
      const result = await sendBookingReminder(booking);
      if (result?.success) {
        await booking.updateOne({ 'notifications.reminderSent': true });
      }
    }

    console.log('[CRON] ✅ Reminders sent.');
  } catch (err) {
    console.error('[CRON] ❌ Reminder job error:', err.message);
  }
}, {
  timezone: 'Asia/Kolkata',
});

module.exports = { winBackJob, reminderJob };
