// One-time migration:
//   1. Change the messages TTL index from 7 days to 90 days (DB-side; editing the schema alone does not do this)
//   2. Back-fill permanent WhatsAppContact records from existing messages and chat labels
//
// Usage (from backend/):
//   node src/scripts/whatsappContactsMigration.js           -> dry run, only reports
//   node src/scripts/whatsappContactsMigration.js --apply   -> makes the changes
//
// Run this BEFORE deploying the new Message model, otherwise Mongoose may log an index options conflict on startup.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const WhatsAppContact = require('../models/WhatsAppContact');

const APPLY = process.argv.includes('--apply');
const TARGET_TTL = 90 * 24 * 60 * 60;

const isCreatedAtOnly = (idx) => Object.keys(idx.key).length === 1 && idx.key.createdAt === 1;

const migrateTTL = async (db) => {
  const messages = db.collection('messages');
  const ttlIndex = (await messages.indexes()).find(isCreatedAtOnly);
  const current = ttlIndex?.expireAfterSeconds;

  console.log(`\n[TTL] Current: ${current === undefined ? 'no TTL index' : `${current / 86400} days`} -> target: 90 days`);
  if (current === TARGET_TTL) return console.log('[TTL] Already 90 days, nothing to do.');
  if (!APPLY) return console.log('[TTL] Dry run, not changing.');

  if (!ttlIndex) {
    await messages.createIndex({ createdAt: 1 }, { expireAfterSeconds: TARGET_TTL });
    return console.log('[TTL] Created 90-day TTL index.');
  }
  try {
    await db.command({ collMod: 'messages', index: { keyPattern: { createdAt: 1 }, expireAfterSeconds: TARGET_TTL } });
    console.log('[TTL] Updated via collMod.');
  } catch (err) {
    console.warn(`[TTL] collMod not allowed (${err.message}); dropping and recreating the index.`);
    await messages.dropIndex(ttlIndex.name);
    await messages.createIndex({ createdAt: 1 }, { expireAfterSeconds: TARGET_TTL });
    console.log('[TTL] Recreated as 90-day TTL index.');
  }
};

const backfillContacts = async (db) => {
  const groups = await db.collection('messages').aggregate([
    { $sort: { createdAt: 1 } },
    { $group: {
      _id:           { customerPhone: '$customerPhone', businessId: '$businessId' },
      firstAt:       { $first: '$createdAt' },
      lastAt:        { $last: '$createdAt' },
      lastMessage:   { $last: '$text' },
      lastDirection: { $last: '$direction' },
    }},
  ]).toArray();
  const labels = await db.collection('chatlabels').find().toArray();
  const existing = await WhatsAppContact.countDocuments();

  console.log(`\n[CONTACTS] Existing contacts: ${existing}`);
  console.log(`[CONTACTS] Customers found in messages: ${groups.length}`);
  console.log(`[CONTACTS] Customers found in chat labels: ${labels.length}`);
  if (!APPLY) return console.log('[CONTACTS] Dry run, not writing.');

  await WhatsAppContact.createIndexes();

  const ops = [];
  for (const g of groups) {
    const key  = { customerPhone: g._id.customerPhone, businessId: g._id.businessId };
    const last = { lastMessageAt: g.lastAt, lastMessage: g.lastMessage || '', lastDirection: g.lastDirection };
    ops.push({ updateOne: { filter: key, update: { $min: { firstMessageAt: g.firstAt }, $setOnInsert: last }, upsert: true } });
    ops.push({ updateOne: {
      filter: { ...key, $or: [{ lastMessageAt: { $lt: g.lastAt } }, { lastMessageAt: { $exists: false } }] },
      update: { $set: last },
    } });
  }
  for (const l of labels) {
    const key = { customerPhone: l.customerPhone, businessId: l.businessId };
    ops.push({ updateOne: { filter: key, update: { $min: { firstMessageAt: l.createdAt } }, upsert: true } });
  }

  if (ops.length) await WhatsAppContact.bulkWrite(ops, { ordered: true });
  console.log(`[CONTACTS] Done. Total contacts now: ${await WhatsAppContact.countDocuments()}`);
};

(async () => {
  console.log(APPLY ? 'MODE: APPLY (changes will be written)' : 'MODE: DRY RUN (no changes)');
  // Stop Mongoose creating collections/indexes on connect, so a dry run writes nothing
  mongoose.set('autoCreate', false);
  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.host} / ${mongoose.connection.name}`);
  try {
    await migrateTTL(mongoose.connection.db);
    await backfillContacts(mongoose.connection.db);
  } finally {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
