const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  customerPhone: { type: String, required: true },
  businessId:    { type: String, required: true }, // 'sofashine' | 'cleancruisers'
  step: {
    type: String,
    default: 'AWAITING_SERVICE',
    enum: [
      'AWAITING_SERVICE',
      'AWAITING_SUBSERVICE',
      'AWAITING_DATE',
      'AWAITING_TIME',
      'AWAITING_ADDRESS',
      'AWAITING_NAME',
      'AWAITING_CONFIRM',
      'COMPLETED',
    ],
  },
  data: {
    service:      String,   // e.g. 'Sofa Cleaning'
    subService:   String,   // e.g. '3 Seater'
    quotedAmount: Number,
    date:         Date,
    timeSlot:     String,
    address:      String,
    name:         String,
  },
  lastActivity: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique active conversation per customer+business
conversationSchema.index({ customerPhone: 1, businessId: 1 });
// Auto-delete abandoned conversations after 24 hours of inactivity
conversationSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Conversation', conversationSchema);
