// ─── WhatsApp wa.me deep-link helper ─────────────────────────────────────────
// Builds pre-filled message URLs and opens WhatsApp Web / mobile app.
// No API key, no quota, no cost. Admin reviews the message and taps Send.

const SERVICE_NAME = 'CleanCruisers & SofaShine';

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

const formatDateShort = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

// Convert 10-digit or 12-digit Indian number to E.164 (no +)
const toE164 = (phone) => {
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned;
  if (cleaned.length === 10) return `91${cleaned}`;
  return cleaned;
};

// Open WhatsApp with a pre-filled message (new tab)
export const openWhatsApp = (phone, message) => {
  const url = `https://wa.me/${toE164(phone)}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

// ─── Message builders (mirror backend notifications.js templates) ─────────────

export const buildWorkerAssignmentMsg = (booking) => {
  const worker = booking.assignedStaff;
  return (
    `📋 *New Job Assigned* — ${SERVICE_NAME}\n\n` +
    `Hello ${worker.name},\n\n` +
    `You have a new booking!\n\n` +
    `🆔 *ID:* ${booking.bookingId}\n` +
    `🧹 *Service:* ${booking.serviceLabel}\n` +
    (booking.customServiceDescription ? `📝 *Details:* ${booking.customServiceDescription}\n` : '') +
    `📅 *Date:* ${formatDate(booking.scheduledDate)}\n` +
    `⏰ *Time:* ${booking.timeSlot}\n` +
    `👤 *Customer:* ${booking.customerName}\n` +
    `📞 *Phone:* ${booking.customerPhone}\n` +
    `📍 *Address:* ${booking.address?.line1}` +
    (booking.address?.line2 ? `, ${booking.address.line2}` : '') +
    `, ${booking.address?.city}` +
    (booking.address?.pincode ? ` - ${booking.address.pincode}` : '') +
    (booking.address?.landmark ? `\n🏷️ *Landmark:* ${booking.address.landmark}` : '') + '\n' +
    `💰 *Amount:* ${booking.totalAmount === 0 ? 'TBD — admin will confirm' : `₹${booking.totalAmount}`}\n` +
    `💳 *Payment:* ${booking.payment?.method === 'cod' ? 'Collect cash' : 'Already paid online'}\n` +
    (booking.workerNotes ? `\n⚠️ *NOTES:*\n${booking.workerNotes}\n` : '') +
    `\nBe on time. Call admin if any issue.\n\n_${SERVICE_NAME}_`
  );
};

export const buildWorkerDayScheduleMsg = (worker, bookings, date) => {
  if (!bookings.length) {
    return (
      `📅 *Schedule — ${formatDateShort(date)}* — ${SERVICE_NAME}\n\n` +
      `Hi ${worker.name},\n\nYou have *no bookings* today. Enjoy your day off! 😊\n\n_${SERVICE_NAME}_`
    );
  }

  const jobLines = bookings
    .map((b, i) =>
      `*Job ${i + 1}:*\n` +
      `⏰ ${b.timeSlot}\n` +
      `🧹 ${b.serviceLabel}\n` +
      `👤 ${b.customerName} · 📞 ${b.customerPhone}\n` +
      `📍 ${b.address?.line1}${b.address?.landmark ? ` (${b.address.landmark})` : ''}, ${b.address?.city}\n` +
      `💰 ${b.totalAmount === 0 ? 'Amount TBD' : `₹${b.totalAmount} (${b.payment?.method === 'cod' ? 'Cash' : 'Paid'})`}` +
      (b.workerNotes ? `\n⚠️ ${b.workerNotes}` : '')
    )
    .join('\n\n');

  return (
    `📅 *Your Schedule — ${formatDateShort(date)}* — ${SERVICE_NAME}\n\n` +
    `Hi ${worker.name},\n\nYou have *${bookings.length} job${bookings.length > 1 ? 's' : ''}* today:\n\n` +
    `─────────────────\n${jobLines}\n─────────────────\n\n` +
    `Have a great day! Contact admin if any issues.\n\n_${SERVICE_NAME}_`
  );
};

export const buildWorkerPingMsg = (worker, booking, customMessage) => {
  let message =
    `📢 *Message from Admin* — ${SERVICE_NAME}\n\n` +
    `Hi ${worker.name},\n\n` +
    customMessage + '\n\n';

  if (booking) {
    message +=
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Job Details*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🆔 *Booking ID:* ${booking.bookingId}\n` +
      `🧹 *Service:* ${booking.serviceLabel}\n` +
      (booking.customServiceDescription ? `📝 *Details:* ${booking.customServiceDescription}\n` : '') +
      `📅 *Date:* ${formatDate(booking.scheduledDate)}\n` +
      `⏰ *Time:* ${booking.timeSlot}\n\n` +
      `👤 *Customer:* ${booking.customerName}\n` +
      `📞 *Phone:* ${booking.customerPhone}\n` +
      `📍 *Address:* ${booking.address?.line1}` +
      (booking.address?.line2 ? `, ${booking.address.line2}` : '') +
      `, ${booking.address?.city}` +
      (booking.address?.pincode ? ` - ${booking.address.pincode}` : '') +
      (booking.address?.landmark ? `\n🏷️ *Landmark:* ${booking.address.landmark}` : '') + '\n\n' +
      `💰 *Amount:* ${booking.totalAmount === 0 ? 'TBD' : `₹${booking.totalAmount}`}\n` +
      `💳 *Payment:* ${booking.payment?.method === 'cod' ? 'Collect cash from customer' : 'Already paid online'}\n` +
      (booking.workerNotes ? `\n⚠️ *Worker Notes:*\n${booking.workerNotes}\n` : '') +
      `\n`;
  }

  message += `_${SERVICE_NAME}_`;
  return message;
};
