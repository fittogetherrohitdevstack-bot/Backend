const express = require("express");
const router = express.Router();
const protect = require("../Middleware/auth");
const {
  getUserSquads,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markSquadAsRead,
  getUnreadCounts,
  getSquadChatInfo,
} = require("../Controllers/chatController");

// All chat endpoints require authenticated token
router.use(protect);

// Squads chat list & global unread count
router.get("/squads", getUserSquads);
router.get("/unread-counts", getUnreadCounts);

// Squad specific endpoints
router.get("/squads/:squadId/messages", getMessages);
router.post("/squads/:squadId/messages", sendMessage);
router.post("/squads/:squadId/read", markSquadAsRead);
router.get("/squads/:squadId/info", getSquadChatInfo);

// Message-level interactions
router.patch("/messages/:messageId", editMessage);
router.delete("/messages/:messageId", deleteMessage);
router.post("/messages/:messageId/reactions", toggleReaction);

module.exports = router;
