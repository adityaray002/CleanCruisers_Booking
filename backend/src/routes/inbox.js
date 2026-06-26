const express = require('express');
const router  = express.Router();
const { getConversations, getMessages, sendReply } = require('../controllers/inboxController');
const { protect } = require('../middleware/auth');

router.get('/',              protect, getConversations);
router.get('/:phone',        protect, getMessages);
router.post('/:phone/reply', protect, sendReply);

module.exports = router;
