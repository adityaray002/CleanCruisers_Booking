const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    name:          { type: String, required: true, trim: true },
    phone:         { type: String, required: true, trim: true },
    service:       { type: String, required: true, trim: true },
    address:       { type: String, trim: true },
    preferredTime: { type: String, trim: true },
    frequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly'],
      required: true,
    },
    price:       { type: Number, default: 0 },
    startDate:   { type: Date, required: true },
    nextDueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'paused', 'cancelled'],
      default: 'active',
    },
    businessId: {
      type: String,
      enum: ['cleancruisers', 'sofashine'],
      default: 'cleancruisers',
    },
    notes:           { type: String, maxlength: 1000 },
    lastReminderSent: { type: Date },
  },
  { timestamps: true }
);

subscriptionSchema.index({ nextDueDate: 1, status: 1 });
subscriptionSchema.index({ phone: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
