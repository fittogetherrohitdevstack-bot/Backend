const express = require("express");
const { z } = require("zod");
const router = express.Router();
const reminderController = require("../Controllers/reminderController");
const protect = require("../Middleware/auth");
const validate = require("../Middleware/validate");

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const reminderTypeEnum = z.enum([
  "daily_weight",
  "weekly_measurements",
  "biweekly_photos",
  "weekly_target",
]);

router.use(protect);

router.get("/settings", reminderController.getReminderSettings);

router.put(
  "/settings",
  validate({
    body: z.object({
      timezone: z.string().min(2).max(80).optional(),
      enableFeature: z.boolean().optional(),
      snoozeMinutes: z.number().int().min(5).max(720).optional(),
      dailyWeight: z
        .object({
          enabled: z.boolean().optional(),
          time: z.string().regex(hhmmRegex, "Expected HH:MM 24h time").optional(),
          days: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
          onlyIfNotLogged: z.boolean().optional(),
        })
        .optional(),
      weeklyMeasurements: z
        .object({
          enabled: z.boolean().optional(),
          weekday: z.number().int().min(0).max(6).optional(),
          time: z.string().regex(hhmmRegex, "Expected HH:MM 24h time").optional(),
        })
        .optional(),
      biweeklyPhotos: z
        .object({
          enabled: z.boolean().optional(),
          weekday: z.number().int().min(0).max(6).optional(),
          time: z.string().regex(hhmmRegex, "Expected HH:MM 24h time").optional(),
          anchorDate: z.string().min(8).max(40).optional(),
        })
        .optional(),
      weeklyTarget: z
        .object({
          enabled: z.boolean().optional(),
          weekday: z.number().int().min(0).max(6).optional(),
          time: z.string().regex(hhmmRegex, "Expected HH:MM 24h time").optional(),
        })
        .optional(),
      quietHours: z
        .object({
          enabled: z.boolean().optional(),
          from: z.string().regex(hhmmRegex, "Expected HH:MM 24h time").optional(),
          to: z.string().regex(hhmmRegex, "Expected HH:MM 24h time").optional(),
        })
        .optional(),
      channels: z
        .object({
          inApp: z.boolean().optional(),
          push: z.boolean().optional(),
        })
        .optional(),
    }),
  }),
  reminderController.updateReminderSettings
);

router.post(
  "/snooze",
  validate({
    body: z.object({
      type: reminderTypeEnum,
      minutes: z.number().int().min(5).max(720).optional(),
    }),
  }),
  reminderController.snoozeReminder
);

router.post(
  "/skip",
  validate({
    body: z.object({
      type: reminderTypeEnum,
      periodKey: z.string().max(40).optional(),
    }),
  }),
  reminderController.skipReminder
);

router.get("/due", reminderController.getDueReminders);
router.post("/test", reminderController.sendTestReminder);

module.exports = router;
