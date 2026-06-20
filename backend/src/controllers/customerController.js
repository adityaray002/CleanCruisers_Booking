const Booking = require('../models/Booking');
const Customer = require('../models/Customer');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INACTIVE_DAYS = 60; // days with no booking = at-risk

const inactiveThreshold = () => {
  const d = new Date();
  d.setDate(d.getDate() - INACTIVE_DAYS);
  return d;
};

// Build aggregated stats for a list of customer phones from the Booking collection
const aggregateStats = async (phones) => {
  const stats = await Booking.aggregate([
    { $match: phones ? { customerPhone: { $in: phones } } : {} },
    {
      $group: {
        _id: '$customerPhone',
        name: { $first: '$customerName' },
        phone: { $first: '$customerPhone' },
        totalBookings: { $sum: 1 },
        totalSpend: { $sum: '$totalAmount' },
        lastServiceDate: { $max: '$scheduledDate' },
        firstServiceDate: { $min: '$scheduledDate' },
        completedJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        cancelledJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
        },
        services: { $addToSet: '$serviceLabel' },
      },
    },
  ]);
  return stats;
};

// ─── GET /api/customers ───────────────────────────────────────────────────────
const getCustomers = async (req, res, next) => {
  try {
    const { search, tag, atRisk } = req.query;

    // Aggregate booking stats for ALL customers
    const stats = await aggregateStats(null);

    // Fetch profile data (tags, notes) from Customer collection
    const allPhones = stats.map((s) => s.phone);
    const profiles = await Customer.find({ phone: { $in: allPhones } }).lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [p.phone, p]));

    // Merge stats + profile
    let customers = stats.map((s) => ({
      ...s,
      _id: profileMap[s.phone]?._id || null,
      tags: profileMap[s.phone]?.tags || [],
      notes: profileMap[s.phone]?.notes || '',
      isInactive: new Date(s.lastServiceDate) < inactiveThreshold(),
    }));

    // Filters
    if (atRisk === 'true') {
      customers = customers.filter((c) => c.isInactive);
    }
    if (tag) {
      customers = customers.filter((c) => c.tags.includes(tag));
    }
    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phone?.includes(q)
      );
    }

    // Sort: highest spend first
    customers.sort((a, b) => b.totalSpend - a.totalSpend);

    res.json({ success: true, count: customers.length, data: customers });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/customers/stats ─────────────────────────────────────────────────
const getCRMStats = async (req, res, next) => {
  try {
    const stats = await aggregateStats(null);
    const threshold = inactiveThreshold();

    const total = stats.length;
    const inactive = stats.filter((c) => new Date(c.lastServiceDate) < threshold).length;
    const repeat = stats.filter((c) => c.totalBookings > 1).length;
    const topCustomers = [...stats]
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);

    res.json({
      success: true,
      data: { total, inactive, repeat, topCustomers },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/customers/:phone ────────────────────────────────────────────────
const getCustomer = async (req, res, next) => {
  try {
    const { phone } = req.params;

    const [statsArr, profile, bookings] = await Promise.all([
      aggregateStats([phone]),
      Customer.findOne({ phone }).lean(),
      Booking.find({ customerPhone: phone })
        .sort({ scheduledDate: -1 })
        .select('bookingId serviceLabel scheduledDate timeSlot totalAmount status payment createdAt')
        .lean(),
    ]);

    if (!statsArr.length) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const data = {
      ...statsArr[0],
      _id: profile?._id || null,
      tags: profile?.tags || [],
      notes: profile?.notes || '',
      communicationLog: profile?.communicationLog || [],
      isInactive: new Date(statsArr[0].lastServiceDate) < inactiveThreshold(),
      bookings,
    };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/customers/:phone ────────────────────────────────────────────────
const updateCustomer = async (req, res, next) => {
  try {
    const { phone } = req.params;
    const { tags, notes, logEntry } = req.body;

    // Verify customer exists in bookings
    const exists = await Booking.exists({ customerPhone: phone });
    if (!exists) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Get the real name from bookings
    const booking = await Booking.findOne({ customerPhone: phone }).select('customerName').lean();

    const update = {};
    if (tags !== undefined) update.tags = tags;
    if (notes !== undefined) update.notes = notes;
    if (booking?.customerName) update.name = booking.customerName;

    const customer = await Customer.findOneAndUpdate(
      { phone },
      {
        $set: update,
        ...(logEntry ? { $push: { communicationLog: logEntry } } : {}),
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/customers/sync ─────────────────────────────────────────────────
// One-time migration: create Customer records for all existing bookings
const syncCustomers = async (req, res, next) => {
  try {
    const stats = await aggregateStats(null);
    let created = 0;
    let skipped = 0;

    for (const s of stats) {
      const existing = await Customer.findOne({ phone: s.phone });
      if (existing) { skipped++; continue; }
      await Customer.create({ phone: s.phone, name: s.name });
      created++;
    }

    res.json({ success: true, message: `Sync done — ${created} created, ${skipped} already existed` });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCustomers, getCustomer, updateCustomer, getCRMStats, syncCustomers };
