const express = require("express");
const router = express.Router();
const config = require("../Config/env");
const reminderController = require("../Controllers/reminderController");
const {
  runNightlyStreakRecalc,
  runSocialNotificationsTick,
  runWeeklyChallengeTick,
} = require("../Utils/socialCron");
const { sendSuccess, sendError } = require("../Utils/apiResponse");

const verifyCronSecret = (req, res, next) => {
  const secret = req.headers["x-cron-secret"] || req.query.secret;
  if (!config.CRON_SECRET || secret !== config.CRON_SECRET) {
    return sendError(res, "Unauthorized cron trigger", 401);
  }
  return next();
};

// Protected by CRON_SECRET header (for external schedulers / Render wake ping)
router.post("/reminders/tick", reminderController.triggerReminderCronTick);
router.post("/social/tick", verifyCronSecret, async (req, res) => {
  const [streaks, challenges, notifications] = await Promise.all([
    runNightlyStreakRecalc(),
    runWeeklyChallengeTick(),
    runSocialNotificationsTick(new Date()),
  ]);
  return sendSuccess(res, { streaks, challenges, notifications }, "Social cron tick completed");
});

module.exports = router;
