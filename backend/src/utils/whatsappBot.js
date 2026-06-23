const Conversation = require('../models/Conversation');
const Lead         = require('../models/Lead');
const { sendText, sendButtons, sendList } = require('./metaWhatsApp');
const { getAvailableSlots } = require('./slotManager');

// ── Business config ───────────────────────────────────────────────────────────
const sofaShineConfig = {
  id:    'sofashine',
  name:  'SofaShine',
  token: () => process.env.SOFASHINE_META_TOKEN,
  services: [
    { id: 'Sofa Cleaning',     emoji: '🛋️' },
    { id: 'Carpet Cleaning',   emoji: '🏠' },
    { id: 'Mattress Cleaning', emoji: '🛏️' },
    { id: 'Chair Cleaning',    emoji: '🪑' },
  ],
  subServices: {
    'Sofa Cleaning':     [
      { id: '2 Seater',  price: 499  },
      { id: '3 Seater',  price: 699  },
      { id: 'L-Shape',   price: 999  },
    ],
    'Carpet Cleaning':   [
      { id: 'Small (up to 4x6 ft)',   price: 499  },
      { id: 'Medium (up to 6x9 ft)',  price: 799  },
      { id: 'Large (above 6x9 ft)',   price: 1199 },
    ],
    'Mattress Cleaning': [
      { id: 'Single Mattress', price: 399 },
      { id: 'Double Mattress', price: 599 },
      { id: 'King Size',       price: 799 },
    ],
    'Chair Cleaning':    [
      { id: '1 Chair',  price: 299 },
      { id: '2 Chairs', price: 499 },
      { id: '4 Chairs', price: 799 },
    ],
  },
};

const BUSINESSES = {
  [process.env.SOFASHINE_PHONE_NUMBER_ID]: sofaShineConfig,
  '1245560968629574': sofaShineConfig, // Meta test number (Step 1 try it out)
  [process.env.CLEANCRUISERS_PHONE_NUMBER_ID]: {
    id:    'cleancruisers',
    name:  'CleanCruisers',
    token: () => process.env.CLEANCRUISERS_META_TOKEN,
    services: [
      { id: 'One-Time Wash',    emoji: '🚗' },
      { id: 'Waterless Clean',  emoji: '💧' },
      { id: 'Premium Add-ons',  emoji: '✨' },
      { id: 'Complete Care',    emoji: '🏆' },
    ],
    subServices: {
      'One-Time Wash':   [
        { id: 'Hatchback - Exterior',        price: 349 },
        { id: 'Hatchback - Both',            price: 449 },
        { id: 'Sedan - Exterior',            price: 349 },
        { id: 'Sedan - Both',                price: 499 },
        { id: 'SUV - Exterior',              price: 399 },
        { id: 'SUV - Both',                  price: 549 },
      ],
      'Waterless Clean': [
        { id: 'Hatchback', price: 349 },
        { id: 'Sedan',     price: 399 },
        { id: 'SUV',       price: 449 },
      ],
      'Complete Care':   [
        { id: 'Hatchback (3x washes)', price: 1399 },
        { id: 'Sedan (3x washes)',     price: 1499 },
        { id: 'SUV (3x washes)',       price: 1599 },
      ],
      'Premium Add-ons': [
        { id: 'Interior Deep Clean',  price: 799  },
        { id: 'Engine Bay Clean',     price: 599  },
        { id: 'Seat Shampooing',      price: 999  },
      ],
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getBusiness = (phoneNumberId) => BUSINESSES[phoneNumberId] || null;

const getOrCreate = async (customerPhone, businessId) => {
  let conv = await Conversation.findOne({ customerPhone, businessId });
  if (!conv) {
    conv = await Conversation.create({ customerPhone, businessId, step: 'AWAITING_SERVICE' });
  }
  return conv;
};

const save = async (conv, step, dataUpdate = {}) => {
  conv.step         = step;
  conv.data         = { ...conv.data, ...dataUpdate };
  conv.lastActivity = new Date();
  await conv.save();
};

// Parse date from customer text → returns Date | null
const parseDate = (text) => {
  const t   = text.trim().toLowerCase();
  const now = new Date();
  const ist = (d) => { d.setHours(d.getHours() + 5, d.getMinutes() + 30, 0, 0); return d; };

  if (t === 'aaj' || t === 'today' || t === '1')    return ist(new Date(now));
  if (t === 'kal' || t === 'tomorrow' || t === '2') { const d = new Date(now); d.setDate(d.getDate() + 1); return ist(d); }
  if (t === 'parson' || t === '3')                  { const d = new Date(now); d.setDate(d.getDate() + 2); return ist(d); }

  // DD/MM/YYYY or DD-MM-YYYY
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    const year = m[3] ? parseInt(m[3]) : now.getFullYear();
    const d    = new Date(year < 100 ? 2000 + year : year, parseInt(m[2]) - 1, parseInt(m[1]));
    if (!isNaN(d)) return d;
  }
  return null;
};

const fmtDate = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

// ── Step handlers ─────────────────────────────────────────────────────────────

const askService = async (to, biz, token) => {
  const rows = biz.services.map((s) => ({ id: s.id, title: `${s.emoji} ${s.id}` }));
  await sendList(to,
    `Namaste! 🙏 *${biz.name}* mein aapka swagat hai!\n\nKaunsi service chahiye aapko?`,
    'Services dekho',
    [{ title: 'Hamaari Services', rows }],
    process.env[`${biz.id.toUpperCase()}_PHONE_NUMBER_ID`],
    token
  );
};

const askSubService = async (to, biz, service, phoneNumberId, token) => {
  const subs = biz.subServices[service] || [];
  const rows = subs.map((s) => ({
    id:          s.id,
    title:       s.id.substring(0, 24),
    description: `₹${s.price}`,
  }));
  await sendList(to,
    `*${service}* ke liye konsa option chahiye?`,
    'Option select karo',
    [{ title: service, rows }],
    phoneNumberId,
    token
  );
};

const askDate = async (to, phoneNumberId, token) => {
  await sendButtons(to,
    '📅 Kab chahiye service?',
    [
      { id: 'aaj',    title: '⚡ Aaj' },
      { id: 'kal',    title: '🌅 Kal' },
      { id: 'parson', title: '📆 Parson' },
    ],
    phoneNumberId, token
  );
  await sendText(to, 'Ya koi aur date type karein — DD/MM/YYYY format mein (jaise 25/06/2025)', phoneNumberId, token);
};

const askTime = async (to, date, phoneNumberId, token) => {
  const slots   = await getAvailableSlots(date);
  const avail   = slots.filter((s) => s.available);

  if (!avail.length) {
    await sendText(to, `😔 ${fmtDate(date)} ke liye koi slot available nahi hai.\n\nKoi aur date select karein:`, phoneNumberId, token);
    await sendButtons(to, 'Date select karo:',
      [{ id: 'kal', title: '🌅 Kal' }, { id: 'parson', title: '📆 Parson' }, { id: 'other_date', title: '📆 Aur date' }],
      phoneNumberId, token
    );
    return false;
  }

  const rows = avail.map((s) => ({
    id:          s.slot,
    title:       s.slot,
    description: `${s.workersAvailable} worker${s.workersAvailable !== 1 ? 's' : ''} available`,
  }));

  await sendList(to,
    `🕐 *${fmtDate(date)}* ke liye available slots:`,
    'Slot select karo',
    [{ title: 'Time Slots', rows }],
    phoneNumberId, token
  );
  return true;
};

const askAddress = async (to, phoneNumberId, token) => {
  await sendText(to,
    '📍 Apna *complete address* bhejein\n\nYa location pin share karein 📌\n\n_(Ghar no., gali, area, landmark — sab likho)_',
    phoneNumberId, token
  );
};

const askName = async (to, phoneNumberId, token) => {
  await sendText(to, '👤 Aapka naam kya hai?', phoneNumberId, token);
};

const sendConfirm = async (to, data, bizName, phoneNumberId, token) => {
  const summary =
    `✅ *Booking Summary — ${bizName}*\n\n` +
    `🧹 Service: ${data.service} — ${data.subService}\n` +
    `📅 Date: ${fmtDate(data.date)}\n` +
    `🕐 Time: ${data.timeSlot}\n` +
    `📍 Address: ${data.address}\n` +
    `👤 Name: ${data.name}\n` +
    `💰 Amount: ₹${data.quotedAmount}\n\n` +
    `_Amount on-site verify hoga — yeh estimated price hai._`;

  await sendButtons(to, summary,
    [
      { id: 'CONFIRM_YES', title: '✅ Confirm' },
      { id: 'CONFIRM_NO',  title: '❌ Cancel' },
    ],
    phoneNumberId, token
  );
};

const sendBookingDone = async (to, name, bizName, phoneNumberId, token) => {
  await sendText(to,
    `🎉 *Booking request receive ho gayi, ${name}!*\n\n` +
    `Hamaari team jald aapko confirm karegi.\n\n` +
    `Koi sawaal ho toh hume message karein.\n\n` +
    `_Thank you for choosing ${bizName}!_ 🙏`,
    phoneNumberId, token
  );
};

// ── Main handler ──────────────────────────────────────────────────────────────

const handleIncoming = async ({ from, text, msgType, businessPhone }) => {
  // Identify business from incoming phone number ID (passed as businessPhone = metadata.phone_number_id)
  const biz = getBusiness(businessPhone);
  if (!biz) {
    console.warn(`[BOT] Unknown phoneNumberId: ${businessPhone}`);
    return;
  }

  const token         = biz.token();
  const phoneNumberId = businessPhone;

  if (!token) {
    console.warn(`[BOT] No token configured for ${biz.name}`);
    return;
  }

  const conv = await getOrCreate(from, biz.id);

  // "restart" keyword resets conversation
  if (text.toLowerCase() === 'restart' || text.toLowerCase() === 'hi' || text.toLowerCase() === 'hello' || text.toLowerCase() === 'namaste') {
    await Conversation.deleteOne({ _id: conv._id });
    const fresh = await getOrCreate(from, biz.id);
    await askService(from, biz, token);
    await save(fresh, 'AWAITING_SERVICE');
    return;
  }

  switch (conv.step) {

    case 'AWAITING_SERVICE': {
      const match = biz.services.find(
        (s) => s.id.toLowerCase() === text.toLowerCase() || text === s.id
      );
      if (!match) {
        await askService(from, biz, token);
        break;
      }
      await save(conv, 'AWAITING_SUBSERVICE', { service: match.id });
      await askSubService(from, biz, match.id, phoneNumberId, token);
      break;
    }

    case 'AWAITING_SUBSERVICE': {
      const subs   = biz.subServices[conv.data.service] || [];
      const match  = subs.find((s) => s.id.toLowerCase() === text.toLowerCase() || s.id === text);
      if (!match) {
        await askSubService(from, biz, conv.data.service, phoneNumberId, token);
        break;
      }
      await save(conv, 'AWAITING_DATE', { subService: match.id, quotedAmount: match.price });
      await askDate(from, phoneNumberId, token);
      break;
    }

    case 'AWAITING_DATE': {
      const date = parseDate(text);
      if (!date) {
        await sendText(from, '⚠️ Date samajh nahi aaya. Kripya DD/MM/YYYY format mein likhein, jaise: *25/06/2025*', phoneNumberId, token);
        break;
      }
      await save(conv, 'AWAITING_TIME', { date });
      const ok = await askTime(from, date, phoneNumberId, token);
      if (!ok) await save(conv, 'AWAITING_DATE');
      break;
    }

    case 'AWAITING_TIME': {
      // text should be a valid slot string like "10:00 AM - 12:00 PM"
      const slots = await getAvailableSlots(conv.data.date);
      const match = slots.find((s) => s.slot === text && s.available);
      if (!match) {
        await sendText(from, '⚠️ Yeh slot available nahi hai. Neeche se ek aur select karein:', phoneNumberId, token);
        await askTime(from, conv.data.date, phoneNumberId, token);
        break;
      }
      await save(conv, 'AWAITING_ADDRESS', { timeSlot: text });
      await askAddress(from, phoneNumberId, token);
      break;
    }

    case 'AWAITING_ADDRESS': {
      let address = text;
      // If customer shared location pin
      if (text.startsWith('__LOCATION__:')) {
        const coords = text.replace('__LOCATION__:', '');
        address = `GPS: https://maps.google.com/?q=${coords}`;
      }
      if (address.trim().length < 5) {
        await sendText(from, '⚠️ Address thoda aur detail mein likhein please.', phoneNumberId, token);
        break;
      }
      await save(conv, 'AWAITING_NAME', { address });
      await askName(from, phoneNumberId, token);
      break;
    }

    case 'AWAITING_NAME': {
      if (text.trim().length < 2) {
        await sendText(from, '⚠️ Naam likhein please.', phoneNumberId, token);
        break;
      }
      await save(conv, 'AWAITING_CONFIRM', { name: text.trim() });
      await sendConfirm(from, { ...conv.data, name: text.trim() }, biz.name, phoneNumberId, token);
      break;
    }

    case 'AWAITING_CONFIRM': {
      if (text === 'CONFIRM_YES' || text.toLowerCase() === 'confirm' || text === '1') {
        // Create lead in DB
        await Lead.create({
          name:            conv.data.name,
          phone:           from,
          serviceInterest: `${conv.data.service} — ${conv.data.subService}`,
          quotedAmount:    conv.data.quotedAmount,
          notes:           `Date: ${fmtDate(conv.data.date)}\nTime: ${conv.data.timeSlot}\nAddress: ${conv.data.address}`,
          source:          'whatsapp',
          stage:           'new',
        });

        await save(conv, 'COMPLETED');
        await sendBookingDone(from, conv.data.name, biz.name, phoneNumberId, token);
        console.log(`[BOT] ✅ Lead created — ${conv.data.name} (${from}) — ${biz.name}`);

      } else if (text === 'CONFIRM_NO' || text.toLowerCase() === 'cancel' || text === '2') {
        await Conversation.deleteOne({ _id: conv._id });
        await sendText(from, '❌ Booking cancel kar di gayi. Dobara book karne ke liye "Hi" likhein.', phoneNumberId, token);

      } else {
        await sendConfirm(from, conv.data, biz.name, phoneNumberId, token);
      }
      break;
    }

    case 'COMPLETED': {
      await sendText(from,
        `Aapki booking already confirmed hai! 🎉\n\nNayi booking ke liye *"Hi"* likhein.`,
        phoneNumberId, token
      );
      break;
    }

    default:
      await askService(from, biz, token);
      await save(conv, 'AWAITING_SERVICE');
  }
};

module.exports = { handleIncoming };
