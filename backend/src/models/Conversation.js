const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  customerPhone: { type: String, required: true },
  businessId:    { type: String, required: true }, // 'sofashine' | 'cleancruisers'
  step: {
    type: String,
    default: 'AWAITING_MAIN_MENU',
    enum: [
      'AWAITING_MAIN_MENU',
      'AWAITING_SERVICE',
      'AWAITING_SUBSERVICE',
      'AWAITING_CUSTOM_REQUEST',
      'AWAITING_QUANTITY',
      'AWAITING_SEAT_COUNT',
      'AWAITING_QUICK_ORDER',
      'AWAITING_ADD_MORE',
      'AWAITING_DATE',
      'AWAITING_TIME_GROUP',
      'AWAITING_TIME',
      'AWAITING_ADDRESS',
      'AWAITING_NAME',
      'AWAITING_CONFIRM',
      'AWAITING_EXISTING_BOOKING',
      'AWAITING_FAQ',
      'AWAITING_BHK',
      'AWAITING_DC_EXTRAS',
      'AWAITING_DC_EXTRA_BATH',
      'AWAITING_DC_EXTRA_BALCONY',
      'AWAITING_DC_SUMMARY',
      'COMPLETED',
    ],
  },
  data: {
    service:          String,
    subService:       String,
    quotedAmount:     Number,
    date:             Date,
    timeSlot:         String,
    address:          String,
    name:             String,
    leadId:           String,
    selectedServices: { type: mongoose.Schema.Types.Mixed, default: [] },
    pendingSubService: String,
    pendingUnitPrice:  Number,
    pendingPriceMap:   { type: mongoose.Schema.Types.Mixed },
    dcBhk:             Number,
    dcExtraBath:       Number,
    dcExtraBalcony:    Number,
  },
  lastActivity: { type: Date, default: Date.now },
}, { timestamps: true });

// Unique active conversation per customer+business
conversationSchema.index({ customerPhone: 1, businessId: 1 });
// Auto-delete abandoned conversations after 24 hours of inactivity
conversationSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Conversation', conversationSchema);
