const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  getConversations,
  createOrGetConversation,
  getConversationMessages,
  sendMessage,
  markConversationRead,
} = require("../controllers/message.controller");

router.get("/conversations", authMiddleware, getConversations);
router.post("/conversations", authMiddleware, createOrGetConversation);
router.get("/conversations/:id", authMiddleware, getConversationMessages);
router.post("/conversations/:id/messages", authMiddleware, sendMessage);
router.put("/conversations/:id/read", authMiddleware, markConversationRead);

module.exports = router;
