const cron = require('node-cron');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const Subscription = require('../models/Subscription');
const Lead = require('../models/Lead');
const { sendWinBackMessage } = require('./notifications');
const { sendText } = require('./metaWhatsApp');
const { isSlotAvailable } = require('./slotManager');

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

// ─── Subscription reminder job — runs every day at 9:00 AM IST ───────────────
// Finds active subscriptions due tomorrow, creates leads + sends WhatsApp reminder
const getPhoneConfig = (businessId) => {
  if (businessId === 'sofashine') {
    return { phoneNumberId: process.env.SOFASHINE_PHONE_NUMBER_ID, token: process.env.SOFASHINE_META_TOKEN };
  }
  return { phoneNumberId: process.env.CLEANCRUISERS_PHONE_NUMBER_ID, token: process.env.CLEANCRUISERS_META_TOKEN };
};

const getNextDueDate = (frequency, fromDate) => {
  const d = new Date(fromDate);
  if (frequency === 'weekly')   d.setDate(d.getDate() + 7);
  if (frequency === 'biweekly') d.setDate(d.getDate() + 14);
  if (frequency === 'monthly')  d.setMonth(d.getMonth() + 1);
  return d;
};

const fmtDateIST = (d) =>
  new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

const subscriptionJob = cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] ⏰ Running subscription reminder job...');
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow); start.setHours(0, 0, 0, 0);
    const end   = new Date(tomorrow); end.setHours(23, 59, 59, 999);

    const dueSubs = await Subscription.find({
      status: 'active',
      nextDueDate: { $gte: start, $lte: end },
    });

    if (!dueSubs.length) {
      console.log('[CRON] ✅ No subscriptions due tomorrow.');
      return;
    }

    console.log(`[CRON] 📋 ${dueSubs.length} subscription(s) due tomorrow`);

    for (const sub of dueSubs) {
      const { phoneNumberId, token } = getPhoneConfig(sub.businessId);
      const dueDate = new Date(sub.nextDueDate);

      // 1. Check slot availability if preferredTime is set
      let slotAvailable = true;
      let conflictWarning = '';
      if (sub.preferredTime) {
        slotAvailable = await isSlotAvailable(dueDate, sub.preferredTime).catch(() => true);
        if (!slotAvailable) {
          conflictWarning = `\n⚠️ SLOT CONFLICT: "${sub.preferredTime}" is full! Admin action needed.`;
          console.warn(`[CRON] ⚠️ Slot conflict for ${sub.name} on ${fmtDateIST(dueDate)} at ${sub.preferredTime}`);
        }
      }

      // 2. Create lead — 'follow_up' stage if conflict so admin sees it immediately
      await Lead.create({
        name:            sub.name,
        phone:           sub.phone,
        serviceInterest: sub.service,
        quotedAmount:    sub.price,
        source:          'whatsapp',
        stage:           slotAvailable ? 'new' : 'follow_up',
        notes:           `📦 Subscription (${sub.frequency})\n📅 Due: ${fmtDateIST(dueDate)}\n🕐 ${sub.preferredTime || 'Flexible'}\n📍 ${sub.address || ''}${conflictWarning}`,
      });

      // 3. Send WhatsApp reminder to customer
      if (phoneNumberId && token) {
        const msg = slotAvailable
          ? `Namaste *${sub.name}*! 🙏\n\nKal aapki *${sub.service}* service scheduled hai! ✨\n\n📅 Date: ${fmtDateIST(dueDate)}\n${sub.preferredTime ? `🕐 Time: ${sub.preferredTime}\n` : ''}${sub.address ? `📍 ${sub.address}\n` : ''}\nHamaari team kal pahunchegi. 🙏\n\n_Thank you for choosing us!_`
          : `Namaste *${sub.name}*! 🙏\n\nKal aapki *${sub.service}* service scheduled hai.\n\n📅 Date: ${fmtDateIST(dueDate)}\n\nHamaari team aapke preferred time slot ki confirm karti hai — please thodi der mein hum aapko exact time batayenge. 🙏`;

        await sendText(sub.phone, msg, phoneNumberId, token)
          .catch((err) => console.error(`[CRON] WhatsApp reminder failed for ${sub.phone}:`, err.message));
      }

      // 4. Advance nextDueDate to next cycle
      await Subscription.findByIdAndUpdate(sub._id, {
        nextDueDate:      getNextDueDate(sub.frequency, sub.nextDueDate),
        lastReminderSent: new Date(),
      });

      console.log(`[CRON] ✅ Sub processed — ${sub.name} | slot: ${slotAvailable ? 'OK' : 'CONFLICT'}`);
    }
  } catch (err) {
    console.error('[CRON] ❌ Subscription job error:', err.message);
  }
}, { timezone: 'Asia/Kolkata' });

module.exports = { winBackJob, reminderJob, subscriptionJob };
