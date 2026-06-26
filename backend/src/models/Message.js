const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  customerPhone: { type: String, required: true, trim: true },
  businessId:    { type: String, required: true },
  direction:     { type: String, enum: ['inbound', 'outbound'], required: true },
  text:          { type: String, default: '' },
  sentBy:        { type: String, enum: ['customer', 'bot', 'admin'], default: 'customer' },
  msgType:       { type: String, default: 'text' },
  waMessageId:   { type: String },
}, { timestamps: true });

messageSchema.index({ customerPhone: 1, businessId: 1, createdAt: 1 });
messageSchema.index({ waMessageId: 1 }, { sparse: true, unique: true });

module.exports = mongoose.model('Message', messageSchema);
