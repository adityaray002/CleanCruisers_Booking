const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomer,
  updateCustomer,
  getCRMStats,
  syncCustomers,
} = require('../controllers/customerController');
const { protect } = require('../middleware/auth');

// All customer routes are admin-only
router.get('/stats', protect, getCRMStats);
router.post('/sync', protect, syncCustomers);
router.get('/', protect, getCustomers);
router.get('/:phone', protect, getCustomer);
router.put('/:phone', protect, updateCustomer);

module.exports = router;
