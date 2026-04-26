const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number, // 0 = Sunday, 6 = Saturday
      required: true,
      min: 0,
      max: 6,
    },
    startTime: { type: String, required: true }, // "09:00"
    endTime: { type: String, required: true },   // "18:00"
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false }
);

const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Staff name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    photo: {
      type: String,
      default: null,
    },
    specializations: [{ type: String, trim: true }],
    availability: [availabilitySchema],
    isActive: {
      type: Boolean,
      default: true,
    },
    rating: {
      type: Number,
      default: 5.0,
      min: 1,
      max: 5,
    },
    totalJobs: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// Virtual: full availability check
staffSchema.methods.isAvailableOn = function (date) {
  const dayOfWeek = new Date(date).getDay();
  const dayAvail = this.availability.find(
    (a) => a.dayOfWeek === dayOfWeek && a.isAvailable
  );
  return !!dayAvail;
};

module.exports = mongoose.model('Staff', staffSchema);
