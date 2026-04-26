require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Staff = require('../models/Staff');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cleancruisers');
  console.log('✅ Connected to MongoDB');
};

const seedAdmin = async () => {
  const existing = await User.findOne({ email: process.env.ADMIN_EMAIL || 'admin@cleancruisers.com' });
  if (existing) {
    console.log('⏭️  Admin already exists, skipping...');
    return;
  }

  await User.create({
    name: 'Admin',
    email: process.env.ADMIN_EMAIL || 'admin@cleancruisers.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123456',
    role: 'superadmin',
  });

  console.log('✅ Admin user created');
};

const seedStaff = async () => {
  const count = await Staff.countDocuments();
  if (count > 0) {
    console.log('⏭️  Staff already seeded, skipping...');
    return;
  }

  const defaultAvailability = [1, 2, 3, 4, 5, 6].map((day) => ({
    dayOfWeek: day,
    startTime: '09:00',
    endTime: '18:00',
    isAvailable: true,
  }));

  await Staff.insertMany([
    {
      name: 'Rajesh Kumar',
      phone: '9876543210',
      email: 'rajesh@cleancruisers.com',
      specializations: ['sofa_cleaning', 'carpet_cleaning', 'general_cleaning'],
      availability: defaultAvailability,
      rating: 4.8,
    },
    {
      name: 'Priya Sharma',
      phone: '9876543211',
      email: 'priya@cleancruisers.com',
      specializations: ['deep_cleaning', 'kitchen_cleaning', 'bathroom_cleaning'],
      availability: defaultAvailability,
      rating: 4.9,
    },
    {
      name: 'Amit Singh',
      phone: '9876543212',
      email: 'amit@cleancruisers.com',
      specializations: ['car_cleaning', 'general_cleaning'],
      availability: defaultAvailability,
      rating: 4.7,
    },
    {
      name: 'Sunita Devi',
      phone: '9876543213',
      email: 'sunita@cleancruisers.com',
      specializations: ['bathroom_cleaning', 'kitchen_cleaning', 'deep_cleaning'],
      availability: [
        ...defaultAvailability,
        { dayOfWeek: 0, startTime: '10:00', endTime: '16:00', isAvailable: true },
      ],
      rating: 4.6,
    },
  ]);

  console.log('✅ Sample staff created');
};

const run = async () => {
  try {
    await connectDB();
    await seedAdmin();
    await seedStaff();
    console.log('\n🎉 Database seeding complete!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
};

run();
