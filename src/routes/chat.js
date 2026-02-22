const express = require("express");
const router = express.Router();
const ChatController = require("../controller/Chat");
const authMiddleware = require("../middleware/auth");

// All chat routes require authentication
router.use(authMiddleware);

// Create a new chat room (called after a proposal is accepted)
router.post("/rooms", ChatController.createChatRoom);

// Get chat room metadata and validate participant access
router.get("/rooms/:chatId", ChatController.getChatRoom);

module.exports = router;
