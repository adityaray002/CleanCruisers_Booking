const https = require('https');

const SERVICE_NAME = 'CleanCruisers & SofaShine';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPhone = (phone) => {
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned;
  if (cleaned.length === 10) return `91${cleaned}`;
  return cleaned;
};

// Green API chatId format: 919876543210@c.us
const toChatId = (phone) => `${formatPhone(phone)}@c.us`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

const formatDateShort = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

// Returns a Google Maps link line if coordinates were captured, otherwise empty
const mapsLine = (address) => {
  const { lat, lng } = address?.coordinates || {};
  if (lat && lng) return `\n🗺️ *Live Location:* https://maps.google.com/?q=${lat},${lng}`;
  return '';
};

// ─── Green API — Free WhatsApp ────────────────────────────────────────────────
// Sign up at green-api.com (free), create instance, scan QR with your WhatsApp.
// Set GREEN_API_INSTANCE_ID and GREEN_API_TOKEN in .env

const greenApiReady = () => {
  const id    = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  return id && token
    && !id.includes('your_instance')
    && !token.includes('your_api');
};

const sendWhatsApp = (phone, message) => {
  return new Promise((resolve) => {
    if (!greenApiReady()) {
      console.warn(`[WHATSAPP ⚠️] Green API not configured. Add GREEN_API_INSTANCE_ID and GREEN_API_TOKEN to .env`);
      console.warn(`[WHATSAPP LOG] → ${phone}: ${message.slice(0, 80)}…`);
      return resolve({ success: false, reason: 'Green API not configured' });
    }

    const instanceId = process.env.GREEN_API_INSTANCE_ID;
    const apiToken   = process.env.GREEN_API_TOKEN;
    const body = JSON.stringify({ chatId: toChatId(phone), message });

    const options = {
      hostname: 'api.green-api.com',
      path:     `/waInstance${instanceId}/sendMessage/${apiToken}`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.idMessage) {
            console.log(`[WHATSAPP ✅] Sent to ${phone} (id: ${json.idMessage})`);
            resolve({ success: true, id: json.idMessage });
          } else {
            // Parse a human-readable reason from the Green API response
            const invokeStatus = json?.invokeStatus || {};
            const apiDesc = invokeStatus.description || json?.message || '';
            const isQuota = invokeStatus.status === 'QUOTE_ALLOWED'
              || apiDesc.toLowerCase().includes('quota');
            const reason = isQuota
              ? 'WhatsApp monthly quota exceeded — upgrade your Green API plan at green-api.com'
              : apiDesc || `Green API error (HTTP ${res.statusCode})`;
            console.error(`[WHATSAPP ❌] ${reason} — phone: ${phone}`);
            resolve({ success: false, reason, raw: data.slice(0, 300) });
          }
        } catch {
          console.error(`[WHATSAPP ❌] Green API parse error:`, data.slice(0, 200));
          resolve({ success: false, reason: 'Green API returned an unexpected response', raw: data.slice(0, 200) });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[WHATSAPP ❌] Network error for ${phone}:`, err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(body);
    req.end();
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const sendBookingConfirmation = async (booking) => {
  const message =
    `✅ *Booking Confirmed!* — ${SERVICE_NAME}\n\n` +
    `Hi ${booking.customerName},\n\n` +
    `Your booking is confirmed!\n\n` +
    `📋 *ID:* ${booking.bookingId}\n` +
    `🧹 *Service:* ${booking.serviceLabel}\n` +
    `📅 *Date:* ${formatDate(booking.scheduledDate)}\n` +
    `⏰ *Time:* ${booking.timeSlot}\n` +
    `📍 *Address:* ${booking.address.line1}, ${booking.address.city}\n` +
    `💰 *Amount:* ${booking.totalAmount === 0 ? 'To be confirmed' : `₹${booking.totalAmount}`}\n` +
    `💳 *Payment:* ${booking.payment?.method === 'cod' ? 'Cash on Delivery' : 'Online'}\n\n` +
    `We'll be there on time! 🙌\n\n_${SERVICE_NAME}_`;
  return await sendWhatsApp(booking.customerPhone, message);
};

const sendBookingReminder = async (booking) => {
  const staffName = booking.assignedStaff?.name || 'our team';
  const message =
    `⏰ *Reminder — Service Tomorrow!* — ${SERVICE_NAME}\n\n` +
    `Hi ${booking.customerName},\n\n` +
    `Your cleaning is scheduled for *tomorrow*.\n\n` +
    `📋 *ID:* ${booking.bookingId}\n` +
    `🧹 *Service:* ${booking.serviceLabel}\n` +
    `📅 *Date:* ${formatDate(booking.scheduledDate)}\n` +
    `⏰ *Time:* ${booking.timeSlot}\n` +
    `👤 *Cleaner:* ${staffName}\n\n` +
    `Please ensure someone is home!\n\n_${SERVICE_NAME}_`;
  return await sendWhatsApp(booking.customerPhone, message);
};

const sendCustomerBookingUpdate = async (booking, changes) => {
  const message =
    `✏️ *Booking Updated* — ${SERVICE_NAME}\n\n` +
    `Hi ${booking.customerName}, your booking *${booking.bookingId}* has been updated.\n\n` +
    (changes.scheduledDate ? `📅 *New Date:* ${formatDate(changes.scheduledDate)}\n` : '') +
    (changes.timeSlot ? `⏰ *New Time:* ${changes.timeSlot}\n` : '') +
    (changes.status ? `📌 *Status:* ${changes.status.replace('_', ' ')}\n` : '') +
    `\n🧹 *Service:* ${booking.serviceLabel}\n` +
    `📍 *Address:* ${booking.address.line1}, ${booking.address.city}\n\n_${SERVICE_NAME}_`;
  return await sendWhatsApp(booking.customerPhone, message);
};

const sendCustomerCancellation = async (booking, reason) => {
  const message =
    `❌ *Booking Cancelled* — ${SERVICE_NAME}\n\n` +
    `Hi ${booking.customerName},\n\n` +
    `Your booking *${booking.bookingId}* has been cancelled.\n\n` +
    `🧹 *Service:* ${booking.serviceLabel}\n` +
    `📅 *Was:* ${formatDate(booking.scheduledDate)} · ${booking.timeSlot}\n` +
    (reason ? `📝 *Reason:* ${reason}\n` : '') +
    `\nTo book again, visit our website or call us.\n\n_${SERVICE_NAME}_`;
  return await sendWhatsApp(booking.customerPhone, message);
};

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const sendWorkerAssignment = async (booking) => {
  const worker = booking.assignedStaff;
  if (!worker?.phone) return { success: false, reason: 'No worker phone' };

  const message =
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
    `📍 *Address:* ${booking.address.line1}` +
    (booking.address.line2 ? `, ${booking.address.line2}` : '') +
    `, ${booking.address.city}` +
    (booking.address.pincode ? ` - ${booking.address.pincode}` : '') +
    (booking.address.landmark ? `\n🏷️ *Landmark:* ${booking.address.landmark}` : '') +
    mapsLine(booking.address) + '\n' +
    `💰 *Amount:* ${booking.totalAmount === 0 ? 'TBD — admin will confirm' : `₹${booking.totalAmount}`}\n` +
    `💳 *Payment:* ${booking.payment?.method === 'cod' ? 'Collect cash' : 'Already paid online'}\n` +
    (booking.workerNotes ? `\n⚠️ *NOTES:*\n${booking.workerNotes}\n` : '') +
    `\nBe on time. Call admin if any issue.\n\n_${SERVICE_NAME}_`;

  return await sendWhatsApp(worker.phone, message);
};

const sendWorkerBookingUpdate = async (booking, changes, changedFields) => {
  const worker = booking.assignedStaff;
  if (!worker?.phone) return { success: false, reason: 'No worker phone' };

  const changeLines = [];
  if (changedFields.includes('scheduledDate')) changeLines.push(`📅 *New Date:* ${formatDate(changes.scheduledDate)}`);
  if (changedFields.includes('timeSlot'))      changeLines.push(`⏰ *New Time:* ${changes.timeSlot}`);
  if (changedFields.includes('status'))        changeLines.push(`📌 *Status:* ${changes.status.replace('_', ' ')}`);
  if (changedFields.includes('workerNotes'))   changeLines.push(`⚠️ *Updated Notes:* ${changes.workerNotes}`);
  if (changedFields.includes('totalAmount'))   changeLines.push(`💰 *Updated Amount:* ₹${changes.totalAmount}`);

  const message =
    `✏️ *Booking Updated* — ${SERVICE_NAME}\n\n` +
    `Hi ${worker.name}, booking *${booking.bookingId}* has changed:\n\n` +
    changeLines.join('\n') + '\n\n' +
    `👤 *Customer:* ${booking.customerName}\n` +
    `📞 *Phone:* ${booking.customerPhone}\n` +
    `📍 *Address:* ${booking.address.line1}, ${booking.address.city}\n\n_${SERVICE_NAME}_`;

  return await sendWhatsApp(worker.phone, message);
};

const sendWorkerCancellation = async (booking) => {
  const worker = booking.assignedStaff;
  if (!worker?.phone) return { success: false, reason: 'No worker phone' };

  const message =
    `❌ *Job Cancelled* — ${SERVICE_NAME}\n\n` +
    `Hi ${worker.name},\n\n` +
    `This job has been *CANCELLED*:\n\n` +
    `🆔 *ID:* ${booking.bookingId}\n` +
    `🧹 *Service:* ${booking.serviceLabel}\n` +
    `📅 *Was:* ${formatDate(booking.scheduledDate)} · ${booking.timeSlot}\n` +
    `👤 *Customer:* ${booking.customerName}\n\n` +
    `This slot is now free. Admin will update your schedule.\n\n_${SERVICE_NAME}_`;

  return await sendWhatsApp(worker.phone, message);
};

const sendWorkerReschedule = async (booking, oldDate, oldSlot) => {
  const worker = booking.assignedStaff;
  if (!worker?.phone) return { success: false, reason: 'No worker phone' };

  const message =
    `🔄 *Job Rescheduled* — ${SERVICE_NAME}\n\n` +
    `Hi ${worker.name}, booking *${booking.bookingId}* rescheduled:\n\n` +
    `❌ *Old:* ${formatDateShort(oldDate)} · ${oldSlot}\n` +
    `✅ *New:* ${formatDateShort(booking.scheduledDate)} · ${booking.timeSlot}\n\n` +
    `🧹 *Service:* ${booking.serviceLabel}\n` +
    `👤 *Customer:* ${booking.customerName}\n` +
    `📞 *Phone:* ${booking.customerPhone}\n` +
    `📍 *Address:* ${booking.address.line1}, ${booking.address.city}` +
    mapsLine(booking.address) + '\n' +
    (booking.workerNotes ? `\n⚠️ *Notes:* ${booking.workerNotes}\n` : '') +
    `\n_${SERVICE_NAME}_`;

  return await sendWhatsApp(worker.phone, message);
};

const sendWorkerOvertimeAlert = async (worker, booking, nextBooking) => {
  if (!worker?.phone) return { success: false, reason: 'No worker phone' };

  const message =
    `⏱️ *You are RUNNING LATE!* — ${SERVICE_NAME}\n\n` +
    `Hi ${worker.name},\n\n` +
    `Your current job has gone past the scheduled end time!\n\n` +
    `📋 *Current:* ${booking.serviceLabel} (${booking.customerName})\n` +
    `⏰ *Was supposed to end:* ${booking.timeSlot.split(' - ')[1]}\n\n` +
    (nextBooking
      ? `⚠️ *NEXT BOOKING IS WAITING:*\n` +
        `🧹 ${nextBooking.serviceLabel}\n` +
        `👤 ${nextBooking.customerName} · 📞 ${nextBooking.customerPhone}\n` +
        `📍 ${nextBooking.address?.line1}, ${nextBooking.address?.city}` +
        mapsLine(nextBooking.address) + '\n' +
        `⏰ Slot: ${nextBooking.timeSlot}\n\n` +
        `Please inform admin about the delay!\n`
      : `Please wrap up and inform admin.\n`) +
    `\n_${SERVICE_NAME}_`;

  return await sendWhatsApp(worker.phone, message);
};

const sendWorkerDaySchedule = async (worker, bookings, date) => {
  if (!worker?.phone) return { success: false, reason: 'No worker phone' };

  if (!bookings.length) {
    const message =
      `📅 *Schedule — ${formatDateShort(date)}* — ${SERVICE_NAME}\n\n` +
      `Hi ${worker.name},\n\nYou have *no bookings* today. Enjoy your day off! 😊\n\n_${SERVICE_NAME}_`;
    return await sendWhatsApp(worker.phone, message);
  }

  const jobLines = bookings.map((b, i) =>
    `*Job ${i + 1}:*\n` +
    `⏰ ${b.timeSlot}\n` +
    `🧹 ${b.serviceLabel}\n` +
    `👤 ${b.customerName} · 📞 ${b.customerPhone}\n` +
    `📍 ${b.address.line1}${b.address.landmark ? ` (${b.address.landmark})` : ''}, ${b.address.city}` +
    mapsLine(b.address) + '\n' +
    `💰 ${b.totalAmount === 0 ? 'Amount TBD' : `₹${b.totalAmount} (${b.payment?.method === 'cod' ? 'Cash' : 'Paid'})`}` +
    (b.workerNotes ? `\n⚠️ ${b.workerNotes}` : '')
  ).join('\n\n');

  const message =
    `📅 *Your Schedule — ${formatDateShort(date)}* — ${SERVICE_NAME}\n\n` +
    `Hi ${worker.name},\n\nYou have *${bookings.length} job${bookings.length > 1 ? 's' : ''}* today:\n\n` +
    `─────────────────\n${jobLines}\n─────────────────\n\n` +
    `Have a great day! Contact admin if any issues.\n\n_${SERVICE_NAME}_`;

  return await sendWhatsApp(worker.phone, message);
};

const sendWorkerManualPing = async (worker, booking, customMessage) => {
  if (!worker?.phone) return { success: false, reason: 'No worker phone' };

  let message =
    `📢 *Message from Admin* — ${SERVICE_NAME}\n\n` +
    `Hi ${worker.name},\n\n` +
    customMessage + '\n\n';

  // If a booking is attached, append full job details
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
      (booking.address?.landmark ? `\n🏷️ *Landmark:* ${booking.address.landmark}` : '') +
      mapsLine(booking.address) + '\n\n' +
      `💰 *Amount:* ${booking.totalAmount === 0 ? 'TBD' : `₹${booking.totalAmount}`}\n` +
      `💳 *Payment:* ${booking.payment?.method === 'cod' ? 'Collect cash from customer' : 'Already paid online'}\n` +
      (booking.workerNotes ? `\n⚠️ *Worker Notes:*\n${booking.workerNotes}\n` : '') +
      `\n`;
  }

  message += `_${SERVICE_NAME}_`;
  return await sendWhatsApp(worker.phone, message);
};

// ─── Legacy alias ─────────────────────────────────────────────────────────────
const sendStaffAssignment = sendWorkerAssignment;

module.exports = {
  sendBookingConfirmation,
  sendBookingReminder,
  sendCustomerBookingUpdate,
  sendCustomerCancellation,
  sendWorkerAssignment,
  sendWorkerBookingUpdate,
  sendWorkerCancellation,
  sendWorkerReschedule,
  sendWorkerOvertimeAlert,
  sendWorkerDaySchedule,
  sendWorkerManualPing,
  sendStaffAssignment,
  sendNotification: sendWhatsApp,
};
