require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cleancruisers');
  console.log('✅ Connected to MongoDB');
};

const INACTIVE_DAYS = 60;
const VIP_MIN_BOOKINGS = 5;
const VIP_MIN_SPEND = 10000;

const assignTags = (stats) => {
  const tags = [];
  const lastService = new Date(stats.lastServiceDate);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVE_DAYS);

  if (stats.totalBookings === 1) tags.push('new');
  else if (stats.totalBookings >= 2 && stats.totalBookings < VIP_MIN_BOOKINGS && stats.totalSpend < VIP_MIN_SPEND)
    tags.push('regular');

  if (stats.totalBookings >= VIP_MIN_BOOKINGS || stats.totalSpend >= VIP_MIN_SPEND)
    tags.push('vip');

  if (lastService < cutoff)
    tags.push('at-risk');

  if ((stats.services || []).some((s) => s?.toLowerCase().includes('sofa')))
    tags.push('sofa');

  return tags;
};

const autoTag = async () => {
  const stats = await Booking.aggregate([
    {
      $group: {
        _id: '$customerPhone',
        name: { $first: '$customerName' },
        phone: { $first: '$customerPhone' },
        totalBookings: { $sum: 1 },
        totalSpend: { $sum: '$totalAmount' },
        lastServiceDate: { $max: '$scheduledDate' },
        services: { $addToSet: '$serviceLabel' },
      },
    },
  ]);

  const counts = { new: 0, regular: 0, vip: 0, 'at-risk': 0, sofa: 0 };
  let updated = 0;

  for (const s of stats) {
    const tags = assignTags(s);
    tags.forEach((t) => { if (counts[t] !== undefined) counts[t]++; });

    await Customer.findOneAndUpdate(
      { phone: s.phone },
      { $set: { tags, name: s.name } },
      { upsert: true }
    );
    updated++;
  }

  console.log(`\n✅ Auto-tagged ${updated} customers:\n`);
  console.log(`   🆕 New       : ${counts.new}`);
  console.log(`   🔄 Regular   : ${counts.regular}`);
  console.log(`   ⭐ VIP       : ${counts.vip}`);
  console.log(`   ⚠️  At-risk   : ${counts['at-risk']}`);
  console.log(`   🛋️  Sofa      : ${counts.sofa}`);
  console.log('');
};

const run = async () => {
  try {
    await connectDB();
    await autoTag();
  } catch (err) {
    console.error('❌ Auto-tag failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
