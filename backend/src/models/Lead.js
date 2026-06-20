const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    serviceInterest: { type: String, trim: true },
    quotedAmount: { type: Number, default: 0 },
    stage: {
      type: String,
      enum: ['new', 'quoted', 'follow_up', 'booked', 'lost'],
      default: 'new',
    },
    followUpDate: { type: Date },
    notes: { type: String, maxlength: 2000, default: '' },
    source: {
      type: String,
      enum: ['phone', 'whatsapp', 'website', 'walkin', 'referral', 'google_ads', 'meta_ads'],
      default: 'phone',
    },
    convertedBookingId: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

leadSchema.index({ stage: 1 });
leadSchema.index({ phone: 1 });

module.exports = mongoose.model('Lead', leadSchema);
