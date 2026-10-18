const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const BotSetting = require('../models/BotSetting');

const BUSINESSES = ['sofashine', 'cleancruisers'];

// GET /api/settings/bot?businessId=sofashine
router.get('/bot', protect, async (req, res) => {
  try {
    const businessId = req.query.businessId || 'sofashine';
    if (!BUSINESSES.includes(businessId)) return res.status(400).json({ success: false, message: 'Invalid businessId' });
    const bookingMode = await BotSetting.getBookingMode(businessId);
    res.json({ success: true, data: { businessId, bookingMode } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/settings/bot  { businessId, bookingMode }
router.put('/bot', protect, async (req, res) => {
  try {
    const { businessId = 'sofashine', bookingMode } = req.body;
    if (!BUSINESSES.includes(businessId)) return res.status(400).json({ success: false, message: 'Invalid businessId' });
    if (!['deep_cleaning', 'classic'].includes(bookingMode)) {
      return res.status(400).json({ success: false, message: 'bookingMode must be deep_cleaning or classic' });
    }
    const doc = await BotSetting.findOneAndUpdate(
      { businessId },
      { $set: { bookingMode } },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    res.json({ success: true, data: { businessId, bookingMode: doc.bookingMode } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
