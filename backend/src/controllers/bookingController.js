const Booking = require('../models/Booking');
const Staff = require('../models/Staff');
const Service = require('../models/Service');
const { isSlotAvailable, isValidBookingDate, TIME_SLOTS } = require('../utils/slotManager');
const {
  sendBookingConfirmation,
  sendWorkerAssignment,
  sendWorkerBookingUpdate,
  sendWorkerCancellation,
  sendWorkerReschedule,
  sendWorkerOvertimeAlert,
  sendCustomerBookingUpdate,
  sendCustomerCancellation,
  sendStaffAssignment,
} = require('../utils/notifications');

// â"€â"€â"€ PUBLIC: Customer creates booking via website â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const createBooking = async (req, res, next) => {
  try {
    const {
      customerName, customerEmail, customerPhone,
      serviceId, customServiceDescription, addOnIds = [],
      scheduledDate, timeSlot, address,
      paymentMethod = 'razorpay',
    } = req.body;

    if (!isValidBookingDate(scheduledDate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking date. Must be at least 2 hours from now and within 90 days.',
      });
    }

    const slotAvailable = await isSlotAvailable(scheduledDate, timeSlot);
    if (!slotAvailable) {
      return res.status(409).json({ success: false, message: 'This time slot is no longer available.' });
    }

    const service = await Service.findById(serviceId);
    if (!service || !service.isActive) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    if (service.price === 0 && !customServiceDescription?.trim()) {
      return res.status(400).json({ success: false, message: 'Please describe your service requirement.' });
    }

    if (!service.allowOnlinePayment && paymentMethod === 'razorpay') {
      return res.status(400).json({ success: false, message: 'This service requires Cash on Delivery.' });
    }

    const selectedAddOns = (addOnIds || []).map((id) => service.addOns.id(id)).filter(Boolean);
    const addOnPrice = selectedAddOns.reduce((sum, a) => sum + a.price, 0);
    const basePrice = service.price;
    const totalAmount = basePrice + addOnPrice;

    const dayOfWeek = new Date(scheduledDate).getDay();
    const { startOfDay, endOfDay } = getDayRange(scheduledDate);

    const bookedStaffIds = await Booking.distinct('assignedStaff', {
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
      timeSlot,
      status: { $nin: ['cancelled'] },
    });

    const availableStaff = await Staff.findOne({
      isActive: true,
      'availability.dayOfWeek': dayOfWeek,
      'availability.isAvailable': true,
      _id: { $nin: bookedStaffIds.filter(Boolean) },
    });

    const booking = await Booking.create({
      customerName, customerEmail, customerPhone,
      serviceId: service._id,
      serviceLabel: service.name,
      customServiceDescription: customServiceDescription || undefined,
      addOns: selectedAddOns.map((a) => a.label),
      scheduledDate, timeSlot,
      duration: service.duration,
      address,
      basePrice, addOnPrice, discount: 0, totalAmount,
      assignedStaff: availableStaff?._id || null,
      payment: { method: paymentMethod, status: 'pending', amount: totalAmount },
      status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
      source: 'website',
    });

    await booking.populate('assignedStaff');
    if (availableStaff) await Staff.findByIdAndUpdate(availableStaff._id, { $inc: { totalJobs: 1 } });

    if (paymentMethod === 'cod') {
      try {
        const notifResult = await sendBookingConfirmation(booking);
        booking.notifications.confirmationSent = notifResult.success;
        await booking.save({ validateBeforeSave: false });
        if (booking.assignedStaff) await sendStaffAssignment(booking);
      } catch (notifErr) {
        console.error('[BOOKING] Notification failed:', notifErr.message);
      }
    }

    res.status(201).json({ success: true, message: 'Booking created successfully', data: booking });
  } catch (err) {
    next(err);
  }
};

// â"€â"€â"€ ADMIN: Create booking via phone call â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const adminCreateBooking = async (req, res, next) => {
  try {
    const {
      customerName, customerEmail, customerPhone,
      serviceName, serviceDescription,
      price,
      scheduledDate, timeSlot,
      address,           // { line1, city, state?, pincode?, landmark? }
      assignedStaffId,
      workerNotes,
      adminNotes,
      paymentMethod = 'cod',
      source = 'phone',
    } = req.body;

    // Basic validation
    if (!customerName?.trim()) return res.status(400).json({ success: false, message: 'Customer name is required.' });
    if (!customerPhone?.trim()) return res.status(400).json({ success: false, message: 'Customer phone is required.' });
    if (!serviceName?.trim()) return res.status(400).json({ success: false, message: 'Service name is required.' });
    if (!scheduledDate) return res.status(400).json({ success: false, message: 'Date is required.' });
    if (!timeSlot) return res.status(400).json({ success: false, message: 'Time slot is required.' });
    if (!address?.line1?.trim()) return res.status(400).json({ success: false, message: 'Address is required.' });

    const parsedPrice = Number(price) || 0;

    // Worker clash check â€" atomic: check then create
    if (assignedStaffId) {
      const { startOfDay, endOfDay } = getDayRange(scheduledDate);
      const clash = await Booking.findOne({
        assignedStaff: assignedStaffId,
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        timeSlot,
        status: { $nin: ['cancelled'] },
      }).populate('assignedStaff', 'name');

      if (clash) {
        const workerName = clash.assignedStaff?.name || 'This worker';
        return res.status(409).json({
          success: false,
          message: `âš ï¸ Clash detected! ${workerName} is already booked at ${timeSlot} for "${clash.serviceLabel}" (${clash.customerName}). Please assign a different worker or change the time slot.`,
        });
      }
    }

    const booking = await Booking.create({
      customerName,
      customerEmail: customerEmail?.trim() || `${customerPhone}@phonebooking.local`,
      customerPhone,
      serviceLabel: serviceName,
      customServiceDescription: serviceDescription || undefined,
      addOns: [],
      scheduledDate: new Date(scheduledDate),
      timeSlot,
      duration: 2,
      address: {
        line1: address.line1,
        line2: address.line2 || '',
        city: address.city || '',
        state: address.state || '',
        pincode: address.pincode || '',
        landmark: address.landmark || '',
      },
      basePrice: parsedPrice,
      addOnPrice: 0,
      discount: 0,
      totalAmount: parsedPrice,
      assignedStaff: assignedStaffId || null,
      workerNotes: workerNotes || undefined,
      adminNotes: adminNotes || undefined,
      payment: { method: paymentMethod, status: 'pending', amount: parsedPrice },
      status: 'confirmed',   // Admin bookings are confirmed immediately
      source,
      bookedBy: req.user._id,
    });

    await booking.populate('assignedStaff');
    if (assignedStaffId) {
      await Staff.findByIdAndUpdate(assignedStaffId, { $inc: { totalJobs: 1 } });
      // Send full WhatsApp briefing to worker
      try { await sendWorkerAssignment(booking); } catch (e) { console.error('[NOTIF] Worker assignment:', e.message); }
    }

    res.status(201).json({ success: true, message: 'Booking created', data: booking });
  } catch (err) {
    next(err);
  }
};

// â"€â"€â"€ ADMIN: Get schedule for a specific day â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const getSchedule = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

    const { startOfDay, endOfDay } = getDayRange(date);

    const [bookings, staff] = await Promise.all([
      Booking.find({
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $nin: ['cancelled'] },
      })
        .populate('assignedStaff', 'name phone whatsappApiKey')
        .populate('bookedBy', 'name')
        .sort({ timeSlot: 1 }),
      Staff.find({ isActive: true }).sort({ name: 1 }),
    ]);

    res.json({ success: true, data: { bookings, staff, timeSlots: TIME_SLOTS } });
  } catch (err) {
    next(err);
  }
};

// â"€â"€â"€ ADMIN: Look up customer history by phone â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const getCustomerHistory = async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone is required' });

    const bookings = await Booking.find({ customerPhone: { $regex: phone.trim() } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('customerName customerPhone address serviceLabel scheduledDate status totalAmount');

    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
};

// â"€â"€â"€ Get all bookings â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const getBookings = async (req, res, next) => {
  try {
    const {
      status, date, startDate, endDate, serviceLabel,
      staffId, search, source,
      page = 1, limit = 20, sort = '-createdAt',
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (serviceLabel) filter.serviceLabel = { $regex: serviceLabel, $options: 'i' };
    if (staffId) filter.assignedStaff = staffId;
    if (source) filter.source = source;

    if (date) {
      const { startOfDay, endOfDay } = getDayRange(date);
      filter.scheduledDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate || endDate) {
      filter.scheduledDate = {};
      if (startDate) filter.scheduledDate.$gte = new Date(startDate);
      if (endDate) filter.scheduledDate.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } },
        { bookingId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Booking.countDocuments(filter);
    const bookings = await Booking.find(filter)
      .populate('assignedStaff', 'name phone whatsappApiKey')
      .populate('bookedBy', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: bookings.length,
      total,
      pagination: { page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
      data: bookings,
    });
  } catch (err) {
    next(err);
  }
};

// â"€â"€â"€ Get single booking â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const getBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    let booking = await Booking.findOne({ bookingId: id }).populate('assignedStaff', 'name phone rating whatsappApiKey').populate('bookedBy', 'name');
    if (!booking) booking = await Booking.findById(id).populate('assignedStaff', 'name phone rating whatsappApiKey').populate('bookedBy', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// â"€â"€â"€ Update booking â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const updateBooking = async (req, res, next) => {
  try {
    const allowed = ['status', 'assignedStaff', 'adminNotes', 'workerNotes', 'scheduledDate', 'timeSlot', 'cancellationReason', 'totalAmount', 'basePrice'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (updates.status === 'cancelled') updates.cancelledAt = new Date();

    // Snapshot BEFORE update (to detect what changed)
    const before = await Booking.findById(req.params.id).populate('assignedStaff', 'name phone whatsappApiKey');
    if (!before) return res.status(404).json({ success: false, message: 'Booking not found' });

    const oldDate  = before.scheduledDate;
    const oldSlot  = before.timeSlot;
    const oldStaff = before.assignedStaff;

    // Worker clash check on re-assignment
    if (updates.assignedStaff && updates.assignedStaff !== 'unassigned') {
      const { startOfDay, endOfDay } = getDayRange(before.scheduledDate);
      const clash = await Booking.findOne({
        assignedStaff: updates.assignedStaff,
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        timeSlot: updates.timeSlot || before.timeSlot,
        status: { $nin: ['cancelled'] },
        _id: { $ne: before._id },
      }).populate('assignedStaff', 'name');

      if (clash) {
        const workerName = clash.assignedStaff?.name || 'This worker';
        return res.status(409).json({
          success: false,
          message: `âš ï¸ Clash! ${workerName} already has a booking at this time: "${clash.serviceLabel}" for ${clash.customerName}.`,
        });
      }
    }

    if (updates.assignedStaff === 'unassigned') updates.assignedStaff = null;

    const booking = await Booking.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('assignedStaff', 'name phone whatsappApiKey')
      .populate('bookedBy', 'name');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // â"€â"€ Decide which notifications to fire â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    const notify = async () => {
      try {
        const isRescheduled = updates.scheduledDate || updates.timeSlot;
        const isCancelled   = updates.status === 'cancelled';

        // Only send "new assignment" notification if the worker actually CHANGED
        const newStaffId = booking.assignedStaff?._id?.toString();
        const oldStaffId = oldStaff?._id?.toString();
        const isNewWorkerAssigned = updates.assignedStaff !== undefined
          && updates.assignedStaff !== null
          && newStaffId !== oldStaffId;

        // 1. Cancellation — notify both worker and customer
        if (isCancelled) {
          if (oldStaff?.phone) await sendWorkerCancellation({ ...booking.toObject(), assignedStaff: oldStaff });
          await sendCustomerCancellation(booking, updates.cancellationReason);
          return;
        }

        // 2. Worker actually changed → send full new-job briefing to new worker
        if (isNewWorkerAssigned && booking.assignedStaff) {
          await sendWorkerAssignment(booking);
          return;
        }

        // 3. Rescheduled → worker gets reschedule message, customer gets update
        if (isRescheduled && booking.assignedStaff) {
          await sendWorkerReschedule(booking, oldDate, oldSlot);
          const changedForCustomer = {};
          if (updates.scheduledDate) changedForCustomer.scheduledDate = updates.scheduledDate;
          if (updates.timeSlot)      changedForCustomer.timeSlot = updates.timeSlot;
          await sendCustomerBookingUpdate(booking, changedForCustomer);
          return;
        }

        // 4. Only notify worker for changes that MATTER to them (notes/price).
        //    Status-only changes (confirmed, in_progress, completed) are silent —
        //    workers already got the full briefing on creation and don't need
        //    a WhatsApp for every admin status button click.
        const workerRelevantFields = ['workerNotes', 'totalAmount', 'basePrice'];
        const relevantChanges = Object.keys(updates).filter(f => workerRelevantFields.includes(f));
        if (relevantChanges.length > 0 && booking.assignedStaff) {
          await sendWorkerBookingUpdate(booking, updates, relevantChanges);
        }
      } catch (e) {
        console.error('[UPDATE] Notification error:', e.message);
      }
    };

    notify(); // fire-and-forget, don't block response

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// â"€â"€â"€ Analytics â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const getAnalytics = async (req, res, next) => {
  try {
    const { period = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const [totalRevenue, bookingsByStatus, bookingsByService, recentRevenue] = await Promise.all([
      Booking.aggregate([
        { $match: { status: 'completed', 'payment.status': 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Booking.aggregate([
        { $group: { _id: '$serviceLabel', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Booking.aggregate([
        { $match: { createdAt: { $gte: startDate }, status: { $in: ['confirmed', 'completed', 'in_progress'] } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const stats = {
      totalRevenue: totalRevenue[0]?.total || 0,
      totalCompletedBookings: totalRevenue[0]?.count || 0,
      bookingsByStatus: bookingsByStatus.reduce((acc, i) => { acc[i._id] = i.count; return acc; }, {}),
      bookingsByService,
      recentRevenue,
    };
    stats.totalBookings = await Booking.countDocuments();
    stats.pendingBookings = stats.bookingsByStatus.pending || 0;
    stats.todayBookings = await Booking.countDocuments({
      scheduledDate: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    });

    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

// â"€â"€â"€ ADMIN: Clock-in â€" mark worker as started â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// POST /api/bookings/:id/clock-in
const clockIn = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('assignedStaff', 'name phone whatsappApiKey');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: `Cannot clock-in a ${booking.status} booking.` });
    }

    const now = new Date();
    booking.actualStartTime = now;
    booking.status = 'in_progress';
    await booking.save();

    // Calculate how late worker arrived (minutes) — supports custom HH:MM slots
    const { hours: startH, minutes: startM } = parseSlotTime(booking.timeSlot, 'start');
    const scheduledStart = new Date(booking.scheduledDate);
    scheduledStart.setHours(startH, startM, 0, 0);
    const lateMinutes = Math.max(0, Math.round((now - scheduledStart) / 60000));

    res.json({
      success: true,
      message: `Clock-in recorded for ${booking.assignedStaff?.name || 'worker'}`,
      data: { booking, lateMinutes },
    });
  } catch (err) { next(err); }
};

// â"€â"€â"€ ADMIN: Clock-out â€" mark worker as finished + detect overtime â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// POST /api/bookings/:id/clock-out
const clockOut = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('assignedStaff', 'name phone whatsappApiKey');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!booking.actualStartTime) {
      return res.status(400).json({ success: false, message: 'Worker has not clocked in yet.' });
    }

    const now = new Date();
    booking.actualEndTime = now;
    booking.status = 'completed';

    // Calculate scheduled end time — supports custom HH:MM slots
    const { hours: endH, minutes: endM } = parseSlotTime(booking.timeSlot, 'end');
    const scheduledEnd = new Date(booking.scheduledDate);
    scheduledEnd.setHours(endH, endM, 0, 0);

    const overtimeMs = now - scheduledEnd;
    booking.overtimeMinutes = Math.max(0, Math.round(overtimeMs / 60000));

    await booking.save();

    // Check if this worker has upcoming bookings today that are now at risk
    const conflicts = [];
    if (booking.assignedStaff && booking.overtimeMinutes > 0) {
      const { startOfDay, endOfDay } = getDayRange(booking.scheduledDate);

      const nextBookings = await Booking.find({
        assignedStaff: booking.assignedStaff._id,
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        _id: { $ne: booking._id },
        status: { $in: ['pending', 'confirmed'] },
      }).sort({ timeSlot: 1 });

      nextBookings.forEach((nb) => {
        const { hours: nbH, minutes: nbM } = parseSlotTime(nb.timeSlot, 'start');
        const nbStart = new Date(nb.scheduledDate);
        nbStart.setHours(nbH, nbM, 0, 0);

        if (now > nbStart) {
          conflicts.push({
            bookingId: nb.bookingId,
            _id: nb._id,
            customerName: nb.customerName,
            customerPhone: nb.customerPhone,
            serviceLabel: nb.serviceLabel,
            timeSlot: nb.timeSlot,
            address: nb.address,
            delayMinutes: Math.round((now - nbStart) / 60000),
          });
        }
      });

      // Notify worker about overtime + next booking
      if (nextBookings.length > 0) {
        try {
          await sendWorkerOvertimeAlert(booking.assignedStaff, booking, nextBookings[0]);
        } catch (e) { console.error('[NOTIF] Overtime alert:', e.message); }
      }
    }

    res.json({
      success: true,
      message: `Job completed. ${booking.overtimeMinutes > 0 ? `Ran ${booking.overtimeMinutes} min overtime.` : 'On time!'}`,
      data: {
        booking,
        overtimeMinutes: booking.overtimeMinutes,
        conflicts, // bookings now affected by this worker's overtime
      },
    });
  } catch (err) { next(err); }
};

// â"€â"€â"€ ADMIN: Get overtime alerts for today â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// GET /api/bookings/overtime-alerts
const getOvertimeAlerts = async (req, res, next) => {
  try {
    const now = new Date();
    const { startOfDay, endOfDay } = getDayRange(now);

    // Find all in_progress bookings where scheduled end time has passed
    const inProgress = await Booking.find({
      status: 'in_progress',
      scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    }).populate('assignedStaff', 'name phone whatsappApiKey');

    const alerts = [];

    for (const booking of inProgress) {
      const { hours: slotEndH, minutes: slotEndM } = parseSlotTime(booking.timeSlot, 'end');
      const scheduledEnd = new Date(booking.scheduledDate);
      scheduledEnd.setHours(slotEndH, slotEndM, 0, 0);

      if (now > scheduledEnd) {
        const overtimeMinutes = Math.round((now - scheduledEnd) / 60000);

        // Find next bookings for this worker today
        const nextBookings = await Booking.find({
          assignedStaff: booking.assignedStaff?._id,
          scheduledDate: { $gte: startOfDay, $lte: endOfDay },
          _id: { $ne: booking._id },
          status: { $in: ['pending', 'confirmed'] },
        }).sort({ timeSlot: 1 }).limit(2);

        alerts.push({
          booking: {
            _id: booking._id,
            bookingId: booking.bookingId,
            customerName: booking.customerName,
            serviceLabel: booking.serviceLabel,
            timeSlot: booking.timeSlot,
            actualStartTime: booking.actualStartTime,
          },
          worker: booking.assignedStaff,
          overtimeMinutes,
          scheduledEnd,
          atRisk: nextBookings.map((nb) => ({
            _id: nb._id,
            bookingId: nb.bookingId,
            customerName: nb.customerName,
            customerPhone: nb.customerPhone,
            serviceLabel: nb.serviceLabel,
            timeSlot: nb.timeSlot,
          })),
        });
      }
    }

    res.json({ success: true, data: alerts });
  } catch (err) { next(err); }
};

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// Parse "08:00 AM - 10:00 AM" â†' start hour (8) and end hour (10)
// Parse "07:30 AM - 08:30 AM" -> { hours, minutes } for start or end
const parseSlotTime = (slot, which) => {
  if (!slot) return { hours: which === 'start' ? 8 : 10, minutes: 0 };
  const parts = slot.split(' - ');
  const part = (which === 'start' ? parts[0] : parts[1])?.trim();
  if (!part) return { hours: which === 'start' ? 8 : 10, minutes: 0 };
  const [timePart, period] = part.split(' ');
  const [hStr, mStr] = timePart.split(':');
  let hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr || '0', 10);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
};

const parseSlotStartHour = (slot) => parseSlotTime(slot, 'start').hours;
const parseSlotEndHour   = (slot) => parseSlotTime(slot, 'end').hours;

const getDayRange = (date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
};

// ─── ADMIN: Re-send full job details to assigned worker ──────────────────────
// POST /api/bookings/:id/resend-worker
const resendWorkerMessage = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('assignedStaff', 'name phone whatsappApiKey');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!booking.assignedStaff?.phone) {
      return res.status(400).json({ success: false, message: 'No worker assigned to this booking' });
    }

    const result = await sendWorkerAssignment(booking);
    res.json({
      success: true,
      sent: result.success,
      message: result.success
        ? `Full job details sent to ${booking.assignedStaff.name} on WhatsApp`
        : result.reason || 'Failed to send WhatsApp message',
    });
  } catch (err) { next(err); }
};

module.exports = {
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
};
