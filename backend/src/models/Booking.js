const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    landmark: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ['razorpay', 'cod'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    amount: { type: Number, required: true },
    paidAt: { type: Date },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      unique: true,
      default: () => `BK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
    },
    // Customer info
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    customerEmail: {
      type: String,
      required: [true, 'Customer email is required'],
      trim: true,
      lowercase: true,
    },
    customerPhone: {
      type: String,
      required: [true, 'Customer phone is required'],
      trim: true,
    },

    // Service details
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    serviceLabel: { type: String, required: [true, 'Service label is required'] },
    customServiceDescription: { type: String, maxlength: 1000 },
    addOns: [{ type: String }],

    // Scheduling
    scheduledDate: {
      type: Date,
      required: [true, 'Scheduled date is required'],
    },
    timeSlot: {
      type: String,
      required: [true, 'Time slot is required'],
    },
    duration: {
      type: Number, // in hours
      required: true,
      default: 2,
    },

    // Address
    address: { type: addressSchema, required: true },

    // Pricing
    basePrice: { type: Number, required: true },
    addOnPrice: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    // Status
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
      default: 'pending',
    },

    // Staff assignment
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },

    // Payment
    payment: { type: paymentSchema },

    // Notifications
    notifications: {
      confirmationSent: { type: Boolean, default: false },
      reminderSent: { type: Boolean, default: false },
    },

    // Admin notes (internal)
    adminNotes: { type: String, maxlength: 1000 },

    // Notes sent to the assigned worker
    workerNotes: { type: String, maxlength: 1000 },

    // How the booking was created
    source: {
      type: String,
      enum: ['website', 'phone', 'walkin', 'admin'],
      default: 'website',
    },

    // Which admin created this booking
    bookedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Actual job timing (tracked by admin when worker calls in)
    actualStartTime: { type: Date, default: null },   // when worker actually started
    actualEndTime:   { type: Date, default: null },   // when worker actually finished
    overtimeMinutes: { type: Number, default: 0 },    // computed on finish

    // Cancellation
    cancellationReason: { type: String },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes for performance (bookingId index comes from unique:true above)
bookingSchema.index({ scheduledDate: 1, timeSlot: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ assignedStaff: 1 });
bookingSchema.index({ customerPhone: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
