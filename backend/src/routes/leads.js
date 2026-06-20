const express = require('express');
const router = express.Router();
const { getLeads, createLead, updateLead, deleteLead, getLeadStats, createWebsiteLead } = require('../controllers/leadController');
const { protect } = require('../middleware/auth');

// Public route — SofaShine website checkout (API key auth only, no JWT)
router.post('/website', createWebsiteLead);

router.get('/stats', protect, getLeadStats);
router.get('/', protect, getLeads);
router.post('/', protect, createLead);
router.put('/:id', protect, updateLead);
router.delete('/:id', protect, deleteLead);

module.exports = router;
