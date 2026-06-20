require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cleancruisers');
  console.log('✅ Connected to MongoDB');
};

const syncCustomers = async () => {
  const stats = await Booking.aggregate([
    {
      $group: {
        _id: '$customerPhone',
        name: { $first: '$customerName' },
        phone: { $first: '$customerPhone' },
      },
    },
  ]);

  let created = 0;
  let skipped = 0;

  for (const s of stats) {
    const existing = await Customer.findOne({ phone: s.phone });
    if (existing) { skipped++; continue; }
    await Customer.create({ phone: s.phone, name: s.name });
    created++;
  }

  console.log(`\n✅ Sync complete!`);
  console.log(`   Created : ${created} new customer profiles`);
  console.log(`   Skipped : ${skipped} already existed`);
  console.log(`   Total   : ${stats.length} customers\n`);
};

const run = async () => {
  try {
    await connectDB();
    await syncCustomers();
  } catch (err) {
    console.error('❌ Sync failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
