const mongoose = require('mongoose');

// Admin-controlled WhatsApp bot settings, one document per business
const botSettingSchema = new mongoose.Schema({
  businessId:  { type: String, required: true, unique: true },
  // What "Book Cleaning" opens: 'deep_cleaning' = BHK packages only, 'classic' = all individual services
  bookingMode: { type: String, enum: ['deep_cleaning', 'classic'], default: 'deep_cleaning' },
}, { timestamps: true });

botSettingSchema.statics.getBookingMode = async function (businessId) {
  const doc = await this.findOne({ businessId }).select('bookingMode').lean();
  return doc?.bookingMode || 'deep_cleaning';
};

module.exports = mongoose.model('BotSetting', botSettingSchema);
