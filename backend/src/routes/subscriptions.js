const express = require('express');
const router = express.Router();
const { getAll, create, update, remove, getStats, checkConflict } = require('../controllers/subscriptionController');
const { protect } = require('../middleware/auth');

router.get('/stats', protect, getStats);
router.get('/check-conflict', protect, checkConflict);
router.get('/', protect, getAll);
router.post('/', protect, create);
router.put('/:id', protect, update);
router.delete('/:id', protect, remove);

module.exports = router;
