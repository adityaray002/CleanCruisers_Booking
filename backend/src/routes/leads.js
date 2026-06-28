const express = require('express');
const router = express.Router();
const { getLeads, createLead, updateLead, archiveLead, restoreLead, getLeadStats, createWebsiteLead, confirmLead, convertToBooking } = require('../controllers/leadController');
const { protect } = require('../middleware/auth');

// Public route — SofaShine website checkout (API key auth only, no JWT)
router.post('/website', createWebsiteLead);

router.get('/stats', protect, getLeadStats);
router.get('/', protect, getLeads);
router.post('/', protect, createLead);
router.post('/:id/confirm', protect, confirmLead);
router.post('/:id/convert', protect, convertToBooking);
router.put('/:id', protect, updateLead);
router.patch('/:id/archive', protect, archiveLead);
router.patch('/:id/restore', protect, restoreLead);

module.exports = router;
