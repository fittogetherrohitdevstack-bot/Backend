const express = require("express");
const router = express.Router();
const notificationController = require("../Controllers/notificationController");
const protect = require("../Middleware/auth");

router.use(protect);

router.get("/", notificationController.getNotifications);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.put("/preferences", notificationController.updatePreferences);

module.exports = router;
