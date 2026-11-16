const express = require("express");
const router = express.Router();
const notificationController = require("../Controllers/notificationController");
const protect = require("../Middleware/auth");

router.use(protect);

router.get("/", notificationController.getNotifications);
router.delete("/", notificationController.clearReadNotifications);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);
router.get("/preferences", notificationController.getPreferences);
router.put("/preferences", notificationController.updatePreferences);

module.exports = router;
