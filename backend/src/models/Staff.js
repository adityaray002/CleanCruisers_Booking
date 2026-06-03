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

// Per-date override: lets admin mark a specific calendar date as available or unavailable,
// overriding the day-of-week schedule. Used for compensatory days (e.g., took Saturday off
// but will work next Wednesday which is normally their day off).
const dateOverrideSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    isAvailable: { type: Boolean, required: true },
    note: { type: String, maxlength: 200 },
  },
  { _id: true }
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
    dateOverrides: [dateOverrideSchema],
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

// Check if staff is available on a given date, respecting date overrides first
staffSchema.methods.isAvailableOn = function (date) {
  const d = new Date(date);
  const dateStr = d.toDateString();
  const override = this.dateOverrides?.find((o) => new Date(o.date).toDateString() === dateStr);
  if (override !== undefined) return override.isAvailable;
  const dayOfWeek = d.getDay();
  const dayAvail = this.availability.find((a) => a.dayOfWeek === dayOfWeek && a.isAvailable);
  return !!dayAvail;
};

module.exports = mongoose.model('Staff', staffSchema);
