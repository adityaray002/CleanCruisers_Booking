const express = require('express');
const router = express.Router();
const {
  getServices, getService, createService, updateService, deleteService,
} = require('../controllers/serviceController');
const { protect } = require('../middleware/auth');

// Public — active services only (no token = public view)
router.get('/', getServices);
router.get('/:id', getService);

// Admin-protected
router.post('/', protect, createService);
router.put('/:id', protect, updateService);
router.delete('/:id', protect, deleteService);

module.exports = router;
