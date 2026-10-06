const mongoose = require('mongoose');

// One permanent record per customer+business. No TTL: survives the 90-day message cleanup.
const whatsAppContactSchema = new mongoose.Schema({
  customerPhone:  { type: String, required: true, trim: true }, // as WhatsApp sends it, e.g. 919876543210
  businessId:     { type: String, required: true },
  profileName:    { type: String, trim: true, default: '' },
  firstMessageAt: { type: Date },
  lastMessageAt:  { type: Date },
  lastMessage:    { type: String, default: '' },
  lastDirection:  { type: String, enum: ['inbound', 'outbound'] },
}, { timestamps: true });

whatsAppContactSchema.index({ customerPhone: 1, businessId: 1 }, { unique: true });
whatsAppContactSchema.index({ lastMessageAt: -1 });

// Upsert from a saved message. Two steps so out-of-order saves never overwrite a newer preview.
whatsAppContactSchema.statics.recordMessage = async function (msg) {
  const key = { customerPhone: msg.customerPhone, businessId: msg.businessId };
  const at  = msg.createdAt || new Date();
  const last = { lastMessageAt: at, lastMessage: msg.text || '', lastDirection: msg.direction };

  await this.updateOne(key, { $min: { firstMessageAt: at }, $setOnInsert: last }, { upsert: true });
  await this.updateOne(
    { ...key, $or: [{ lastMessageAt: { $lt: at } }, { lastMessageAt: { $exists: false } }] },
    { $set: last }
  );
};

module.exports = mongoose.model('WhatsAppContact', whatsAppContactSchema);
