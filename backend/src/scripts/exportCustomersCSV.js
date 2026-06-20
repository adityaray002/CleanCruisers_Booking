require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Booking = require('../models/Booking');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cleancruisers');
  console.log('✅ Connected to MongoDB');
};

const exportCustomers = async () => {
  // Group all bookings by customer phone (unique identifier)
  const customers = await Booking.aggregate([
    {
      $group: {
        _id: '$customerPhone',
        name: { $first: '$customerName' },
        email: { $first: '$customerEmail' },
        phone: { $first: '$customerPhone' },
        totalBookings: { $sum: 1 },
        totalSpend: { $sum: '$totalAmount' },
        lastBookingDate: { $max: '$scheduledDate' },
        firstBookingDate: { $min: '$scheduledDate' },
        services: { $addToSet: '$serviceLabel' },
        completedJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        cancelledJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
        },
      },
    },
    { $sort: { totalSpend: -1 } },
  ]);

  if (customers.length === 0) {
    console.log('⚠️  No customers found in the database.');
    return;
  }

  // HubSpot requires: First Name, Last Name, Email, Phone Number
  // Extra columns are imported as custom properties
  const rows = customers.map((c) => {
    const nameParts = (c.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const lastDate = c.lastBookingDate
      ? new Date(c.lastBookingDate).toLocaleDateString('en-IN')
      : '';
    const services = (c.services || []).join(' | ');

    // Escape commas and quotes inside CSV fields
    const esc = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    return [
      esc(firstName),
      esc(lastName),
      esc(c.email),
      esc(c.phone),
      esc(c.totalBookings),
      esc(`₹${c.totalSpend}`),
      esc(c.completedJobs),
      esc(c.cancelledJobs),
      esc(lastDate),
      esc(services),
    ].join(',');
  });

  const header = [
    '"First Name"',
    '"Last Name"',
    '"Email"',
    '"Phone Number"',
    '"Total Bookings"',
    '"Total Spend"',
    '"Completed Jobs"',
    '"Cancelled Jobs"',
    '"Last Booking Date"',
    '"Services Used"',
  ].join(',');

  const csv = [header, ...rows].join('\n');
  const outputPath = path.join(__dirname, '../../customers_export.csv');
  fs.writeFileSync(outputPath, csv, 'utf8');

  console.log(`\n✅ Exported ${customers.length} customers`);
  console.log(`📄 File saved at: ${outputPath}`);
  console.log('\n📊 Quick summary:');
  console.log(`   Total customers : ${customers.length}`);
  console.log(`   Top spender     : ${customers[0]?.name} (₹${customers[0]?.totalSpend})`);
  console.log(`\n👉 Upload customers_export.csv to HubSpot → Contacts → Import`);
};

const run = async () => {
  try {
    await connectDB();
    await exportCustomers();
  } catch (err) {
    console.error('❌ Export failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
