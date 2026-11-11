const express = require("express");
const router = express.Router();
const reminderController = require("../Controllers/reminderController");

// Protected by CRON_SECRET header (for external schedulers / Render wake ping)
router.post("/reminders/tick", reminderController.triggerReminderCronTick);

module.exports = router;
