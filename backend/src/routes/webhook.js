const express = require('express');
const router = express.Router();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'cleancruisers_webhook_2024';

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

  const message      = value.messages[0];
  const businessPhone = value.metadata?.phone_number_id; // Meta phone number ID (maps to business)
  const from         = message.from; // customer's phone
  const msgType      = message.type; // text, interactive, location, etc.

  let text = '';
  if (msgType === 'text')        text = message.text?.body?.trim() || '';
  if (msgType === 'interactive') text = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || '';
  if (msgType === 'location') {
    // Customer shared location pin
    text = `__LOCATION__:${message.location.latitude},${message.location.longitude}`;
  }

  console.log(`[WEBHOOK] 📩 ${businessPhone} ← ${from}: "${text}"`);

  // Hand off to bot handler (async — don't block the 200 response)
  const { handleIncoming } = require('../utils/whatsappBot');
  handleIncoming({ from, text, msgType, businessPhone, rawMessage: message }).catch((err) => {
    console.error('[WEBHOOK] Bot error:', err.message);
  });
});

module.exports = router;
