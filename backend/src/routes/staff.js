const express = require('express');
const router = express.Router();
const {
  getStaff, getStaffMember, createStaff, updateStaff, deleteStaff,
  getStaffBySlot, getAvailableStaff, sendDaySchedule, notifyWorker,
} = require('../controllers/staffController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/slots', getStaffBySlot);
router.get('/available', getAvailableStaff);
router.post('/:id/notify-schedule', sendDaySchedule);  // POST /api/staff/:id/notify-schedule?date=
router.post('/:id/notify', notifyWorker);               // POST /api/staff/:id/notify  { bookingId?, message }
router.route('/').get(getStaff).post(createStaff);
router.route('/:id').get(getStaffMember).put(updateStaff).delete(deleteStaff);

module.exports = router;
