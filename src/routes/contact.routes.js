const express = require('express');
const router = express.Router();
const { sendContactEmail } = require('../utils/email');

router.post('/', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required.' });
  }
  try {
    await sendContactEmail(name, email, message);
    res.json({ success: true });
  } catch (err) {
    console.error('Contact email error:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;
