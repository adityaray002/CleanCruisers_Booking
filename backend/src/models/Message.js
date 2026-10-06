const mongoose = require('mongoose');
const WhatsAppContact = require('./WhatsAppContact');

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
// Auto-delete chat text after 90 days. Customer numbers live on in WhatsAppContact.
// Changing this value also needs the DB index updated: src/scripts/whatsappContactsMigration.js
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

messageSchema.post('save', function (doc) {
  WhatsAppContact.recordMessage(doc).catch((err) =>
    console.error('[CONTACT] Failed to record contact:', doc.customerPhone, err.message)
  );
});

module.exports = mongoose.model('Message', messageSchema);
