const Conversation = require('../models/Conversation');
const Lead         = require('../models/Lead');
const Message      = require('../models/Message');
const { sendText: _sendText, sendButtons: _sendButtons, sendList: _sendList } = require('./metaWhatsApp');
const { getAvailableSlots } = require('./slotManager');

// ── Inbox message saving (outbound bot → WhatsApp Inbox) ─────────────────────
const _phoneBizMap = new Map();

const sendText = async (to, text, phoneNumberId, token) => {
  await _sendText(to, text, phoneNumberId, token);
  const bizId = _phoneBizMap.get(to);
  if (bizId) Message.create({ customerPhone: to, businessId: bizId, direction: 'outbound', text, sentBy: 'bot' }).catch(() => {});
};

const sendButtons = async (to, bodyText, buttons, phoneNumberId, token) => {
  await _sendButtons(to, bodyText, buttons, phoneNumberId, token);
  const bizId = _phoneBizMap.get(to);
  if (bizId) {
    const opts = buttons.map((b) => b.title).join(' · ');
    Message.create({ customerPhone: to, businessId: bizId, direction: 'outbound', text: `${bodyText}\n[${opts}]`, sentBy: 'bot', msgType: 'interactive' }).catch(() => {});
  }
};

const sendList = async (to, header, body, sections, phoneNumberId, token) => {
  await _sendList(to, header, body, sections, phoneNumberId, token);
  const bizId = _phoneBizMap.get(to);
  if (bizId) {
    const items = sections.flatMap((s) => s.rows?.map((r) => r.title) || []).join(', ');
    Message.create({ customerPhone: to, businessId: bizId, direction: 'outbound', text: `${header} — ${body} [${items}]`, sentBy: 'bot', msgType: 'interactive' }).catch(() => {});
  }
};

// ── Static content ────────────────────────────────────────────────────────────

const REVIEWS = [
  { name: 'Priya M., West Delhi',   star: '⭐⭐⭐⭐⭐', text: '"SofaShine ne mera 5-seater sofa bilkul naya kar diya! Team bohot professional thi. 100% recommend!"' },
  { name: 'Rohit K., Dwarka',   star: '⭐⭐⭐⭐⭐', text: '"Kitchen deep clean ekdum perfect. Eco-friendly chemicals use kiye, smell bhi nahi aayi. Bahut satisfied!"' },
  { name: 'Anita S., South Delhi', star: '⭐⭐⭐⭐⭐', text: '"Pay after service wali policy ne trust build kiya. Team time pe aayi, kaam excellent tha!"' },
  { name: 'Vikram T., Janakpuri',  star: '⭐⭐⭐⭐⭐', text: '"3 sofas + carpet sab ek din mein done. Price bhi fair tha. Definitely book karunga dobara!"' },
];

const AREAS_TEXT =
  `📍 *Hamare Service Areas*\n━━━━━━━━━━━━━━━\n\n` +
  `✅ *Noida:* Sector 18, 62, 63, 77, 78, 100, 137\n` +
  `✅ *Greater Noida:* Knowledge Park, Gamma, Beta\n` +
  `✅ *Gurgaon:* DLF, Sohna Road, Golf Course Ext\n` +
  `✅ *Delhi:* South, West, East, Central Delhi\n` +
  `✅ *Ghaziabad:* Indirapuram, Vaishali, Raj Nagar\n` +
  `✅ *Faridabad:* NIT, Sector 14, 21\n\n` +
  `🚀 _Apna area nahi dikh raha? Message karein — hum dekhenge!_ 🙏`;

const OFFERS_TEXT =
  `🎁 *Aaj Ke Special Offers!*\n━━━━━━━━━━━━━━━\n\n` +
  `🔥 *Bundle Deal:* Sofa + Mattress → *15% OFF*\n` +
  `🍳 *Kitchen + Bathroom:* Sirf ₹899 _(save ₹99)_\n` +
  `🆕 *Pehli Booking:* ₹100 instant discount\n` +
  `📅 *Weekday Special:* Mon-Thu → *10% extra off*\n` +
  `👨‍👩‍👧 *Refer & Earn:* ₹200 off per referral\n\n` +
  `⏰ _Offers limited time ke liye hain. Abhi book karein!_`;

const FAQ = {
  'Pricing & Payment': `💰 Rates market se 20% kam hain!\n\n🛋️ Sofa: ₹220 se shuru (2-seat)\n🛏️ Bed cleaning: ₹299 se\n🏠 Carpet: ₹300 se\n🚿 Bathroom: ₹350\n🪑 Dining chair: ₹80/chair\n\n💳 *Payment SIRF kaam complete hone ke baad!*\nCash, UPI, card — sab accept hota hai. Koi advance nahi!`,
  'How Long It Takes': `⏱️ *Service Duration:*\n\n🛋️ Sofa (2-3 seat): 1-1.5 ghanta\n🛏️ Mattress: 30-45 min\n🏠 Kitchen: 2-3 ghante\n🏡 Full 1 BHK: 4-5 ghante\n🏡 Full 2 BHK: 6-7 ghante\n\nHum time waaste nahi karte! ⚡`,
  'Chemicals & Safety': `🌿 *100% Eco-Friendly Chemicals*\n\nHamare products:\n✅ Bachon ke liye safe\n✅ Pets ke liye safe\n✅ Koi strong smell nahi\n✅ ISO certified cleaning agents\n✅ Surfaces damage nahi karte\n\nAap ghar mein reh sakte ho service ke dauran! 🏠`,
  'Cancellation Policy': `📋 *Flexible Cancellation:*\n\n✅ *2 ghante pehle:* Free cancel/reschedule\n⚠️ *1-2 ghante:* 50% cancellation fee\n❌ *Last minute:* Full charge\n\n_WhatsApp pe message karein — seedha response milega!_ 💬`,
  'Contact & Support': `📞 *Hamare Saath Baat Karein:*\n\n💬 WhatsApp: Is number pe message karein\n⏰ Response time: 15 minutes\n🕘 Hours: 9 AM – 9 PM, 7 days\n\n_Emergency? Seedha call karein — hum available hain!_ 🙏`,
};

// ── Business config ───────────────────────────────────────────────────────────

const sofaShineConfig = {
  id:      'sofashine',
  name:    'SofaShine',
  tagline: 'Expert Cleaning at Your Doorstep',
  token:   () => process.env.SOFASHINE_META_TOKEN,
  services: [
    { id: 'Sofa Cleaning',     emoji: '🛋️', desc: 'Sofa, Sofa Cum Bed, Ottoman, Table, Cushion' },
    { id: 'Bed Cleaning',      emoji: '🛏️', desc: 'Single bed ₹299 · Double bed ₹550' },
    { id: 'Bathroom Cleaning', emoji: '🚿', desc: 'Full bathroom deep clean — ₹350' },
    { id: 'Chairs & Items',    emoji: '🪑', desc: 'Dining chair, study chair, fan, mirror' },
    { id: 'Pest Control',      emoji: '🐜', desc: 'Cockroach, Ant & Insect Control' },
    { id: 'Other / Custom',    emoji: '💬', desc: 'Custom requirement — bata ke dekho!' },
  ],
  subServices: {
    // ── Sofa Cleaning: 4 regular + 3 cum bed + 3 extras = 10 rows (WhatsApp max) ──
    'Sofa Cleaning': [
      { id: 'Sofa — 2 Seats', price: 220, section: '🛋️ Regular Sofa', desc: 'Steam + stain treat + dry · ₹220' },
      { id: 'Sofa — 3 Seats', price: 330, section: '🛋️ Regular Sofa', desc: 'Steam + stain treat + dry · ₹330' },
      { id: 'Sofa — 4 Seats', price: 440, section: '🛋️ Regular Sofa', desc: 'Steam + stain treat + dry · ₹440' },
      { id: 'Sofa — 5+ Seats', price: 0, section: '🛋️ Regular Sofa',
        desc: '5=₹520 · 6=₹600 · 7=₹700 · 8=₹800 · 9=₹900 · 10+=₹100/seat',
        askCount: true, unitPrice: 100, priceMap: { 5: 520, 6: 600, 7: 700, 8: 800, 9: 900 } },
      { id: 'Sofa Cum Bed 1 Seat', price: 300, section: '🛋️ Sofa Cum Bed', desc: 'Full clean + dry · ₹300' },
      { id: 'Sofa Cum Bed 2 Seat', price: 450, section: '🛋️ Sofa Cum Bed', desc: 'Full clean + dry · ₹450' },
      { id: 'Sofa Cum Bed 3-4 Seat', price: 0, section: '🛋️ Sofa Cum Bed',
        desc: '3 seat=₹650 · 4 seat=₹850',
        askCount: true, unitPrice: 850, priceMap: { 3: 650, 4: 850 } },
      { id: 'Ottoman / Puffy',   price:  80, section: '🪑 Sofa Extras', desc: 'Clean + deodorize · ₹80/piece',   askQty: true },
      { id: 'Central Table',     price: 150, section: '🪑 Sofa Extras', desc: 'Surface clean + polish · ₹150' },
      { id: 'Cushion Cover',     price:  20, section: '🪑 Sofa Extras', desc: 'Cover wash + dry · ₹20/cover',    askQty: true },
    ],
    'Bed Cleaning': [
      { id: 'Single Bed', price: 299, desc: 'Steam + sanitize + dry · ₹299' },
      { id: 'Double Bed', price: 550, desc: 'Steam + sanitize + dry · ₹550' },
    ],
    'Bathroom Cleaning': [
      { id: 'Bathroom Deep Clean', price: 350, desc: 'Tiles + grout + fixtures + sanitize · ₹350' },
    ],
    'Chairs & Items': [
      { id: 'Dining Chair',  price:  80, section: '🪑 Chairs',      desc: 'Fabric clean + deodorize · ₹80/chair', askQty: true },
      { id: 'Study Chair',   price: 150, section: '🪑 Chairs',      desc: 'Full upholstery clean · ₹150/chair',   askQty: true },
      { id: 'Fan Cleaning',  price:  75, section: '🔧 Small Items', desc: 'Blades + housing clean · ₹75/fan',     askQty: true },
      { id: 'Mirror Cleaning', price: 50, section: '🔧 Small Items', desc: 'Streak-free clean · ₹50/mirror',      askQty: true },
    ],
    'Pest Control': [
      { id: 'Cockroach Control', price: 499, desc: 'Gel + spray + 3 month warranty · ₹499' },
      { id: 'Full Pest Control', price: 799, desc: 'All insects + rodent control · ₹799' },
      { id: 'Ant Treatment',     price: 349, desc: 'Bait + spray treatment · ₹349' },
    ],
  },
};

const cleanCruisersConfig = {
  id:    'cleancruisers',
  name:  'CleanCruisers',
  token: () => process.env.CLEANCRUISERS_META_TOKEN,
  services: [
    { id: 'One-Time Wash',   emoji: '🚗', desc: 'Exterior + Interior wash' },
    { id: 'Waterless Clean', emoji: '💧', desc: 'Eco waterless cleaning' },
    { id: 'Premium Add-ons', emoji: '✨', desc: 'Interior, engine, seat shampoo' },
    { id: 'Complete Care',   emoji: '🏆', desc: '3x bundle — save 20%' },
  ],
  subServices: {
    'One-Time Wash': [
      { id: 'Hatchback — Exterior', price: 349, desc: '₹349' },
      { id: 'Hatchback — Full',     price: 449, desc: '₹449' },
      { id: 'Sedan — Exterior',     price: 349, desc: '₹349' },
      { id: 'Sedan — Full',         price: 499, desc: '₹499' },
      { id: 'SUV — Exterior',       price: 399, desc: '₹399' },
      { id: 'SUV — Full',           price: 549, desc: '₹549' },
    ],
    'Waterless Clean': [
      { id: 'Hatchback', price: 349, desc: '₹349' },
      { id: 'Sedan',     price: 399, desc: '₹399' },
      { id: 'SUV',       price: 449, desc: '₹449' },
    ],
    'Complete Care': [
      { id: 'Hatchback (3x)', price: 1399, desc: '₹1399 — save ₹648' },
      { id: 'Sedan (3x)',     price: 1499, desc: '₹1499 — save ₹798' },
      { id: 'SUV (3x)',       price: 1599, desc: '₹1599 — save ₹798' },
    ],
    'Premium Add-ons': [
      { id: 'Interior Deep Clean', price: 799, desc: '₹799' },
      { id: 'Engine Bay Clean',    price: 599, desc: '₹599' },
      { id: 'Seat Shampooing',     price: 999, desc: '₹999' },
    ],
  },
};

const BUSINESSES = {
  [process.env.SOFASHINE_PHONE_NUMBER_ID]:     sofaShineConfig,
  '1245560968629574':                           sofaShineConfig, // Meta test number
  [process.env.CLEANCRUISERS_PHONE_NUMBER_ID]: cleanCruisersConfig,
};

// Upsell suggestion per service (shown after first item added to cart)
const UPSELL = {
  'Sofa Cleaning':     { emoji: '🛏️', text: 'Sofa ke saath Bed cleaning bhi add karein? Single bed sirf ₹299 mein! ✨' },
  'Bed Cleaning':      { emoji: '🛋️', text: 'Bed ke saath Sofa bhi clean karwayein? 2-seater sirf ₹220 mein — ekdum naya feel!' },
  'Bathroom Cleaning': { emoji: '🛋️', text: 'Bathroom ke saath Sofa cleaning bhi add karein? 2-seater ₹220 mein — ek trip, sab done!' },
  'Chairs & Items':    { emoji: '🛋️', text: 'Chairs ke saath Sofa bhi clean karein? 2-seater ₹220 mein — team already aa rahi hai!' },
  'Pest Control':      { emoji: '🏠', text: 'Sirf ₹300 extra mein full home pest control upgrade karein — cockroach + ants + all insects!' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getBusiness = (phoneNumberId) => BUSINESSES[phoneNumberId] || null;

const getOrCreate = async (customerPhone, businessId) => {
  let conv = await Conversation.findOne({ customerPhone, businessId });
  if (!conv) conv = await Conversation.create({ customerPhone, businessId, step: 'AWAITING_MAIN_MENU' });
  return conv;
};

const save = async (conv, step, dataUpdate = {}) => {
  conv.step         = step;
  conv.data         = { ...conv.data, ...dataUpdate };
  conv.lastActivity = new Date();
  await conv.save();
};

const parseDate = (text) => {
  const t   = text.trim().toLowerCase();
  const now = new Date();
  // Normalize IST date to midnight local for slot lookup
  const startOfDay = (d) => { d.setHours(0, 0, 0, 0); return d; };

  if (t === 'aaj'    || t === 'today'    || t === '1') return startOfDay(new Date(now));
  if (t === 'kal'    || t === 'tomorrow' || t === '2') { const d = new Date(now); d.setDate(d.getDate() + 1); return startOfDay(d); }
  if (t === 'parson' || t === '3')                     { const d = new Date(now); d.setDate(d.getDate() + 2); return startOfDay(d); }

  // DD/MM/YYYY or DD-MM-YYYY or DD/MM
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    const year = m[3] ? parseInt(m[3]) : now.getFullYear();
    const d    = new Date(year < 100 ? 2000 + year : year, parseInt(m[2]) - 1, parseInt(m[1]));
    if (!isNaN(d.getTime())) return startOfDay(d);
  }
  return null;
};

const fmtDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

// Cart helpers
const cartTotal  = (cart) => (cart || []).reduce((s, i) => s + (i.price || 0), 0);
const cartLines  = (cart) => (cart || []).map((i, idx) =>
  `  ${idx + 1}. ${i.subService}${i.quantity > 1 ? ` ×${i.quantity}` : ''} — ₹${i.price}`
).join('\n');

// Group time slots into Morning / Afternoon / Evening
const groupSlots = (slots) => {
  const g = { morning: [], afternoon: [], evening: [] };
  for (const s of (slots || []).filter((s) => s.available)) {
    const parts = s.slot.split(' ');           // ["10:00", "AM", "-", "12:00", "PM"]
    const hour  = parseInt(parts[0].split(':')[0]);
    const isPM  = parts[1] === 'PM';
    const h24   = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
    if (h24 < 12)      g.morning.push(s.slot);
    else if (h24 < 17) g.afternoon.push(s.slot);
    else               g.evening.push(s.slot);
  }
  return g;
};

// ── Welcome & main menu ───────────────────────────────────────────────────────

const sendWelcome = async (to, biz, phoneNumberId, token, isReturning = false) => {
  const greeting = isReturning
    ? `Wapas aaye! Hamare parivaar mein aapka swagat hai 🙏`
    : `Namaste! *${biz.name}* mein aapka swagat hai 🙏`;

  await sendText(to,
    `${greeting}\n\n` +
    `✨ *Premium Home Cleaning — ${biz.tagline || biz.name}*\n\n` +
    `*Hum kyun best choice hain?*\n` +
    `✅ Verified & Trained Professionals\n` +
    `🌿 100% Eco-Friendly — Safe for Kids & Pets\n` +
    `💳 Pay ONLY After Service Completed\n` +
    `💯 100% Satisfaction Guarantee\n` +
    `⭐ 4.9 Rating — 10,000+ Happy Customers`,
    phoneNumberId, token
  );

  await sendList(to,
    `Aaj hum aapki kya help kar sakte hain? 👇`,
    `Menu Kholein`,
    [
      {
        title: '🏠 Cleaning Services',
        rows: [
          { id: 'MENU_BOOK',   title: '🧹 Book Cleaning',  description: 'Service schedule karein' },
        //  { id: 'MENU_PRICE',  title: '💰 Price List',      description: 'Sabhi services ke rates' },
         // { id: 'MENU_OFFERS', title: '🎁 Today\'s Offers', description: 'Special discounts aaj' },
        ],
      },
      {
        title: '📋 More Info',
        rows: [
          { id: 'MENU_REVIEWS', title: '⭐ Customer Reviews',  description: 'Happy customers ki baat' },
        //  { id: 'MENU_AREAS',   title: '📍 Areas We Serve',   description: 'Coverage check karo' },
          { id: 'MENU_FAQ',     title: '❓ FAQ',               description: 'Common sawalon ke jawab' },
        ],
      },
      {
        title: '🤝 Help & Support',
        rows: [
          { id: 'MENU_EXPERT',   title: '💬 Talk to Expert',    description: 'Team se seedha baat karo' },
          { id: 'MENU_EXISTING', title: '📦 Existing Booking',  description: 'Track ya manage karein' },
        ],
      },
    ],
    phoneNumberId, token
  );
};

// ── Service selection ─────────────────────────────────────────────────────────

const askService = async (to, biz, phoneNumberId, token) => {
  const rows = biz.services.map((s) => ({
    id:          s.id,
    title:       `${s.emoji || ''} ${s.id}`.trim().substring(0, 24),
    description: s.desc || '',
  }));
  await sendList(to,
    `🧹 *Kaunsi service chahiye?*\n\n` +
    `🌿 Eco-friendly | 💳 Pay after service | ⭐ 4.9 rated\n` +
    `_Neeche se apni service chunein 👇_`,
    `Service Chunein`,
    [{ title: '✨ Available Services', rows }],
    phoneNumberId, token
  );
};

// ── Master Quick-Order (all services, text-based, one message) ────────────────

const SOFA_PRICES    = { 2: 220, 3: 330, 4: 440, 5: 520, 6: 600, 7: 700, 8: 800, 9: 900 };
const CUM_BED_PRICES = { 1: 300, 2: 450, 3: 650, 4: 850 };

// Last number in segment = quantity; for sofas, first number = seat count
const getQty = (seg) => {
  const nums = seg.match(/\d+/g);
  return nums ? Math.max(1, parseInt(nums[nums.length - 1])) : 1;
};

const parseMasterOrder = (rawText) => {
  const segments = rawText.toLowerCase().split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
  const items = [];

  for (const seg of segments) {
    // 1. Sofa Cum Bed — number = seat count (1-4 fixed price, 5+ = ₹200/seat)
    if (/sofa\s*cum\s*bed|cum\s*bed|\bscb\b/.test(seg)) {
      const n = parseInt(seg.match(/\d+/)?.[0]);
      if (n >= 1) {
        const price = CUM_BED_PRICES[n] ?? n * 200;
        items.push({ service: 'Sofa Cleaning', subService: `Sofa Cum Bed — ${n} Seat`, price, quantity: 1, unitPrice: price });
      }
      continue;
    }

    // 2. Regular Sofa — number = seat count (2-9 fixed price, 10+ = ₹100/seat)
    if (/\bsofa\b|\bseater\b/.test(seg)) {
      const n = parseInt(seg.match(/\d+/)?.[0]);
      if (n >= 2) {
        const price = SOFA_PRICES[n] ?? n * 100;
        items.push({ service: 'Sofa Cleaning', subService: `Sofa — ${n} Seats`, price, quantity: 1, unitPrice: price });
        continue;
      }
    }

    // 3. Ottoman / Puffy — number = quantity
    if (/ottoman|puffy|\bott\b/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Sofa Cleaning', subService: 'Ottoman / Puffy', price: 80 * qty, quantity: qty, unitPrice: 80 });
      continue;
    }

    // 4. Central Table — number = quantity
    if (/\btable\b/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Sofa Cleaning', subService: 'Central Table', price: 150 * qty, quantity: qty, unitPrice: 150 });
      continue;
    }

    // 5. Cushion Cover — number = quantity
    if (/cushion|cush/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Sofa Cleaning', subService: 'Cushion Cover', price: 20 * qty, quantity: qty, unitPrice: 20 });
      continue;
    }

    // 6. Double Bed — check before "single" to avoid partial match
    if (/double\s*bed|\bdouble\b/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Bed Cleaning', subService: 'Double Bed', price: 550 * qty, quantity: qty, unitPrice: 550 });
      continue;
    }

    // 7. Single Bed
    if (/single\s*bed|\bsingle\b/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Bed Cleaning', subService: 'Single Bed', price: 299 * qty, quantity: qty, unitPrice: 299 });
      continue;
    }

    // 8. Bathroom / Washroom — number = quantity (e.g. "bathroom 2" = 2 bathrooms)
    if (/bathroom|washroom|toilet/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Bathroom Cleaning', subService: 'Bathroom Deep Clean', price: 350 * qty, quantity: qty, unitPrice: 350 });
      continue;
    }

    // 9. Study Chair (check before "dining" to avoid partial matches)
    if (/study\s*chair|\bstudy\b|office\s*chair/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Chairs & Items', subService: 'Study Chair', price: 150 * qty, quantity: qty, unitPrice: 150 });
      continue;
    }

    // 10. Dining Chair
    if (/dining\s*chair|\bdining\b/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Chairs & Items', subService: 'Dining Chair', price: 80 * qty, quantity: qty, unitPrice: 80 });
      continue;
    }

    // 11. Fan
    if (/\bfan\b/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Chairs & Items', subService: 'Fan Cleaning', price: 75 * qty, quantity: qty, unitPrice: 75 });
      continue;
    }

    // 12. Mirror
    if (/mirror|aaina/.test(seg)) {
      const qty = getQty(seg);
      items.push({ service: 'Chairs & Items', subService: 'Mirror Cleaning', price: 50 * qty, quantity: qty, unitPrice: 50 });
      continue;
    }

    // 13. Pest Control — Cockroach
    if (/cockroach|keeday/.test(seg)) {
      items.push({ service: 'Pest Control', subService: 'Cockroach Control', price: 499, quantity: 1, unitPrice: 499 });
      continue;
    }

    // 14. Pest Control — Ant
    if (/\bant\b|chinti/.test(seg)) {
      items.push({ service: 'Pest Control', subService: 'Ant Treatment', price: 349, quantity: 1, unitPrice: 349 });
      continue;
    }

    // 15. Full Pest Control
    if (/full\s*pest|pest\s*control/.test(seg)) {
      items.push({ service: 'Pest Control', subService: 'Full Pest Control', price: 799, quantity: 1, unitPrice: 799 });
      continue;
    }
  }

  return items;
};

const sendMasterPriceCard = async (to, phoneNumberId, token) => {
  // Message 1 — detailed price list with service descriptions
  await sendText(to,
    `🧹 *SofaShine — Complete Price Menu* ✨\n` +
    `_💳 Pay sirf kaam ke baad · 🌿 Eco-friendly · ✅ Trained staff_\n\n` +

    `━━━━━━━━━━━━━━━━━━\n` +
    `🛋️ *SOFA CLEANING*\n` +
    `_Steam + daag hatao + deodorise · 2-4 hrs mein dry_\n` +
    `• sofa 2 seat  →  ₹220\n` +
    `• sofa 3 seat  →  ₹330\n` +
    `• sofa 4 seat  →  ₹440\n` +
    `• sofa 5 seat  →  ₹520\n` +
    `• sofa 6 seat  →  ₹600\n` +
    `• sofa 7 seat  →  ₹700\n` +
    `• sofa 8 seat  →  ₹800\n` +
    `• sofa 9 seat  →  ₹900\n` +
    `• sofa 10+ seat  →  ₹100/seat\n\n` +

    `🛋️ *SOFA CUM BED*\n` +
    `_Full sofa + bed clean · fresh & odour-free_\n` +
    `• scb 1 seat  →  ₹300\n` +
    `• scb 2 seat  →  ₹450\n` +
    `• scb 3 seat  →  ₹650\n` +
    `• scb 4 seat  →  ₹850\n\n` +

    `🪑 *SOFA EXTRAS*\n` +
    `_Cushions, table, accessories ki cleaning_\n` +
    `• ottoman  →  ₹80 / piece\n` +
    `• table    →  ₹150 / table\n` +
    `• cushion  →  ₹20 / cover\n\n` +

    `━━━━━━━━━━━━━━━━━━\n` +
    `🛏️ *BED CLEANING*\n` +
    `_UV sanitize + steam + mite removal · safe & fresh_\n` +
    `• single bed  →  ₹299\n` +
    `• double bed  →  ₹550\n\n` +

    `━━━━━━━━━━━━━━━━━━\n` +
    `🚿 *BATHROOM CLEANING*\n` +
    `_Tiles + grout + fixtures + complete sanitize_\n` +
    `• per bathroom  →  ₹350\n\n` +

    `━━━━━━━━━━━━━━━━━━\n` +
    `🪑 *CHAIRS & ITEMS*\n` +
    `_Fabric clean + deodorise + quick dry_\n` +
    `• dining chair  →  ₹80 / chair\n` +
    `• study chair   →  ₹150 / chair\n` +
    `• fan           →  ₹75 / fan\n` +
    `• mirror        →  ₹50 / mirror\n\n` +

    `━━━━━━━━━━━━━━━━━━\n` +
    `🐜 *PEST CONTROL*\n` +
    `_Safe chemicals · long-lasting · 3 month warranty_\n` +
    `• cockroach control  →  ₹499\n` +
    `• ant treatment      →  ₹349\n` +
    `• full pest control  →  ₹799`,
    phoneNumberId, token
  );

  // Message 2 — ordering prompt (last message = always visible at bottom of chat)
  await sendText(to,
    `✍️ *Apna poora order ek saath type karein!*\n\n` +
    `📌 _Quantity saath mein likho, comma se alag karo_\n\n` +
    `*Examples:*\n` +
    `▸ _sofa 3, ottoman 2, cushion 3, table 2_\n` +
    `▸ _single bed 2, dining chair 4, fan 3_\n` +
    `▸ _sofa 4, scb 2, ottoman 2, single bed 1_\n` +
    `▸ _bathroom 2, sofa 3, dining chair 6, table 1_\n\n` +
    `_Ek hi message mein sab likho — bot sab samajh jaayega_ 👇`,
    phoneNumberId, token
  );
};

// Sub-service selection — supports multi-section layout (grouped by section field)
const askSubService = async (to, biz, service, phoneNumberId, token) => {
  const subs = biz.subServices[service] || [];

  // Group by section
  const sectionMap = {};
  for (const s of subs) {
    const sect = s.section || service;
    if (!sectionMap[sect]) sectionMap[sect] = [];
    sectionMap[sect].push({
      id:          s.id,
      title:       s.id.substring(0, 24),
      description: s.desc || (s.price > 0 ? `₹${s.price}` : 'Custom price'),
    });
  }
  const sections = Object.entries(sectionMap).map(([title, rows]) => ({ title, rows }));

  const trustLine = {
    'Sofa Cleaning':     '🛋️ Steam cleaning | Dries in 2-4 hrs | Odour-free',
    'Bed Cleaning':      '🛏️ UV sanitize + steam | Mite removal | Safe & fresh',
    'Chairs & Items':    '🪑 Eco-friendly clean | Safe chemicals | Quick dry',
    'Pest Control':      '🐜 Safe chemicals | Long-lasting protection | Warranty',
  }[service] || '✨ Professional service guaranteed';

  await sendList(to,
    `*${service}*\n\nApna item choose karein 👇\n_${trustLine}_`,
    `Item Chunein`,
    sections,
    phoneNumberId, token
  );
};

// Quantity selector buttons (1, 2, 3, 4+)
const sendQuantitySelector = async (to, subService, unitPrice, phoneNumberId, token) => {
  await sendButtons(to,
    `✅ *${subService.substring(0, 40)}* selected!\n\n💰 Unit price: ₹${unitPrice}/piece\n\nKitne chahiye? 👇`,
    [
      { id: 'QTY_1', title: '1️⃣  1 Piece' },
      { id: 'QTY_2', title: '2️⃣  2 Pieces' },
      { id: 'QTY_3', title: '3️⃣  3 Pieces' },
    ],
    phoneNumberId, token
  );
};

// Shopping cart display with upsell and add-more/continue options
const showCart = async (to, cart, service, phoneNumberId, token, showUpsell = false) => {
  const total  = cartTotal(cart);
  const lines  = cartLines(cart);
  const upsell = showUpsell && UPSELL[service]
    ? `\n\n💡 *${UPSELL[service].emoji} Tip for you!*\n${UPSELL[service].text}`
    : '';

  await sendButtons(to,
    `🛒 *Aapka Cart:*\n${lines}\n━━━━━━━━━━━━━━━\n` +
    `💰 *Total: ₹${total}*${upsell}\n\n` +
    `Aur add karein ya booking continue karein? 👇`,
    [
      { id: 'ADD_MORE', title: '➕ Aur Add Karo' },
      { id: 'CONTINUE', title: '✅ Continue Booking' },
    ],
    phoneNumberId, token
  );
};

// ── Date & time selection ─────────────────────────────────────────────────────

const askDate = async (to, phoneNumberId, token) => {
  await sendList(to,
    `📅 *Kab chahiye service?*\n\n_Hum 7 days a week available hain!_`,
    `Date Chunein`,
    [{
      title: '📆 Date Select Karein',
      rows: [
        { id: 'aaj',        title: '⚡ Aaj (Today)',       description: 'Aaj hi service schedule karein' },
        { id: 'kal',        title: '🌅 Kal (Tomorrow)',    description: 'Kal ke liye book karein' },
        { id: 'parson',     title: '📆 Parson',            description: '2 din baad ki date' },
        { id: 'CUSTOM_DATE',title: '🗓️ Koi Aur Date',     description: 'Apni marzi ki date chunein' },
      ],
    }],
    phoneNumberId, token
  );
};

// Simple time preference — 3 buttons, no times shown
const askTimePreference = async (to, date, phoneNumberId, token) => {
  await sendButtons(to,
    `✅ *${fmtDate(date)}* — Perfect!\n\n` +
    `🕐 *Din ka kaunsa waqt prefer karte ho?*\n\n` +
    `_(Exact time hamaari team booking confirm hone ke baad call karke batayegi)_`,
    [
      { id: 'PREF_MORNING',   title: '🌅 Morning' },
      { id: 'PREF_AFTERNOON', title: '☀️ Afternoon' },
      { id: 'PREF_EVENING',   title: '🌆 Evening' },
    ],
    phoneNumberId, token
  );
};

// ── Address, name, confirmation ───────────────────────────────────────────────

const askAddress = async (to, phoneNumberId, token) => {
  await sendButtons(to,
    `📍 *Aapka address kya hai?*\n\n` +
    `Pura address type karein:\n` +
    `_Flat/House → Society/Gali → Area → City_\n\n` +
    `_(Ya location pin share karo 📌 — WhatsApp mein: Attach → Location)_`,
    [{ id: 'SHARE_LOCATION', title: '📌 Share Location' }],
    phoneNumberId, token
  );
};

const askName = async (to, phoneNumberId, token) => {
  await sendText(to,
    `👤 *Almost done! Aapka naam batayein* 😊\n\n` +
    `_(Jaise: Rahul Sharma — taaki professional aapko address kar sake)_`,
    phoneNumberId, token
  );
};

// Full booking summary + review + trust line + confirm/cancel
const sendConfirm = async (to, data, bizName, phoneNumberId, token) => {
  const services = data.selectedServices || [];
  const total    = cartTotal(services);
  const lines    = services.map((i) =>
    `  🧹 ${i.subService}${i.quantity > 1 ? ` ×${i.quantity}` : ''} — ₹${i.price}`
  ).join('\n');

  // Rotate through reviews based on time
  const review = REVIEWS[Math.floor(Date.now() / 60000) % REVIEWS.length];

  await sendButtons(to,
    `📋 *Booking Summary — ${bizName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Name:* ${data.name}\n` +
    `🧹 *Services:*\n${lines}\n` +
    `📅 *Date:* ${fmtDate(data.date)}\n` +
    `🕐 *Time:* ${data.timeSlot}\n` +
    `📍 *Address:* ${data.address}\n` +
    `💰 *Total:* ₹${total}\n` +
    `💳 *Payment:* After Service Only\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `${review.star} *Customer Review:*\n${review.text}\n— _${review.name}_\n\n` +
    `Sab sahi hai? Confirm karein 👇`,
    [
      { id: 'CONFIRM_YES', title: '✅ Confirm Booking' },
      { id: 'CONFIRM_NO',  title: '❌ Cancel' },
    ],
    phoneNumberId, token
  );
};

// Booking confirmed — send reference + next steps
const sendBookingDone = async (to, name, bizName, phoneNumberId, token, data = {}) => {
  const services  = Array.isArray(data.selectedServices) ? data.selectedServices : [];
  const total     = cartTotal(services);
  const lines     = services.map((i) =>
    `  🧹 ${i.subService}${i.quantity > 1 ? ` ×${i.quantity}` : ''} — ₹${i.price}`
  ).join('\n');
  const bookingRef = `SS${Date.now().toString().slice(-6)}`;

  await sendText(to,
    `🎉 *Booking Confirmed! Shukriya ${name}!* 🙏\n\n` +
    `📌 *Booking Ref: #${bookingRef}*\n` +
    `━━━━━━━━━━━━━━━\n` +
    (lines ? `${lines}\n` : '') +
    `📅 ${fmtDate(data.date)} · 🕐 ${data.timeSlot}\n` +
    (total > 0 ? `💰 Total: ₹${total} _(pay after service)_\n` : '') +
    `━━━━━━━━━━━━━━━\n\n` +
    `*⏭️ Aage kya hoga:*\n` +
    `1️⃣ 1 ghante mein confirmation call\n` +
    `2️⃣ Professional assigned — notification aayegi\n` +
    `3️⃣ Team scheduled time pe aayegi\n` +
    `4️⃣ Service complete → Tab pay karein\n\n` +
    `💬 Koi sawaal? Yahan reply karein — hum hain! 🙏\n` +
    `_${bizName} — Always at Your Service_ ✨`,
    phoneNumberId, token
  );
};

// ── Static page senders ───────────────────────────────────────────────────────

const sendPriceList = async (to, biz, phoneNumberId, token) => {
  let msg = `💰 *${biz.name} — Complete Price List*\n━━━━━━━━━━━━━━━\n\n`;
  for (const [svc, items] of Object.entries(biz.subServices || {})) {
    msg += `*${svc}:*\n`;
    for (const item of items.slice(0, 5)) {
      msg += `  • ${item.id}: ${item.price > 0 ? `₹${item.price}` : 'Custom quote'}\n`;
    }
    if (items.length > 5) msg += `  _(+ ${items.length - 5} more)_\n`;
    msg += '\n';
  }
  msg += `💳 *Pay After Service — Always!*\n📞 Custom quote ke liye message karein.`;
  await sendText(to, msg, phoneNumberId, token);
  await sendReturnToMenu(to, phoneNumberId, token);
};

const sendFAQ = async (to, phoneNumberId, token) => {
  const rows = Object.keys(FAQ).map((key) => ({
    id:          `FAQ_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
    title:       key.substring(0, 24),
    description: 'Tap to read answer',
  }));
  await sendList(to,
    `❓ *Frequently Asked Questions*\n\nKaunsa sawaal hai aapka? 👇`,
    `Topic Chunein`,
    [{ title: '📋 Topics', rows }],
    phoneNumberId, token
  );
};

const sendReviews = async (to, phoneNumberId, token) => {
  const msg = `⭐ *Happy Customer Stories!*\n━━━━━━━━━━━━━━━\n\n` +
    REVIEWS.map((r) => `${r.star}\n${r.text}\n— _${r.name}_`).join('\n\n');
  await sendText(to, msg, phoneNumberId, token);
  await sendReturnToMenu(to, phoneNumberId, token);
};

const sendReturnToMenu = async (to, phoneNumberId, token) => {
  await sendButtons(to,
    `Aur kuch help chahiye? 😊`,
    [
      { id: 'MENU_BOOK', title: '🧹 Book Cleaning' },
      { id: 'MENU_MAIN', title: '🏠 Main Menu' },
    ],
    phoneNumberId, token
  );
};

// ── Main handler ──────────────────────────────────────────────────────────────

const handleIncoming = async ({ from, text, msgType, businessPhone }) => {
  const biz = getBusiness(businessPhone);
  if (!biz) {
    console.warn(`[BOT] Unknown phoneNumberId: ${businessPhone}`);
    return;
  }

  _phoneBizMap.set(from, biz.id);

  const token         = biz.token();
  const phoneNumberId = businessPhone;

  if (!token) {
    console.warn(`[BOT] No token for ${biz.name}`);
    return;
  }

  const conv = await getOrCreate(from, biz.id);

  // ── Global triggers — work from any state ──────────────────────────────────

  const lowerText = (text || '').trim().toLowerCase();

  // Greeting → fresh start (with returning customer check)
  if (['hi', 'hello', 'hey', 'namaste', 'hii', 'helo', 'helo', 'start', 'restart'].includes(lowerText)) {
    await Conversation.deleteOne({ _id: conv._id });
    const fresh           = await getOrCreate(from, biz.id);
    const existingLead    = await Lead.findOne({ phone: from, source: 'whatsapp', stage: { $ne: 'new' } }).sort({ createdAt: -1 });
    await sendWelcome(from, biz, phoneNumberId, token, !!existingLead);
    await save(fresh, 'AWAITING_MAIN_MENU');
    return;
  }

  // "menu" keyword or MENU_MAIN button — go back to main menu
  if (lowerText === 'menu' || text === 'MENU_MAIN') {
    await sendWelcome(from, biz, phoneNumberId, token, true);
    await save(conv, 'AWAITING_MAIN_MENU');
    return;
  }

  // Book button from return-to-menu shortcut
  if (text === 'MENU_BOOK' && conv.step !== 'AWAITING_MAIN_MENU') {
    if (biz.id === 'sofashine') {
      await save(conv, 'AWAITING_QUICK_ORDER', { selectedServices: [] });
      await sendMasterPriceCard(from, phoneNumberId, token);
    } else {
      await save(conv, 'AWAITING_SERVICE', { selectedServices: [] });
      await askService(from, biz, phoneNumberId, token);
    }
    return;
  }

  // Handle image messages — acknowledge without blocking
  if (msgType === 'image') {
    if (conv.step === 'AWAITING_SUBSERVICE') {
      await sendText(from,
        `📸 Photo mili! Hum check karke estimate karenge.\n\nTab tak, list se approximate size select karein.\n_Ya "menu" type karo main menu ke liye._ 😊`,
        phoneNumberId, token
      );
    } else {
      await sendText(from,
        `📸 Photo mili! Hamare team ko forward kar raha hoon.\n\nKoi sawaal ho toh type karein, ya _"menu"_ type karo. 😊`,
        phoneNumberId, token
      );
    }
    return;
  }

  // ── State machine ─────────────────────────────────────────────────────────

  switch (conv.step) {

    // ── Main Menu ─────────────────────────────────────────────────────────────
    case 'AWAITING_MAIN_MENU': {
      switch (text) {
        case 'MENU_BOOK':
          if (biz.id === 'sofashine') {
            await save(conv, 'AWAITING_QUICK_ORDER', { selectedServices: [] });
            await sendMasterPriceCard(from, phoneNumberId, token);
          } else {
            await save(conv, 'AWAITING_SERVICE', { selectedServices: [] });
            await askService(from, biz, phoneNumberId, token);
          }
          break;
        case 'MENU_PRICE':
          await sendPriceList(from, biz, phoneNumberId, token);
          break;
        case 'MENU_OFFERS':
          await sendText(from, OFFERS_TEXT, phoneNumberId, token);
          await sendReturnToMenu(from, phoneNumberId, token);
          break;
        case 'MENU_REVIEWS':
          await sendReviews(from, phoneNumberId, token);
          break;
        case 'MENU_AREAS':
          await sendText(from, AREAS_TEXT, phoneNumberId, token);
          await sendReturnToMenu(from, phoneNumberId, token);
          break;
        case 'MENU_FAQ':
          await sendFAQ(from, phoneNumberId, token);
          await save(conv, 'AWAITING_FAQ');
          break;
        case 'MENU_EXPERT':
          await sendText(from,
            `💬 *Hamare Expert Se Baat Karein*\n\n` +
            `📞 Call: +91-XXXXXXXXXX\n` +
            `⏰ Available: 9 AM – 9 PM, 7 days\n\n` +
            `Ya yahan message karein — *15 minutes* mein response guaranteed! 🙏\n\n` +
            `_Hamare team ka koi bhi sawaal miss nahi karta._ ✅`,
            phoneNumberId, token
          );
          await sendReturnToMenu(from, phoneNumberId, token);
          break;
        case 'MENU_EXISTING':
          await sendButtons(from,
            `📦 *Existing Booking Manage Karein*\n\n` +
            `_Booking Ref # ya registered phone number ready rakhein._`,
            [
              { id: 'EB_TRACK',      title: '🔍 Track Booking' },
              { id: 'EB_RESCHEDULE', title: '📅 Reschedule' },
              { id: 'EB_CANCEL',     title: '❌ Cancel Booking' },
            ],
            phoneNumberId, token
          );
          await save(conv, 'AWAITING_EXISTING_BOOKING');
          break;
        default:
          // Unrecognised — re-show welcome menu
          await sendWelcome(from, biz, phoneNumberId, token, true);
      }
      break;
    }

    // ── FAQ ───────────────────────────────────────────────────────────────────
    case 'AWAITING_FAQ': {
      // text is like 'FAQ_PRICING___PAYMENT', 'FAQ_HOW_LONG_IT_TAKES', etc.
      const faqEntry = Object.entries(FAQ).find(([k]) =>
        `FAQ_${k.toUpperCase().replace(/[^A-Z0-9]/g, '_')}` === text
      );
      if (faqEntry) {
        await sendText(from, `*${faqEntry[0]}*\n\n${faqEntry[1]}`, phoneNumberId, token);
        await sendReturnToMenu(from, phoneNumberId, token);
        await save(conv, 'AWAITING_MAIN_MENU');
      } else {
        await sendFAQ(from, phoneNumberId, token);
      }
      break;
    }

    // ── Existing Booking ──────────────────────────────────────────────────────
    case 'AWAITING_EXISTING_BOOKING': {
      if (text === 'EB_TRACK') {
        await sendText(from,
          `🔍 *Booking Track Karein*\n\n` +
          `Apna *Booking Ref #* type karein\n` +
          `_(Jaise: #SS123456 — confirmation message mein diya tha)_\n\n` +
          `Ya registered phone se 📞 call karein:\n` +
          `+91-XXXXXXXXXX (9 AM - 9 PM)`,
          phoneNumberId, token
        );
      } else if (text === 'EB_RESCHEDULE') {
        await sendText(from,
          `📅 *Reschedule Karein*\n\n` +
          `Naya preferred date aur time send karein:\n` +
          `_"Reschedule #SS123456 — 15 July, Afternoon"_\n\n` +
          `Ya call karein: 📞 +91-XXXXXXXXXX\n` +
          `_2 ghante pehle tak free reschedule!_ ✅`,
          phoneNumberId, token
        );
      } else if (text === 'EB_CANCEL') {
        await sendText(from,
          `❌ *Cancel Karein*\n\n` +
          `Type karein: _"Cancel #SS123456"_\n\n` +
          `Ya call karein: 📞 +91-XXXXXXXXXX\n\n` +
          `📋 *Cancellation Policy:*\n` +
          `• 2+ ghante pehle → Free\n` +
          `• 1-2 ghante → 50% charge\n` +
          `• Last minute → Full charge`,
          phoneNumberId, token
        );
      }
      await sendReturnToMenu(from, phoneNumberId, token);
      await save(conv, 'AWAITING_MAIN_MENU');
      break;
    }

    // ── Service Selection ─────────────────────────────────────────────────────
    case 'AWAITING_SERVICE': {
      const match = biz.services.find(
        (s) => s.id.toLowerCase() === text.toLowerCase() || s.id === text
      );
      if (!match) { await askService(from, biz, phoneNumberId, token); break; }

      let leadId = conv.data.leadId;
      if (!leadId) {
        const partial = await Lead.create({
          name: 'Incomplete', phone: from, serviceInterest: match.id,
          source: 'whatsapp', stage: 'new',
          notes: 'WhatsApp bot — conversation in progress',
        });
        leadId = partial._id.toString();
      }

      if (match.id === 'Other / Custom') {
        await save(conv, 'AWAITING_CUSTOM_REQUEST', { service: match.id, leadId });
        await sendText(from,
          `💬 *Apni Requirement Batayein* 📝\n\n` +
          `Detail mein likhein:\n` +
          `_Jaise: "3 sofas + 2 carpets clean karwane hain" ya "full home deep clean"_\n\n` +
          `Hum aapke liye best quote prepare karenge! ✨`,
          phoneNumberId, token
        );
        break;
      }

      // Sofa Cleaning → master quick order (bypass WhatsApp list)
      if (match.id === 'Sofa Cleaning') {
        await save(conv, 'AWAITING_QUICK_ORDER', { service: match.id, leadId });
        await sendMasterPriceCard(from, phoneNumberId, token);
        break;
      }

      // Single fixed-price service (Bathroom Cleaning etc.) → skip sub-list, add to cart directly
      const subs = biz.subServices[match.id] || [];
      if (subs.length === 1 && !subs[0].askCount && !subs[0].askQty && subs[0].price > 0) {
        const item = { service: match.id, subService: subs[0].id, price: subs[0].price, quantity: 1, unitPrice: subs[0].price };
        const existing = Array.isArray(conv.data.selectedServices) ? conv.data.selectedServices : [];
        const cart = [...existing, item];
        await save(conv, 'AWAITING_ADD_MORE', { service: match.id, leadId, selectedServices: cart });
        await showCart(from, cart, match.id, phoneNumberId, token, existing.length === 0);
        break;
      }

      await save(conv, 'AWAITING_SUBSERVICE', { service: match.id, leadId });
      await askSubService(from, biz, match.id, phoneNumberId, token);
      break;
    }

    // ── Custom Request ────────────────────────────────────────────────────────
    case 'AWAITING_CUSTOM_REQUEST': {
      if (text.trim().length < 3) {
        await sendText(from, `⚠️ Thoda detail mein batayein please 🙏`, phoneNumberId, token);
        break;
      }
      if (conv.data.leadId) {
        await Lead.findByIdAndUpdate(conv.data.leadId, {
          serviceInterest: text.trim(), notes: `Custom request: ${text.trim()}`,
        });
      }
      const existing = Array.isArray(conv.data.selectedServices) ? conv.data.selectedServices : [];
      const cart     = [...existing, { service: 'Other / Custom', subService: text.trim(), price: 0, quantity: 1, unitPrice: 0 }];
      await save(conv, 'AWAITING_ADD_MORE', { selectedServices: cart });
      await showCart(from, cart, 'Other / Custom', phoneNumberId, token, false);
      break;
    }

    // ── Master Quick Order (all services, text input) ─────────────────────────
    case 'AWAITING_QUICK_ORDER': {
      const newItems = parseMasterOrder(text);
      if (newItems.length === 0) {
        await sendText(from,
          `⚠️ Kuch samajh nahi aaya!\n\n` +
          `*Aise type karein (comma se alag karein):*\n` +
          `"sofa 3, ottoman 2, cushion 3, table 2"\n` +
          `"single bed 2, dining chair 4, fan 3"\n` +
          `"sofa 3, single bed 2, ottoman 2, bathroom"\n\n` +
          `_Ya "menu" type karein wapas jaane ke liye._`,
          phoneNumberId, token
        );
        await sendMasterPriceCard(from, phoneNumberId, token);
        break;
      }

      // Create lead on first order (if not already created)
      let leadId = conv.data.leadId;
      if (!leadId) {
        const services = [...new Set(newItems.map(i => i.service))].join(', ');
        const partial  = await Lead.create({
          name: 'Incomplete', phone: from, serviceInterest: services,
          source: 'whatsapp', stage: 'new',
          notes: 'WhatsApp bot — conversation in progress',
        });
        leadId = partial._id.toString();
      }

      const existing = Array.isArray(conv.data.selectedServices) ? conv.data.selectedServices : [];
      const cart = [...existing, ...newItems];
      const lastService = newItems[newItems.length - 1]?.service || 'Sofa Cleaning';
      await save(conv, 'AWAITING_ADD_MORE', { leadId, selectedServices: cart });
      await showCart(from, cart, lastService, phoneNumberId, token, existing.length === 0);
      break;
    }

    // ── Sub-service Selection ─────────────────────────────────────────────────
    case 'AWAITING_SUBSERVICE': {
      const subs  = biz.subServices[conv.data.service] || [];
      const match = subs.find((s) => s.id.toLowerCase() === text.toLowerCase() || s.id === text);
      if (!match) { await askSubService(from, biz, conv.data.service, phoneNumberId, token); break; }

      // Seat-count items (5+ sofa, sofa cum bed 3-4) — ask for exact count
      if (match.askCount) {
        const priceHint = match.priceMap
          ? Object.entries(match.priceMap).map(([k, v]) => `${k} seat=₹${v}`).join(' · ')
          : `₹${match.unitPrice || 100}/seat`;
        const isCumBed = match.id.startsWith('Sofa Cum Bed');
        await save(conv, 'AWAITING_SEAT_COUNT', {
          pendingSubService: match.id,
          pendingUnitPrice:  match.unitPrice || 100,
          pendingPriceMap:   match.priceMap  || null,
        });
        await sendText(from,
          `🛋️ *${match.id}*\n\n` +
          `${isCumBed ? 'Sofa Cum Bed mein kitne seats hain?' : 'Sofa mein kitne seats hain?'}\n` +
          `_(Sirf number type karein)_\n\n` +
          `💰 ${priceHint}`,
          phoneNumberId, token
        );
        break;
      }

      // Quantity-based item — ask how many
      if (match.askQty) {
        await save(conv, 'AWAITING_QUANTITY', { pendingSubService: match.id, pendingUnitPrice: match.price });
        await sendQuantitySelector(from, match.id, match.price, phoneNumberId, token);
        break;
      }

      // Direct add to cart (single item, no quantity)
      const existing = Array.isArray(conv.data.selectedServices) ? conv.data.selectedServices : [];
      const isFirst  = existing.length === 0;
      const cart     = [...existing, { service: conv.data.service, subService: match.id, price: match.price, quantity: 1, unitPrice: match.price }];
      await save(conv, 'AWAITING_ADD_MORE', { selectedServices: cart });
      await showCart(from, cart, conv.data.service, phoneNumberId, token, isFirst);
      break;
    }

    // ── Seat Count Input (sofa 5+, sofa cum bed 3-4) ─────────────────────────
    case 'AWAITING_SEAT_COUNT': {
      const seats = parseInt(text.trim());
      if (isNaN(seats) || seats < 1 || seats > 50) {
        await sendText(from, `⚠️ Seats ki number type karein (jaise: 3, 5 ya 7) 🙏`, phoneNumberId, token);
        break;
      }
      const priceMap  = conv.data.pendingPriceMap || {};
      const unitPrice = conv.data.pendingUnitPrice || 100;
      const price     = priceMap[seats] !== undefined ? priceMap[seats] : seats * unitPrice;
      const subSvc    = conv.data.pendingSubService || '';
      const label     = subSvc.startsWith('Sofa Cum Bed')
        ? `Sofa Cum Bed — ${seats} Seat`
        : `Sofa — ${seats} Seats`;
      const existing  = Array.isArray(conv.data.selectedServices) ? conv.data.selectedServices : [];
      const isFirst   = existing.length === 0;
      const cart      = [...existing, { service: conv.data.service, subService: label, price, quantity: 1, unitPrice: price }];
      await sendText(from, `✅ *${label}* added!\n_(₹${price})_`, phoneNumberId, token);
      await save(conv, 'AWAITING_ADD_MORE', { selectedServices: cart });
      await showCart(from, cart, conv.data.service, phoneNumberId, token, isFirst);
      break;
    }

    // ── Quantity Input ────────────────────────────────────────────────────────
    case 'AWAITING_QUANTITY': {
      let qty = 0;
      if (text === 'QTY_1')      qty = 1;
      else if (text === 'QTY_2') qty = 2;
      else if (text === 'QTY_3') qty = 3;
      else                       qty = parseInt(text.trim());

      if (isNaN(qty) || qty < 1 || qty > 20) {
        await sendQuantitySelector(from, conv.data.pendingSubService, conv.data.pendingUnitPrice, phoneNumberId, token);
        break;
      }

      const unitPrice = conv.data.pendingUnitPrice;
      const price     = unitPrice * qty;
      const existing  = Array.isArray(conv.data.selectedServices) ? conv.data.selectedServices : [];
      const isFirst   = existing.length === 0;
      const cart      = [...existing, {
        service:    conv.data.service,
        subService: conv.data.pendingSubService,
        price,
        quantity:   qty,
        unitPrice,
      }];
      await save(conv, 'AWAITING_ADD_MORE', { selectedServices: cart });
      await showCart(from, cart, conv.data.service, phoneNumberId, token, isFirst);
      break;
    }

    // ── Add More / Continue ───────────────────────────────────────────────────
    case 'AWAITING_ADD_MORE': {
      if (text === 'ADD_MORE') {
        if (biz.id === 'sofashine') {
          await save(conv, 'AWAITING_QUICK_ORDER');
          await sendMasterPriceCard(from, phoneNumberId, token);
        } else {
          await save(conv, 'AWAITING_SERVICE');
          await askService(from, biz, phoneNumberId, token);
        }
        break;
      }
      if (text === 'CONTINUE') {
        const total = cartTotal(conv.data.selectedServices);
        await Lead.findByIdAndUpdate(conv.data.leadId, { quotedAmount: total }).catch(() => {});
        await save(conv, 'AWAITING_DATE');
        await askDate(from, phoneNumberId, token);
        break;
      }
      // Unrecognised — re-show cart
      await showCart(from, conv.data.selectedServices || [], conv.data.service, phoneNumberId, token, false);
      break;
    }

    // ── Date Selection ────────────────────────────────────────────────────────
    case 'AWAITING_DATE': {
      if (text === 'CUSTOM_DATE') {
        await sendText(from,
          `📅 *Apni date type karein:*\n\n` +
          `Format: *DD/MM/YYYY*\n` +
          `_Jaise: 15/08/2025_`,
          phoneNumberId, token
        );
        break; // Stay in AWAITING_DATE — next message will be the typed date
      }
      const date = parseDate(text);
      if (!date) {
        await sendText(from, `⚠️ Date samajh nahi aaya. Kripya *DD/MM/YYYY* format mein likhein — jaise: *25/07/2025*`, phoneNumberId, token);
        await askDate(from, phoneNumberId, token);
        break;
      }
      await save(conv, 'AWAITING_TIME', { date });
      await askTimePreference(from, date, phoneNumberId, token);
      break;
    }

    // ── Time Group (legacy state — redirect to preference) ────────────────────
    case 'AWAITING_TIME_GROUP': {
      await save(conv, 'AWAITING_TIME');
      await askTimePreference(from, new Date(conv.data.date || Date.now()), phoneNumberId, token);
      break;
    }

    // ── Time Preference ───────────────────────────────────────────────────────
    case 'AWAITING_TIME': {
      const prefMap = {
        PREF_MORNING:   'Morning',
        PREF_AFTERNOON: 'Afternoon',
        PREF_EVENING:   'Evening',
      };
      const timeSlot = prefMap[text];

      if (!timeSlot) {
        await askTimePreference(from, new Date(conv.data.date || Date.now()), phoneNumberId, token);
        break;
      }

      await save(conv, 'AWAITING_ADDRESS', { timeSlot });
      await askAddress(from, phoneNumberId, token);
      break;
    }

    // ── Address ───────────────────────────────────────────────────────────────
    case 'AWAITING_ADDRESS': {
      if (text === 'SHARE_LOCATION') {
        await sendText(from,
          `📌 *Location Share Karne Ka Tarika:*\n\n` +
          `WhatsApp mein:\n` +
          `📎 Attach → Location → Current Location Send Karein\n\n` +
          `_Ya manually type karein — Flat no., Society, Area, City_ 🏠`,
          phoneNumberId, token
        );
        break;
      }

      let address = text;
      if (text.startsWith('__LOCATION__:')) {
        const coords = text.replace('__LOCATION__:', '');
        address = `📍 GPS Location: https://maps.google.com/?q=${coords}`;
      }

      if (address.trim().length < 5) {
        await sendText(from, `⚠️ Thoda aur detail mein address likhein please. 🙏`, phoneNumberId, token);
        break;
      }

      await sendText(from,
        `✅ *Bahut Accha!*\n\n` +
        `📍 Hum aapke area mein service karte hain!\n` +
        `_Sab ready hai. Bas ek last step..._`,
        phoneNumberId, token
      );
      await save(conv, 'AWAITING_NAME', { address });
      await askName(from, phoneNumberId, token);
      break;
    }

    // ── Name ──────────────────────────────────────────────────────────────────
    case 'AWAITING_NAME': {
      if (text.trim().length < 2) {
        await sendText(from, `⚠️ Apna naam likhein please 😊`, phoneNumberId, token);
        break;
      }
      const name = text.trim();
      await save(conv, 'AWAITING_CONFIRM', { name });
      await sendConfirm(from, { ...conv.data, name }, biz.name, phoneNumberId, token);
      break;
    }

    // ── Confirm Booking ───────────────────────────────────────────────────────
    case 'AWAITING_CONFIRM': {
      if (text === 'CONFIRM_YES' || lowerText === 'confirm' || text === '1') {
        const services       = conv.data.selectedServices || [];
        const serviceInterest = services.map((s) => s.subService).join(' + ');
        const totalAmount    = cartTotal(services);
        const serviceNotes   = services.map((s) =>
          `${s.subService}${s.quantity > 1 ? ` ×${s.quantity}` : ''} (₹${s.price})`
        ).join('\n');

        const leadData = {
          name:            conv.data.name,
          serviceInterest,
          quotedAmount:    totalAmount,
          scheduledDate:   conv.data.date,
          timeSlot:        conv.data.timeSlot,
          address:         conv.data.address,
          notes:           `Services:\n${serviceNotes}`,
          stage:           'new',
        };

        if (conv.data.leadId) {
          await Lead.findByIdAndUpdate(conv.data.leadId, leadData);
        } else {
          await Lead.create({ ...leadData, phone: from, source: 'whatsapp' });
        }

        await save(conv, 'COMPLETED');
        await sendBookingDone(from, conv.data.name, biz.name, phoneNumberId, token, conv.data);
        console.log(`[BOT] ✅ Booking confirmed — ${conv.data.name} (${from}) — ${biz.name} — ₹${totalAmount}`);

      } else if (text === 'CONFIRM_NO' || lowerText === 'cancel' || text === '2') {
        if (conv.data.leadId) {
          await Lead.findByIdAndUpdate(conv.data.leadId, {
            stage: 'lost', notes: 'Customer cancelled during WhatsApp booking confirmation',
          });
        }
        await Conversation.deleteOne({ _id: conv._id });
        await sendText(from,
          `❌ Booking cancel ho gayi.\n\nKabhi bhi nayi booking ke liye *"Hi"* type karein.\nHum hamesha available hain! 🙏`,
          phoneNumberId, token
        );

      } else {
        // Re-show confirmation if customer types something unexpected
        await sendConfirm(from, conv.data, biz.name, phoneNumberId, token);
      }
      break;
    }

    // ── Completed ─────────────────────────────────────────────────────────────
    case 'COMPLETED': {
      await sendText(from,
        `Aapki booking already confirm hai! 🎉\n\n` +
        `Nayi booking ke liye *"Hi"* type karein.\n` +
        `Kisi bhi sawaal ke liye yahan message karein. 🙏`,
        phoneNumberId, token
      );
      break;
    }

    // ── Default / Unknown state ───────────────────────────────────────────────
    default: {
      await sendWelcome(from, biz, phoneNumberId, token, true);
      await save(conv, 'AWAITING_MAIN_MENU');
    }
  }
};

module.exports = { handleIncoming };
