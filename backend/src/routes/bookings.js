const express = require('express');
const router = express.Router();
const {
  createBooking,
  adminCreateBooking,
  getSchedule,
  getCustomerHistory,
  getBookings,
  getBooking,
  updateBooking,
  getAnalytics,
  clockIn,
  clockOut,
  getOvertimeAlerts,
  resendWorkerMessage,
} = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');

// Admin-only routes
router.get('/analytics', protect, getAnalytics);
router.get('/schedule', protect, getSchedule);
router.get('/customer', protect, getCustomerHistory);
router.get('/overtime-alerts', protect, getOvertimeAlerts);
router.post('/admin', protect, adminCreateBooking);
router.post('/:id/clock-in', protect, clockIn);
router.post('/:id/clock-out', protect, clockOut);
router.post('/:id/resend-worker', protect, resendWorkerMessage);

// Public
router.post('/', createBooking);
router.get('/:id', getBooking);

// Admin-protected
router.get('/', protect, getBookings);
router.put('/:id', protect, updateBooking);

module.exports = router;
