const messageService = require('../services/message.service');

function handleServiceError(err, res) {
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
}

async function getConversations(req, res) {
  try {
    const conversations = await messageService.getConversations(req.user.id, req.query.role);
    res.json({ conversations });
  } catch (err) {
    console.error(err);
    handleServiceError(err, res);
  }
}

async function createOrGetConversation(req, res) {
  try {
    const conversation = await messageService.createOrGetConversation(req.user.id, req.body);
    res.json({ conversation });
  } catch (err) {
    console.error(err);
    handleServiceError(err, res);
  }
}

async function getConversationMessages(req, res) {
  try {
    const conversation = await messageService.getConversationMessages(req.user.id, req.params.id);
    res.json({ conversation });
  } catch (err) {
    console.error(err);
    handleServiceError(err, res);
  }
}

async function sendMessage(req, res) {
  try {
    const message = await messageService.sendMessage(req.user.id, req.params.id, req.body.content);
    res.json({ message });
  } catch (err) {
    console.error(err);
    handleServiceError(err, res);
  }
}

async function markConversationRead(req, res) {
  try {
    await messageService.markConversationRead(req.user.id, req.params.id);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error(err);
    handleServiceError(err, res);
  }
}

module.exports = { getConversations, createOrGetConversation, getConversationMessages, sendMessage, markConversationRead };
