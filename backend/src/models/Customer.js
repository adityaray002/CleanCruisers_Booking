const mongoose = require('mongoose');

const communicationLogSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['whatsapp', 'call', 'note'], default: 'note' },
    message: { type: String, required: true },
    sentBy: { type: String, default: 'system' },
  },
  { timestamps: true, _id: true }
);

const customerSchema = new mongoose.Schema(
  {
    // Phone is the unique identifier (customers rarely provide email)
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    tags: {
      type: [String],
      enum: ['vip', 'regular', 'new', 'inactive', 'sofa', 'at-risk'],
      default: [],
    },
    notes: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    communicationLog: [communicationLogSchema],
  },
  { timestamps: true }
);


module.exports = mongoose.model('Customer', customerSchema);
