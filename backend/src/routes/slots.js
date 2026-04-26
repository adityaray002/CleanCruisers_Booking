const express = require('express');
const router = express.Router();
const { getAvailableSlots } = require('../utils/slotManager');
const { SERVICES, ADD_ONS } = require('../utils/pricing');

// @desc    Get available slots for a date
// @route   GET /api/slots?date=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date parameter is required' });
    }

    const slots = await getAvailableSlots(date);
    res.json({ success: true, data: slots });
  } catch (err) {
    next(err);
  }
});

// @desc    Get all services and pricing
// @route   GET /api/slots/services
router.get('/services', (req, res) => {
  const services = Object.entries(SERVICES).map(([key, val]) => ({
    id: key,
    ...val,
    addOnDetails: val.addOns.map((k) => ({ id: k, ...ADD_ONS[k] })),
  }));

  res.json({ success: true, data: services });
});

module.exports = router;
