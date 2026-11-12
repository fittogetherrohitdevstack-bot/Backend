const User = require("../../Modals/User");
const Group = require("../../Modals/Group");
const ReminderSetting = require("../../Modals/ReminderSetting");
const { getLocalDateString, getISOWeekDetails } = require("../../Utils/date");
const { recalculateUserStreak, recalculateGroupStreak } = require("../../Utils/streakService");

/**
 * Idempotent migration 003:
 * - Backfills optional social engagement fields on existing User, Group, and ReminderSetting docs
 * - Recalculates historical streaks & squad streaks cleanly without overwriting existing user config.
 */
async function run({ dryRun = false, logger = console } = {}) {
  const users = await User.collection.find({}).toArray();
  const groups = await Group.collection.find({}).toArray();
  const reminderSettings = await ReminderSetting.collection.find({}).toArray();

  let usersUpdated = 0;
  let groupsUpdated = 0;
  let remindersUpdated = 0;
  let streaksRecalculated = 0;

  for (const doc of users) {
    const todayStr = getLocalDateString(new Date(), doc.timezone || "Asia/Kolkata");
    const { weekStart } = getISOWeekDetails(todayStr);
    const setFields = {};

    if (typeof doc.currentStreak !== "number") setFields.currentStreak = 0;
    if (typeof doc.longestStreak !== "number") setFields.longestStreak = 0;
    if (typeof doc.lastLogDate !== "string") setFields.lastLogDate = "";
    if (typeof doc.needsOnboarding !== "boolean") setFields.needsOnboarding = false;

    if (!doc.streakFreeze || typeof doc.streakFreeze !== "object") {
      setFields.streakFreeze = { available: true, lastResetWeek: weekStart, usedDates: [] };
    }
    if (!doc.socialPrivacy || typeof doc.socialPrivacy !== "object") {
      setFields.socialPrivacy = {
        showWeightInFeed: false,
        showWeightInRecap: false,
        allowNudges: true,
      };
    } else {
      if (typeof doc.socialPrivacy.showWeightInFeed !== "boolean") {
        setFields["socialPrivacy.showWeightInFeed"] = false;
      }
      if (typeof doc.socialPrivacy.showWeightInRecap !== "boolean") {
        setFields["socialPrivacy.showWeightInRecap"] = false;
      }
      if (typeof doc.socialPrivacy.allowNudges !== "boolean") {
        setFields["socialPrivacy.allowNudges"] = true;
      }
    }

    if (Object.keys(setFields).length > 0) {
      usersUpdated++;
      if (!dryRun) {
        await User.collection.updateOne({ _id: doc._id }, { $set: setFields });
      }
    }

    if (!dryRun) {
      await recalculateUserStreak(doc._id, { skipGroupSync: true }).catch(() => {});
      streaksRecalculated++;
    }
  }

  for (const g of groups) {
    const setFields = {};
    if (typeof g.currentStreak !== "number") setFields.currentStreak = 0;
    if (typeof g.longestStreak !== "number") setFields.longestStreak = 0;
    if (typeof g.lastLogDate !== "string") setFields.lastLogDate = "";

    if (!g.challengeSettings || typeof g.challengeSettings !== "object") {
      setFields.challengeSettings = {
        autoRotate: true,
        preferredTemplate: "",
        rotationIndex: 0,
      };
    }
    if (!g.weeklyStakes || typeof g.weeklyStakes !== "object") {
      setFields.weeklyStakes = {
        enabled: false,
        forfeitText: "",
      };
    }

    if (Object.keys(setFields).length > 0) {
      groupsUpdated++;
      if (!dryRun) {
        await Group.collection.updateOne({ _id: g._id }, { $set: setFields });
      }
    }

    if (!dryRun) {
      await recalculateGroupStreak(g._id).catch(() => {});
    }
  }

  for (const r of reminderSettings) {
    const setFields = {};
    if (!r.dailyReminder) setFields.dailyReminder = { enabled: true, time: "20:00" };
    if (!r.squadStreakAtRisk) setFields.squadStreakAtRisk = { enabled: true, time: "20:30" };
    if (!r.nudges) setFields.nudges = { enabled: true };
    if (!r.challengeUpdates) setFields.challengeUpdates = { enabled: true };
    if (!r.weeklyRecapReady) setFields.weeklyRecapReady = { enabled: true };

    if (Object.keys(setFields).length > 0) {
      remindersUpdated++;
      if (!dryRun) {
        await ReminderSetting.collection.updateOne({ _id: r._id }, { $set: setFields });
      }
    }
  }

  const summary = {
    migration: "003_social_engagement_backfill",
    dryRun,
    usersUpdated,
    groupsUpdated,
    remindersUpdated,
    streaksRecalculated,
  };
  logger.log("[003_social_engagement_backfill]", JSON.stringify(summary));
  return summary;
}

module.exports = {
  id: "003_social_engagement_backfill",
  run,
};
