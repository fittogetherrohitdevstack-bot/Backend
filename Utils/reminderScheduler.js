const cron = require("node-cron");
const FitnessProfile = require("../Modals/FitnessProfile");
const ReminderSetting = require("../Modals/ReminderSetting");
const ReminderEvent = require("../Modals/ReminderEvent");
const Notification = require("../Modals/Notification");
const WeightLog = require("../Modals/WeightLog");
const BodyMeasurement = require("../Modals/BodyMeasurement");
const WeeklyTarget = require("../Modals/WeeklyTarget");
const User = require("../Modals/User");
const {
  getLocalDateString,
  getISOWeekDetails,
  getLocalClockDetails,
  hhmmToMinutes,
  isTimeInQuietHours,
  getPhotoCycleDetails,
  anchorDateFromLocalString,
} = require("./date");

const REMINDER_META = {
  daily_weight: {
    notificationType: "weight",
    title: "Morning weigh-in check-in",
    followupTitle: "Gentle reminder: log today's weight",
    body: "Step on the scale at a consistent time to keep your 7-day weekly average accurate.",
    followupBody: "Still time to log today's weight so your weekly average reflects all your check-ins.",
    shortLabel: "Log Weight",
    actionLabel: "Log Weight",
    route: "/weight?quick=1",
    why: "Daily morning weights fluctuate with water and carbs — logging daily lets FitTogether smooth noise into a reliable weekly average.",
  },
  weekly_measurements: {
    notificationType: "measurements",
    title: "Weekly tape measurements",
    followupTitle: "Gentle reminder: weekly tape check-in",
    body: "Log waist, chest, hips, or limbs once a week to catch steady body composition shifts.",
    followupBody: "Your weekly measurement check-in is still open whenever you have 2 quiet minutes.",
    shortLabel: "Measurements",
    actionLabel: "Log Measurements",
    route: "/measurements?open=1",
    why: "Circumferences move slowly over 7+ days. Checking once a week at the same time minimizes tape variation.",
  },
  biweekly_photos: {
    notificationType: "photos",
    title: "Bi-weekly progress photos",
    followupTitle: "Gentle reminder: 2-week photo check-in",
    body: "Capture Front relaxed, Side relaxed & Back relaxed under consistent lighting.",
    followupBody: "You can finish any remaining poses in your current 2-week check-in set anytime today.",
    shortLabel: "Progress Photos",
    actionLabel: "Take Photos",
    route: "/photos?capture=1",
    why: "Visible changes take ~2 weeks to show clearly. A 14-day cadence avoids daily mirror obsession.",
  },
  weekly_target: {
    notificationType: "weekly_target",
    title: "Weekly pace review & target check",
    followupTitle: "Sunday evening review is open",
    body: "Compare this week's average weight vs target and confirm next Monday's pace.",
    followupBody: "Take 30 seconds to review your weekly average and set a calm target for next week.",
    shortLabel: "Weekly Review",
    actionLabel: "Review Target",
    route: "/?editTarget=1",
    why: "Reviewing Sunday evening locks in your weekly carry-over target calmly before Monday begins.",
  },
};

/**
 * Safely reads optional ProgressPhotoSet model (Step 5) without breaking standalone Steps 3–4.
 */
const loadProgressPhotoSetModel = () => {
  try {
    return require("../Modals/ProgressPhotoSet");
  } catch (_) {
    return null;
  }
};

/**
 * Builds default reminder settings anchored to the user's local today date.
 */
const buildDefaultReminderData = (timezone = "Asia/Kolkata", now = new Date()) => {
  const tz = timezone || "Asia/Kolkata";
  const todayLocal = getLocalDateString(now, tz);
  return {
    timezone: tz,
    dailyWeight: { enabled: true, time: "07:00", days: [0, 1, 2, 3, 4, 5, 6], onlyIfNotLogged: true },
    weeklyMeasurements: { enabled: true, weekday: 0, time: "08:00" },
    biweeklyPhotos: {
      enabled: true,
      weekday: 0,
      time: "08:30",
      anchorDate: anchorDateFromLocalString(todayLocal, tz),
    },
    weeklyTarget: { enabled: true, weekday: 0, time: "20:00" },
    quietHours: { enabled: true, from: "22:00", to: "06:00" },
    channels: { inApp: true, push: false },
    snoozeMinutes: 60,
  };
};

/**
 * Finds or lazily creates ReminderSetting for a user, keeping timezone synced.
 */
const getOrCreateReminderSetting = async (userId, userTimezone = "Asia/Kolkata") => {
  let setting = await ReminderSetting.findOne({ userId });
  if (!setting) {
    const defaults = buildDefaultReminderData(userTimezone);
    setting = await ReminderSetting.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, ...defaults } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
  }
  return setting;
};

/**
 * Computes completion & period key context for a user's current local moment.
 */
const getUserReminderContext = async (userId, setting, now = new Date()) => {
  const tz = setting?.timezone || "Asia/Kolkata";
  const clock = getLocalClockDetails(now, tz);
  const { weekStart, weekEnd } = getISOWeekDetails(clock.dateString);

  const [todayWeight, weekMeasurement, weekTargetDoc] = await Promise.all([
    WeightLog.findOne({ userId, date: clock.dateString }).lean(),
    BodyMeasurement.findOne({ userId, weekStart }).lean(),
    WeeklyTarget.findOne({ userId, weekStart }).lean(),
  ]);

  const anchorLocal = setting?.biweeklyPhotos?.anchorDate
    ? getLocalDateString(setting.biweeklyPhotos.anchorDate, tz)
    : clock.dateString;

  let cyclePhotosCompletedCount = 0;
  let photoCycle = getPhotoCycleDetails(anchorLocal, clock.dateString, 0);

  const ProgressPhotoSet = loadProgressPhotoSetModel();
  if (ProgressPhotoSet) {
    const setDoc = await ProgressPhotoSet.findOne({
      userId,
      cycleNumber: photoCycle.cycleNumber,
    }).lean();

    if (setDoc?.photos) {
      cyclePhotosCompletedCount = ["front_relaxed", "side_relaxed", "back_relaxed"].filter(
        (pose) => Boolean(setDoc.photos?.[pose]?.url)
      ).length;
    }
    photoCycle = getPhotoCycleDetails(anchorLocal, clock.dateString, cyclePhotosCompletedCount);
  }

  return {
    timezone: tz,
    clock,
    weekStart,
    weekEnd,
    anchorLocal,
    todayWeightLogged: Boolean(todayWeight),
    weekMeasurementDone: Boolean(weekMeasurement),
    weekTargetHasManual: Boolean(weekTargetDoc && weekTargetDoc.source === "manual"),
    cyclePhotosCompletedCount,
    photoCycle,
  };
};

/**
 * Returns the canonical periodKey and completion flag for a given reminder type.
 */
const resolvePeriodAndCompletion = (type, setting, ctx) => {
  switch (type) {
    case "daily_weight": {
      const onlyIfNotLogged = setting?.dailyWeight?.onlyIfNotLogged !== false;
      return {
        periodKey: ctx.clock.dateString,
        isCompleted: onlyIfNotLogged ? ctx.todayWeightLogged : false,
      };
    }
    case "weekly_measurements":
      return {
        periodKey: ctx.weekStart,
        isCompleted: ctx.weekMeasurementDone,
      };
    case "biweekly_photos":
      return {
        periodKey: `cycle-${ctx.photoCycle.cycleNumber}`,
        isCompleted: ctx.cyclePhotosCompletedCount >= 3,
      };
    case "weekly_target":
      return {
        periodKey: ctx.weekStart,
        isCompleted: false,
      };
    default:
      return { periodKey: ctx.clock.dateString, isCompleted: false };
  }
};

/**
 * Pure decision function determining whether a reminder should fire right now.
 * Easy to unit test deterministically across edge-case clocks, quiet hours, snoozes & followups.
 */
const evaluateReminderDecision = ({
  type,
  setting,
  clock,
  photoCycle,
  isCompleted,
  controlEvent,
  deliveredEvents = [],
  now = new Date(),
  catchUpWindowMinutes = 15,
  followupDelayMinutes = 180,
  followupWindowMinutes = 45,
}) => {
  const cfg =
    type === "daily_weight"
      ? setting?.dailyWeight
      : type === "weekly_measurements"
      ? setting?.weeklyMeasurements
      : type === "biweekly_photos"
      ? setting?.biweeklyPhotos
      : type === "weekly_target"
      ? setting?.weeklyTarget
      : null;

  if (!cfg || !cfg.enabled) {
    return { action: "disabled" };
  }

  if (isCompleted) {
    return { action: "skip_completed" };
  }

  if (controlEvent?.skipped) {
    return { action: "skip_user" };
  }

  if (isTimeInQuietHours(clock.hhmm, setting?.quietHours)) {
    return { action: "quiet_hours" };
  }

  // Handle active or matured snooze override first
  if (controlEvent?.snoozedUntil) {
    const snoozeTarget = new Date(controlEvent.snoozedUntil);
    if (now < snoozeTarget) {
      return { action: "snoozed_waiting" };
    }
    const snoozeAttempt = `snooze_${controlEvent.snoozeCount || 1}`;
    const alreadySentSnooze = deliveredEvents.some((e) => e.attempt === snoozeAttempt);
    if (!alreadySentSnooze) {
      return { action: "send", attempt: snoozeAttempt, isFollowup: false };
    }
  }

  let isScheduledDay = false;
  if (type === "daily_weight") {
    const days = Array.isArray(cfg.days) && cfg.days.length ? cfg.days : [0, 1, 2, 3, 4, 5, 6];
    isScheduledDay = days.includes(clock.weekday);
  } else if (type === "weekly_measurements" || type === "weekly_target") {
    isScheduledDay = clock.weekday === (cfg.weekday ?? 0);
  } else if (type === "biweekly_photos") {
    isScheduledDay =
      (photoCycle?.status === "due" &&
        (clock.dateString === photoCycle.dueDate || clock.weekday === (cfg.weekday ?? 0))) ||
      (photoCycle?.status === "overdue" && clock.weekday === (cfg.weekday ?? 0));
  }

  if (!isScheduledDay) {
    return { action: "not_scheduled_day" };
  }

  const nowMin = hhmmToMinutes(clock.hhmm);
  const targetMin = hhmmToMinutes(cfg.time || "07:00");

  const initialEvent = deliveredEvents.find((e) => e.attempt === "initial");
  const followupEvent = deliveredEvents.find((e) => e.attempt === "followup");

  if (!initialEvent && nowMin >= targetMin && nowMin < targetMin + catchUpWindowMinutes) {
    return { action: "send", attempt: "initial", isFollowup: false };
  }

  // Single gentle follow-up ~3 hours (180 mins) after scheduled time (or after initial sent), once max.
  const followupStartMin = targetMin + followupDelayMinutes;
  if (
    !followupEvent &&
    nowMin >= followupStartMin &&
    nowMin < followupStartMin + followupWindowMinutes
  ) {
    return { action: "send", attempt: "followup", isFollowup: true };
  }

  return { action: "outside_window" };
};

/**
 * Atomically reserves the dedupe event row and creates the in-app notification.
 * Keeps delivery pluggable so future external push channels can hook in without refactoring.
 */
const dispatchReminderDelivery = async ({
  userId,
  type,
  periodKey,
  attempt,
  isFollowup,
  channels = { inApp: true, push: false },
  now = new Date(),
  externalDispatcher = null,
}) => {
  try {
    await ReminderEvent.create({
      userId,
      type,
      periodKey,
      attempt,
      status: "sent",
      sentAt: now,
      channelsSent: {
        inApp: Boolean(channels?.inApp !== false),
        push: false,
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      return { sent: false, deduplicated: true };
    }
    throw err;
  }

  const meta = REMINDER_META[type] || REMINDER_META.daily_weight;
  const title = isFollowup ? meta.followupTitle : meta.title;
  const body = isFollowup ? meta.followupBody : meta.body;

  let notification = null;
  if (channels?.inApp !== false) {
    notification = await Notification.create({
      userId,
      type: meta.notificationType,
      title,
      body,
      data: {
        reminderType: type,
        periodKey,
        attempt,
        route: meta.route,
        actionLabel: meta.actionLabel,
        isFollowup,
      },
    });
  }

  if (typeof externalDispatcher === "function") {
    await externalDispatcher({ userId, type, title, body, meta });
  }

  return {
    sent: true,
    deduplicated: false,
    notificationId: notification?._id || null,
  };
};

/**
 * Evaluates and fires any due reminders for a single user at `now`.
 */
const processUserReminders = async (
  userId,
  { now = new Date(), catchUpWindowMinutes = 15, externalDispatcher = null } = {}
) => {
  const [user, profile] = await Promise.all([
    User.findById(userId).select("timezone").lean(),
    FitnessProfile.findOne({ userId }).select("featureFlags").lean(),
  ]);

  if (!user || !profile?.featureFlags?.reminders) {
    return { checked: false, reason: "feature_disabled", sentCount: 0, sentTypes: [] };
  }

  const setting = await getOrCreateReminderSetting(userId, user.timezone || "Asia/Kolkata");
  if (setting.timezone !== (user.timezone || "Asia/Kolkata") && user.timezone) {
    setting.timezone = user.timezone;
    await setting.save();
  }

  const ctx = await getUserReminderContext(userId, setting, now);
  const reminderTypes = ["daily_weight", "weekly_measurements", "biweekly_photos", "weekly_target"];
  const sentTypes = [];

  for (const type of reminderTypes) {
    if (type === "biweekly_photos" && profile?.featureFlags?.photoCheckins === false) {
      continue;
    }

    const { periodKey, isCompleted } = resolvePeriodAndCompletion(type, setting, ctx);
    const existingEvents = await ReminderEvent.find({
      userId,
      type,
      periodKey,
    }).lean();

    const controlEvent = existingEvents.find((e) => e.attempt === "control") || null;
    const deliveredEvents = existingEvents.filter(
      (e) => e.attempt !== "control" && e.status === "sent"
    );

    const decision = evaluateReminderDecision({
      type,
      setting,
      clock: ctx.clock,
      photoCycle: ctx.photoCycle,
      isCompleted,
      controlEvent,
      deliveredEvents,
      now,
      catchUpWindowMinutes,
    });

    if (decision.action === "send") {
      const dispatchRes = await dispatchReminderDelivery({
        userId,
        type,
        periodKey,
        attempt: decision.attempt,
        isFollowup: decision.isFollowup,
        channels: setting.channels,
        now,
        externalDispatcher,
      });

      if (dispatchRes.sent) {
        sentTypes.push({ type, periodKey, attempt: decision.attempt });
      }
    }
  }

  return {
    checked: true,
    sentCount: sentTypes.length,
    sentTypes,
  };
};

/**
 * Returns currently outstanding items for the Home "Due today" strip.
 */
const getDueRemindersForUser = async (userId, now = new Date()) => {
  const [user, profile] = await Promise.all([
    User.findById(userId).select("timezone").lean(),
    FitnessProfile.findOne({ userId }).select("featureFlags").lean(),
  ]);

  const enabled = Boolean(profile?.featureFlags?.reminders);
  const photoCheckinsEnabled = Boolean(profile?.featureFlags?.photoCheckins);

  if (!user || !enabled) {
    return {
      enabled: false,
      quietHoursActive: false,
      timezone: user?.timezone || "Asia/Kolkata",
      items: [],
    };
  }

  const setting = await getOrCreateReminderSetting(userId, user.timezone || "Asia/Kolkata");
  const ctx = await getUserReminderContext(userId, setting, now);
  const quietHoursActive = isTimeInQuietHours(ctx.clock.hhmm, setting.quietHours);

  const controls = await ReminderEvent.find({
    userId,
    attempt: "control",
  }).lean();
  const controlMap = new Map(controls.map((c) => [`${c.type}:${c.periodKey}`, c]));

  const items = [];
  const candidates = ["daily_weight", "weekly_measurements", "biweekly_photos", "weekly_target"];

  for (const type of candidates) {
    if (type === "biweekly_photos" && !photoCheckinsEnabled) continue;

    const cfg =
      type === "daily_weight"
        ? setting.dailyWeight
        : type === "weekly_measurements"
        ? setting.weeklyMeasurements
        : type === "biweekly_photos"
        ? setting.biweeklyPhotos
        : setting.weeklyTarget;

    if (!cfg?.enabled) continue;

    const { periodKey, isCompleted } = resolvePeriodAndCompletion(type, setting, ctx);
    if (isCompleted) continue;

    const control = controlMap.get(`${type}:${periodKey}`);
    if (control?.skipped) continue;
    if (control?.snoozedUntil && now < new Date(control.snoozedUntil)) continue;

    let isDueToday = false;
    let status = "due";

    if (type === "daily_weight") {
      const days = Array.isArray(cfg.days) && cfg.days.length ? cfg.days : [0, 1, 2, 3, 4, 5, 6];
      isDueToday = days.includes(ctx.clock.weekday);
    } else if (type === "weekly_measurements") {
      // Show on scheduled weekday (or later in the week until done, without nagging before)
      isDueToday = ctx.clock.weekday === (cfg.weekday ?? 0);
      if (isDueToday && hhmmToMinutes(ctx.clock.hhmm) > hhmmToMinutes(cfg.time) + 180) {
        status = "due";
      }
    } else if (type === "biweekly_photos") {
      isDueToday = ctx.photoCycle.status === "due" || ctx.photoCycle.status === "overdue";
      status = ctx.photoCycle.status === "overdue" ? "overdue" : "due";
    } else if (type === "weekly_target") {
      isDueToday =
        ctx.clock.weekday === (cfg.weekday ?? 0) &&
        hhmmToMinutes(ctx.clock.hhmm) >= hhmmToMinutes(cfg.time || "20:00");
    }

    if (!isDueToday) continue;

    const meta = REMINDER_META[type];
    items.push({
      type,
      periodKey,
      status,
      title: meta.title,
      shortLabel: meta.shortLabel,
      body: meta.body,
      actionLabel: meta.actionLabel,
      route: meta.route,
      defaultSnoozeMinutes: setting.snoozeMinutes || 60,
      meta:
        type === "biweekly_photos"
          ? {
              completedCount: ctx.cyclePhotosCompletedCount,
              requiredCount: 3,
              cycleNumber: ctx.photoCycle.cycleNumber,
              dueDate: ctx.photoCycle.dueDate,
            }
          : {},
    });
  }

  return {
    enabled: true,
    quietHoursActive,
    timezone: ctx.timezone,
    todayLocalDate: ctx.clock.dateString,
    items,
  };
};

let isTickRunning = false;
let cronTask = null;

/**
 * Evaluates all reminder-enabled users across one scheduler pass.
 */
const runReminderTick = async (options = {}) => {
  if (isTickRunning) {
    return { skipped: true, reason: "already_running", checkedUsers: 0, sentCount: 0 };
  }
  isTickRunning = true;

  try {
    const enabledProfiles = await FitnessProfile.find({
      "featureFlags.reminders": true,
    })
      .select("userId")
      .lean();

    let checkedUsers = 0;
    let sentCount = 0;

    for (const p of enabledProfiles) {
      checkedUsers += 1;
      const result = await processUserReminders(p.userId, options);
      sentCount += result.sentCount || 0;
    }

    return {
      skipped: false,
      checkedUsers,
      sentCount,
      timestamp: new Date().toISOString(),
    };
  } finally {
    isTickRunning = false;
  }
};

const startReminderCron = () => {
  if (cronTask) return cronTask;
  cronTask = cron.schedule("* * * * *", async () => {
    try {
      await runReminderTick();
    } catch (err) {
      console.error("[ReminderCron] Tick error:", err.message);
    }
  });
  console.log("⏰ Smart reminder scheduler started (* * * * *)");
  return cronTask;
};

const stopReminderCron = () => {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
};

module.exports = {
  REMINDER_META,
  buildDefaultReminderData,
  getOrCreateReminderSetting,
  getUserReminderContext,
  resolvePeriodAndCompletion,
  evaluateReminderDecision,
  dispatchReminderDelivery,
  processUserReminders,
  getDueRemindersForUser,
  runReminderTick,
  startReminderCron,
  stopReminderCron,
};
