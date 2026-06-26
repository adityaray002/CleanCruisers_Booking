const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'cleancruisers_webhook_2024';

const getBizId = (phoneNumberId) => {
  if (phoneNumberId === process.env.SOFASHINE_PHONE_NUMBER_ID)     return 'sofashine';
  if (phoneNumberId === process.env.CLEANCRUISERS_PHONE_NUMBER_ID) return 'cleancruisers';
  return 'unknown';
};

// Meta webhook verification — GET request from Meta to confirm endpoint
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] ✅ Meta webhook verified');
    return res.status(200).send(challenge);
  }

  console.warn('[WEBHOOK] ❌ Verification failed — token mismatch');
  res.sendStatus(403);
});

// Incoming messages — POST from Meta
router.post('/', (req, res) => {
  // Acknowledge immediately (Meta requires 200 within 5s)
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  const entry   = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value   = changes?.value;

  // Ignore status updates (delivered, read, etc.)
  if (!value?.messages?.length) return;

  const message       = value.messages[0];
  const businessPhone = value.metadata?.phone_number_id;
  const from          = message.from;
  const msgType       = message.type;

  let text = '';
  if (msgType === 'text')        text = message.text?.body?.trim() || '';
  if (msgType === 'interactive') text = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || '';
  if (msgType === 'location') {
    text = `__LOCATION__:${message.location.latitude},${message.location.longitude}`;
  }

  // Human-readable version saved to inbox (titles instead of IDs)
  let displayText = text;
  if (msgType === 'interactive') {
    const r = message.interactive?.button_reply || message.interactive?.list_reply;
    displayText = r?.title || text;
  } else if (msgType === 'location') {
    displayText = '📍 Location shared';
  } else if (!displayText) {
    displayText = `[${msgType}]`;
  }

  console.log(`[WEBHOOK] 📩 ${businessPhone} ← ${from}: "${text}"`);

  // Save inbound message to inbox (fire-and-forget)
  Message.create({
    customerPhone: from,
    businessId:    getBizId(businessPhone),
    direction:     'inbound',
    text:          displayText,
    sentBy:        'customer',
    msgType,
    waMessageId:   message.id,
  }).catch(() => {});

  // Hand off to bot handler (async — don't block the 200 response)
  const { handleIncoming } = require('../utils/whatsappBot');
  handleIncoming({ from, text, msgType, businessPhone, rawMessage: message }).catch((err) => {
    console.error('[WEBHOOK] Bot error:', err.message);
  });
});

module.exports = router;
