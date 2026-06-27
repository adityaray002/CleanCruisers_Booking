const express    = require('express');
const router     = express.Router();
const { protect } = require('../middleware/auth');
const { getConversations, getMessages, sendReply } = require('../controllers/inboxController');

router.get('/',              protect, getConversations);
router.get('/:phone',        protect, getMessages);
router.post('/:phone/reply', protect, sendReply);

module.exports = router;
