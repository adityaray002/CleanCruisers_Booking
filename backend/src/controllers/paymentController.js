const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const { sendBookingConfirmation, sendStaffAssignment } = require('../utils/notifications');

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// @desc    Create Razorpay order
// @route   POST /api/payments/create-order
// @access  Public
const createOrder = async (req, res, next) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.payment.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Booking already paid' });
    }

    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({ success: false, message: 'Payment gateway not configured' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(booking.totalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: booking.bookingId,
      notes: {
        bookingId: booking.bookingId,
        customerName: booking.customerName,
        serviceType: booking.serviceType,
      },
    });

    // Store order ID
    booking.payment.razorpayOrderId = order.id;
    await booking.save({ validateBeforeSave: false });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        bookingId: booking.bookingId,
        keyId: process.env.RAZORPAY_KEY_ID,
        prefill: {
          name: booking.customerName,
          email: booking.customerEmail,
          contact: booking.customerPhone,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Razorpay payment
// @route   POST /api/payments/verify
// @access  Public
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;

    // Verify signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // Update booking
    const booking = await Booking.findOneAndUpdate(
      { bookingId },
      {
        'payment.status': 'paid',
        'payment.razorpayPaymentId': razorpay_payment_id,
        'payment.razorpaySignature': razorpay_signature,
        'payment.paidAt': new Date(),
        status: 'confirmed',
      },
      { new: true }
    ).populate('assignedStaff');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Send confirmation notification
    try {
      const notifResult = await sendBookingConfirmation(booking);
      await Booking.findByIdAndUpdate(booking._id, {
        'notifications.confirmationSent': notifResult.success,
      });

      if (booking.assignedStaff) {
        await sendStaffAssignment(booking);
      }
    } catch (notifErr) {
      console.error('[PAYMENT] Notification failed:', notifErr.message);
    }

    res.json({
      success: true,
      message: 'Payment verified and booking confirmed!',
      data: booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Handle Razorpay webhook
// @route   POST /api/payments/webhook
// @access  Public (webhook)
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (signature !== expectedSignature) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      }
    }

    const { event, payload } = req.body;

    if (event === 'payment.failed') {
      const orderId = payload.payment.entity.order_id;
      await Booking.findOneAndUpdate(
        { 'payment.razorpayOrderId': orderId },
        { 'payment.status': 'failed', status: 'pending' }
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { createOrder, verifyPayment, handleWebhook };
