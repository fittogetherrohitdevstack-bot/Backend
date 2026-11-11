const ReminderSetting = require("../Modals/ReminderSetting");
const ReminderEvent = require("../Modals/ReminderEvent");
const Notification = require("../Modals/Notification");
const FitnessProfile = require("../Modals/FitnessProfile");
const User = require("../Modals/User");
const config = require("../Config/env");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { anchorDateFromLocalString, getLocalDateString } = require("../Utils/date");
const {
  REMINDER_META,
  getOrCreateReminderSetting,
  getUserReminderContext,
  resolvePeriodAndCompletion,
  getDueRemindersForUser,
  runReminderTick,
} = require("../Utils/reminderScheduler");

/**
 * @desc Get user's reminder settings (created lazily on first read)
 * @route GET /api/reminders/settings
 */
const getReminderSettings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userTz = req.user.timezone || "Asia/Kolkata";
  const [profile, setting] = await Promise.all([
    FitnessProfile.findOne({ userId }).select("featureFlags").lean(),
    getOrCreateReminderSetting(userId, userTz),
  ]);

  const anchorDateLocal = getLocalDateString(
    setting.biweeklyPhotos?.anchorDate || new Date(),
    setting.timezone || userTz
  );

  return sendSuccess(res, {
    enabled: Boolean(profile?.featureFlags?.reminders),
    settings: {
      ...setting.toObject(),
      biweeklyPhotos: {
        ...setting.toObject().biweeklyPhotos,
        anchorDateLocal,
      },
    },
    descriptions: REMINDER_META,
    channelsNote: "In-app reminders and notification inbox are active.",
  });
});

/**
 * @desc Update user's reminder settings
 * @route PUT /api/reminders/settings
 */
const updateReminderSettings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const currentUser = await User.findById(userId);
  const existing = await getOrCreateReminderSetting(userId, currentUser?.timezone || "Asia/Kolkata");

  const {
    timezone,
    dailyWeight,
    weeklyMeasurements,
    biweeklyPhotos,
    weeklyTarget,
    quietHours,
    channels,
    snoozeMinutes,
    enableFeature,
  } = req.body;

  const effectiveTz = timezone || existing.timezone || currentUser?.timezone || "Asia/Kolkata";
  if (timezone && currentUser && currentUser.timezone !== timezone) {
    currentUser.timezone = timezone;
    await currentUser.save();
  }

  existing.timezone = effectiveTz;

  if (dailyWeight) {
    existing.dailyWeight = {
      enabled:
        dailyWeight.enabled !== undefined ? Boolean(dailyWeight.enabled) : existing.dailyWeight.enabled,
      time: dailyWeight.time || existing.dailyWeight.time,
      days: Array.isArray(dailyWeight.days) ? dailyWeight.days : existing.dailyWeight.days,
      onlyIfNotLogged:
        dailyWeight.onlyIfNotLogged !== undefined
          ? Boolean(dailyWeight.onlyIfNotLogged)
          : existing.dailyWeight.onlyIfNotLogged,
    };
  }

  if (weeklyMeasurements) {
    existing.weeklyMeasurements = {
      enabled:
        weeklyMeasurements.enabled !== undefined
          ? Boolean(weeklyMeasurements.enabled)
          : existing.weeklyMeasurements.enabled,
      weekday:
        weeklyMeasurements.weekday !== undefined
          ? Number(weeklyMeasurements.weekday)
          : existing.weeklyMeasurements.weekday,
      time: weeklyMeasurements.time || existing.weeklyMeasurements.time,
    };
  }

  if (biweeklyPhotos) {
    let nextAnchor = existing.biweeklyPhotos.anchorDate;
    if (biweeklyPhotos.anchorDate) {
      nextAnchor = /^\d{4}-\d{2}-\d{2}$/.test(String(biweeklyPhotos.anchorDate))
        ? anchorDateFromLocalString(String(biweeklyPhotos.anchorDate), effectiveTz)
        : new Date(biweeklyPhotos.anchorDate);
    }

    existing.biweeklyPhotos = {
      enabled:
        biweeklyPhotos.enabled !== undefined
          ? Boolean(biweeklyPhotos.enabled)
          : existing.biweeklyPhotos.enabled,
      weekday:
        biweeklyPhotos.weekday !== undefined
          ? Number(biweeklyPhotos.weekday)
          : existing.biweeklyPhotos.weekday,
      time: biweeklyPhotos.time || existing.biweeklyPhotos.time,
      anchorDate: nextAnchor,
    };
  }

  if (weeklyTarget) {
    existing.weeklyTarget = {
      enabled:
        weeklyTarget.enabled !== undefined
          ? Boolean(weeklyTarget.enabled)
          : existing.weeklyTarget.enabled,
      weekday:
        weeklyTarget.weekday !== undefined
          ? Number(weeklyTarget.weekday)
          : existing.weeklyTarget.weekday,
      time: weeklyTarget.time || existing.weeklyTarget.time,
    };
  }

  if (quietHours) {
    existing.quietHours = {
      enabled:
        quietHours.enabled !== undefined
          ? Boolean(quietHours.enabled)
          : existing.quietHours.enabled,
      from: quietHours.from || existing.quietHours.from,
      to: quietHours.to || existing.quietHours.to,
    };
  }

  if (channels) {
    existing.channels = {
      inApp: channels.inApp !== undefined ? Boolean(channels.inApp) : existing.channels.inApp,
      push: false,
    };
  }

  if (snoozeMinutes !== undefined) {
    existing.snoozeMinutes = Number(snoozeMinutes);
  }

  await existing.save();

  if (enableFeature !== undefined) {
    await FitnessProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          "featureFlags.reminders": Boolean(enableFeature),
          featureFlagsConfigured: true,
        },
      }
    );
  }

  const profile = await FitnessProfile.findOne({ userId }).select("featureFlags").lean();
  const anchorDateLocal = getLocalDateString(existing.biweeklyPhotos.anchorDate, effectiveTz);

  return sendSuccess(
    res,
    {
      enabled: Boolean(profile?.featureFlags?.reminders),
      settings: {
        ...existing.toObject(),
        biweeklyPhotos: {
          ...existing.toObject().biweeklyPhotos,
          anchorDateLocal,
        },
      },
    },
    "Reminder settings updated"
  );
});

/**
 * @desc Snooze a specific reminder occurrence for `minutes`
 * @route POST /api/reminders/snooze
 */
const snoozeReminder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { type, minutes } = req.body;
  const setting = await getOrCreateReminderSetting(userId, req.user.timezone || "Asia/Kolkata");
  const ctx = await getUserReminderContext(userId, setting);
  const { periodKey } = resolvePeriodAndCompletion(type, setting, ctx);

  const snoozeMins = Number(minutes || setting.snoozeMinutes || 60);
  const snoozedUntil = new Date(Date.now() + snoozeMins * 60 * 1000);

  const control = await ReminderEvent.findOneAndUpdate(
    { userId, type, periodKey, attempt: "control" },
    {
      $set: {
        status: "snoozed",
        snoozedUntil,
        skipped: false,
      },
      $inc: { snoozeCount: 1 },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return sendSuccess(
    res,
    { type, periodKey, snoozedUntil: control.snoozedUntil, minutes: snoozeMins },
    `Snoozed for ${snoozeMins} minutes`
  );
});

/**
 * @desc Skip the current occurrence of a reminder without changing future occurrences
 * @route POST /api/reminders/skip
 */
const skipReminder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { type, periodKey: explicitPeriod } = req.body;
  const setting = await getOrCreateReminderSetting(userId, req.user.timezone || "Asia/Kolkata");
  const ctx = await getUserReminderContext(userId, setting);
  const { periodKey } = resolvePeriodAndCompletion(type, setting, ctx);
  const targetPeriod = explicitPeriod || periodKey;

  const control = await ReminderEvent.findOneAndUpdate(
    { userId, type, periodKey: targetPeriod, attempt: "control" },
    {
      $set: {
        status: "skipped",
        skipped: true,
        snoozedUntil: null,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return sendSuccess(
    res,
    { type, periodKey: targetPeriod, skipped: control.skipped },
    "Skipped for this check-in window"
  );
});

/**
 * @desc Get reminders currently due for Home "Due today" strip
 * @route GET /api/reminders/due
 */
const getDueReminders = asyncHandler(async (req, res) => {
  const result = await getDueRemindersForUser(req.user._id, new Date());
  return sendSuccess(res, result);
});

/**
 * @desc Send an immediate test in-app reminder notification
 * @route POST /api/reminders/test
 */
const sendTestReminder = asyncHandler(async (req, res) => {
  const notification = await Notification.create({
    userId: req.user._id,
    type: "reminder",
    title: "Test Reminder — FitTogether",
    body: "Your in-app reminders and notification inbox are working right on schedule.",
    data: {
      reminderType: "test",
      route: "/weight?quick=1",
      actionLabel: "Open Weight Log",
    },
  });

  return sendSuccess(
    res,
    { notification },
    "Test in-app reminder delivered! Check your notification bell."
  );
});

/**
 * @desc Protected external scheduler tick fallback (for Render free-tier or external cron)
 * @route POST /api/jobs/reminders/tick
 */
const triggerReminderCronTick = asyncHandler(async (req, res) => {
  const configuredSecret = (config.CRON_SECRET || "").trim();
  if (!configuredSecret) {
    return sendError(
      res,
      "CRON_SECRET is not configured on the server environment.",
      503
    );
  }

  const headerSecret =
    req.headers["x-cron-secret"] ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : "");

  if (!headerSecret || headerSecret !== configuredSecret) {
    return sendError(res, "Unauthorized scheduler tick", 401);
  }

  const summary = await runReminderTick({ source: "http_cron" });
  return sendSuccess(res, summary, "Reminder scheduler tick completed");
});

module.exports = {
  getReminderSettings,
  updateReminderSettings,
  snoozeReminder,
  skipReminder,
  getDueReminders,
  sendTestReminder,
  triggerReminderCronTick,
};
