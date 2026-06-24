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
    { id: 'Home Cleaning',      emoji: '🛋️' },
    { id: 'Deep Cleaning',      emoji: '🏠' },
    { id: 'Appliance Cleaning', emoji: '🔧' },
    { id: 'Pest Control',       emoji: '🐜' },
  ],
  subServices: {
    'Home Cleaning': [
      { id: 'Sofa — 2 Seater',   price: 220 },
      { id: 'Sofa — 3 Seater',   price: 330 },
      { id: 'Sofa — L-Shape',    price: 550 },
      { id: 'Carpet — Small',    price: 299 },
      { id: 'Carpet — Medium',   price: 499 },
      { id: 'Carpet — Large',    price: 799 },
      { id: 'Bed Cleaning',      price: 149 },
      { id: 'Dining — 4 Chairs', price: 360 },
    ],
    'Deep Cleaning': [
      { id: 'Bathroom Cleaning', price: 299  },
      { id: 'Kitchen Cleaning',  price: 699  },
      { id: '1 BHK Full Home',   price: 2499 },
      { id: 'Office Deep Clean', price: 1999 },
    ],
    'Appliance Cleaning': [
      { id: 'Microwave',         price: 149 },
      { id: 'Gas Stove',         price: 99  },
      { id: 'Refrigerator',      price: 299 },
      { id: 'Ceiling Fan',       price: 59  },
      { id: 'Exhaust Fan',       price: 79  },
      { id: 'Kitchen Window',    price: 199 },
    ],
    'Pest Control': [
      { id: 'Pest Control',      price: 399 },
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
    `✨ *${biz.name}* — Expert Cleaning at Your Doorstep! 🙏\n\n` +
    `⚡ Same Day Service Available\n` +
    `🌿 Eco-Friendly | Safe for Family & Pets\n` +
    `💰 Transparent Pricing — No Hidden Charges\n` +
    `⭐ 4.9 Rated | 100% Satisfaction Guaranteed\n\n` +
    `Neeche se apni service select karein 👇`,
    'Services Dekho',
    [{ title: '🧹 Hamaari Services', rows }],
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
    `🧹 *${service}*\n\nApna option choose karein 👇\n_(Prices estimated hain — final on-site confirm hoga)_`,
    'Option Chunein',
    [{ title: service, rows }],
    phoneNumberId,
    token
  );
};

const askDate = async (to, phoneNumberId, token) => {
  await sendButtons(to,
    `📅 *Kab chahiye service?*\n\n` +
    `Neeche se select karein 👇\n` +
    `_(Koi aur date? Type karein: DD/MM/YYYY — jaise 28/06/2025)_`,
    [
      { id: 'aaj',    title: '⚡ Aaj (Today)' },
      { id: 'kal',    title: '🌅 Kal (Tomorrow)' },
      { id: 'parson', title: '📆 Parson' },
    ],
    phoneNumberId, token
  );
};

const askTime = async (to, date, phoneNumberId, token) => {
  const slots = await getAvailableSlots(date);
  const avail = slots.filter((s) => s.available);

  if (!avail.length) {
    await sendButtons(to,
      `😔 *${fmtDate(date)}* ke liye koi slot available nahi hai.\n\nKoi aur date try karein 👇`,
      [{ id: 'kal', title: '🌅 Kal' }, { id: 'parson', title: '📆 Parson' }, { id: 'other_date', title: '📆 Aur date' }],
      phoneNumberId, token
    );
    return false;
  }

  const rows = avail.map((s) => ({ id: s.slot, title: s.slot }));

  await sendList(to,
    `🕐 *${fmtDate(date)}* ke liye available time slots:\n\nApna preferred time choose karein 👇`,
    'Time Slot Chunein',
    [{ title: '⏰ Available Slots', rows }],
    phoneNumberId, token
  );
  return true;
};

const askAddress = async (to, phoneNumberId, token) => {
  await sendText(to,
    `📍 *Aapka address kya hai?*\n\n` +
    `Poora address likhein:\n` +
    `Flat/Ghar no. → Gali/Society → Area → City\n\n` +
    `_(Ya location pin share karein 📌)_`,
    phoneNumberId, token
  );
};

const askName = async (to, phoneNumberId, token) => {
  await sendText(to,
    `👤 *Aakhri step! Aapka naam kya hai?*\n\n_(Jaise: Rahul Sharma)_`,
    phoneNumberId, token
  );
};

const sendConfirm = async (to, data, bizName, phoneNumberId, token) => {
  const summary =
    `🧾 *Booking Details — ${bizName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🧹 *Service:* ${data.service}\n` +
    `   └ ${data.subService}\n` +
    `📅 *Date:* ${fmtDate(data.date)}\n` +
    `🕐 *Time:* ${data.timeSlot}\n` +
    `📍 *Address:* ${data.address}\n` +
    `👤 *Name:* ${data.name}\n` +
    `💰 *Estimated:* ₹${data.quotedAmount}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_Final amount on-site confirm hoga._\n\n` +
    `Sab sahi hai? Confirm karein 👇`;

  await sendButtons(to, summary,
    [
      { id: 'CONFIRM_YES', title: '✅ Confirm Booking' },
      { id: 'CONFIRM_NO',  title: '❌ Cancel' },
    ],
    phoneNumberId, token
  );
};

const sendBookingDone = async (to, name, bizName, phoneNumberId, token, data = {}) => {
  const summary = data.service
    ? `📋 *Booking Summary:*\n` +
      `🧹 ${data.service} — ${data.subService}\n` +
      `📅 ${fmtDate(data.date)}\n` +
      `🕐 ${data.timeSlot}\n` +
      `💰 Estimated: ₹${data.quotedAmount}\n` +
      `📍 ${data.address}\n\n` +
      `_Final amount on-site verify hoga._\n\n`
    : '';
  await sendText(to,
    `🎉 *Shukriya, ${name}! Booking mili!*\n\n` +
    summary +
    `Hamaari team *1 ghante mein* aapko confirm karegi. 📞\n\n` +
    `Koi sawaal? Yahan message karein — hum hain! 🙏\n\n` +
    `_${bizName} — Expert Cleaning at Your Doorstep_ ✨`,
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
      // Create partial lead immediately so drop-offs are visible to admin
      const partialLead = await Lead.create({
        name: 'Incomplete',
        phone: from,
        serviceInterest: match.id,
        source: 'whatsapp',
        stage: 'new',
        notes: 'WhatsApp bot — conversation in progress',
      });
      await save(conv, 'AWAITING_SUBSERVICE', { service: match.id, leadId: partialLead._id.toString() });
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
        const leadData = {
          name:            conv.data.name,
          serviceInterest: `${conv.data.service} — ${conv.data.subService}`,
          quotedAmount:    conv.data.quotedAmount,
          notes:           `Date: ${fmtDate(conv.data.date)}\nTime: ${conv.data.timeSlot}\nAddress: ${conv.data.address}`,
          stage:           'new',
        };
        if (conv.data.leadId) {
          await Lead.findByIdAndUpdate(conv.data.leadId, leadData);
        } else {
          await Lead.create({ ...leadData, phone: from, source: 'whatsapp' });
        }

        await save(conv, 'COMPLETED');
        await sendBookingDone(from, conv.data.name, biz.name, phoneNumberId, token, conv.data);
        console.log(`[BOT] ✅ Lead confirmed — ${conv.data.name} (${from}) — ${biz.name}`);

      } else if (text === 'CONFIRM_NO' || text.toLowerCase() === 'cancel' || text === '2') {
        if (conv.data.leadId) {
          await Lead.findByIdAndUpdate(conv.data.leadId, { stage: 'lost', notes: 'Customer cancelled during WhatsApp booking' });
        }
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
