const axios = require('axios');

const BASE = 'https://graph.facebook.com/v19.0';

const post = (phoneNumberId, token, body) =>
  axios.post(`${BASE}/${phoneNumberId}/messages`, body, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }).catch((err) => {
    console.error('[META] Send failed:', err.response?.data || err.message);
    throw err;
  });

// Plain text
const sendText = (to, text, phoneNumberId, token) =>
  post(phoneNumberId, token, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  });

// Up to 3 quick-reply buttons
const sendButtons = (to, body, buttons, phoneNumberId, token) =>
  post(phoneNumberId, token, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.substring(0, 20) },
        })),
      },
    },
  });

// List menu — up to 10 items per section
const sendList = (to, body, buttonLabel, sections, phoneNumberId, token) =>
  post(phoneNumberId, token, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: { button: buttonLabel, sections },
    },
  });

module.exports = { sendText, sendButtons, sendList };
