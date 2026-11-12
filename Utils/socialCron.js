const cron = require("node-cron");
const User = require("../Modals/User");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const ReminderSetting = require("../Modals/ReminderSetting");
const Notification = require("../Modals/Notification");
const {
  getLocalClockDetails,
  getISOWeekDetails,
  hhmmToMinutes,
  isTimeInQuietHours,
} = require("./date");
const {
  recalculateUserStreak,
  recalculateGroupStreak,
  fetchUserLoggedDatesSet,
} = require("./streakService");
const { sendPushToUser } = require("./pushService");
const {
  ensureWeeklyChallengeForGroup,
  finalizeEndedChallenges,
} = require("./challengeService");
const { generateWeeklyRecapForUser } = require("./recapService");

let nightlyTask = null;
let socialPulseTask = null;

/**
 * Recalculates streaks for all users & active squads (runs nightly + safe manually).
 */
const runNightlyStreakRecalc = async () => {
  const users = await User.find({}).select("_id").lean();
  for (const u of users) {
    await recalculateUserStreak(u._id, { skipGroupSync: true }).catch((err) =>
      console.warn("[SocialCron] Streak recalc error for user:", u._id, err.message)
    );
  }
  const groups = await Group.find({ isActive: true }).select("_id").lean();
  for (const g of groups) {
    await recalculateGroupStreak(g._id).catch((err) =>
      console.warn("[SocialCron] Squad streak recalc error:", g._id, err.message)
    );
  }
  return { usersProcessed: users.length, groupsProcessed: groups.length };
};

/**
 * Finalizes ended challenges & rotates Mon-Sun weekly challenges across active groups.
 */
const runWeeklyChallengeTick = async () => {
  const closed = await finalizeEndedChallenges();
  const groups = await Group.find({ isActive: true }).select("_id challengeSettings").lean();
  let ensured = 0;
  for (const g of groups) {
    if (g.challengeSettings?.autoRotate !== false) {
      await ensureWeeklyChallengeForGroup(g._id).catch(() => {});
      ensured++;
    }
  }
  return { closed, ensured };
};

/**
 * Evaluates user-chosen daily habit reminders, evening "squad streak at risk" alerts,
 * and Sunday evening weekly recap generation.
 */
const runSocialNotificationsTick = async (now = new Date()) => {
  const users = await User.find({}).select("_id name timezone currentStreak").lean();
  const memberships = await Membership.find({ status: "active" }).lean();

  const userToGroupIds = new Map();
  const groupToUserIds = new Map();
  for (const m of memberships) {
    const uKey = m.userId.toString();
    const gKey = m.groupId.toString();
    if (!userToGroupIds.has(uKey)) userToGroupIds.set(uKey, []);
    userToGroupIds.get(uKey).push(gKey);
    if (!groupToUserIds.has(gKey)) groupToUserIds.set(gKey, []);
    groupToUserIds.get(gKey).push(uKey);
  }

  let dailySent = 0;
  let streakRiskSent = 0;
  let recapSent = 0;

  // Precompute who has logged today per user
  const userLoggedTodayMap = new Map();
  for (const u of users) {
    const tz = u.timezone || "Asia/Kolkata";
    const clock = getLocalClockDetails(now, tz);
    const { loggedDatesSet } = await fetchUserLoggedDatesSet(u._id, clock.dateString, clock.dateString);
    userLoggedTodayMap.set(u._id.toString(), {
      clock,
      loggedToday: loggedDatesSet.has(clock.dateString),
    });
  }

  for (const u of users) {
    const uId = u._id.toString();
    const setting = await ReminderSetting.findOne({ userId: u._id }).lean();
    const statusInfo = userLoggedTodayMap.get(uId);
    if (!statusInfo) continue;

    const { clock, loggedToday } = statusInfo;
    if (isTimeInQuietHours(clock.hhmm, setting?.quietHours)) {
      continue;
    }

    const nowMin = hhmmToMinutes(clock.hhmm);

    // 1. Daily streak check-in reminder (user-chosen time, catchup window 30 mins)
    const dailyEnabled = setting?.dailyReminder?.enabled !== false;
    const dailyTargetMin = hhmmToMinutes(setting?.dailyReminder?.time || "20:00");
    if (
      dailyEnabled &&
      !loggedToday &&
      nowMin >= dailyTargetMin &&
      nowMin <= dailyTargetMin + 30
    ) {
      const existingDaily = await Notification.exists({
        userId: u._id,
        "data.socialKind": "daily_reminder",
        "data.periodKey": clock.dateString,
      });
      if (!existingDaily) {
        const title = "Keep your streak alive 🔥";
        const body =
          u.currentStreak > 0
            ? `You're on a ${u.currentStreak}-day streak! Log a meal, glass of water, or weigh-in today.`
            : "Take 10 seconds to log water, a meal, or weight and start a fresh streak today.";
        await Notification.create({
          userId: u._id,
          type: "streak",
          title,
          body,
          data: {
            socialKind: "daily_reminder",
            periodKey: clock.dateString,
            route: "/tracker",
          },
        });
        await sendPushToUser(u._id, {
          title,
          body,
          url: "/tracker",
          type: "daily_reminder",
          tag: `daily-${clock.dateString}`,
        });
        dailySent++;
      }
    }

    // 2. Squad streak at risk evening alert (user hasn't logged OR squadmate hasn't logged)
    const riskEnabled = setting?.squadStreakAtRisk?.enabled !== false;
    const riskTargetMin = hhmmToMinutes(setting?.squadStreakAtRisk?.time || "20:30");
    const groupIds = userToGroupIds.get(uId) || [];
    if (
      riskEnabled &&
      groupIds.length > 0 &&
      nowMin >= riskTargetMin &&
      nowMin <= riskTargetMin + 45
    ) {
      for (const gId of groupIds) {
        const memberIds = groupToUserIds.get(gId) || [];
        const pendingCount = memberIds.filter(
          (mId) => userLoggedTodayMap.get(mId)?.loggedToday === false
        ).length;

        if (pendingCount > 0 && (!loggedToday || memberIds.length > 1)) {
          const existingRisk = await Notification.exists({
            userId: u._id,
            "data.socialKind": "streak_risk",
            "data.periodKey": `${gId}_${clock.dateString}`,
          });
          if (!existingRisk) {
            const title = "Squad streak check-in ⚠️";
            const body = !loggedToday
              ? "Your squad is waiting on your log today — keep the flame burning!"
              : `${pendingCount} squadmate${pendingCount > 1 ? "s haven't" : " hasn't"} logged yet today. Send a friendly nudge!`;
            await Notification.create({
              userId: u._id,
              type: "group",
              title,
              body,
              data: {
                socialKind: "streak_risk",
                periodKey: `${gId}_${clock.dateString}`,
                groupId: gId,
                route: "/group",
              },
            });
            await sendPushToUser(u._id, {
              title,
              body,
              url: "/group",
              type: "streak_risk",
              tag: `risk-${clock.dateString}`,
            });
            streakRiskSent++;
          }
          break; // 1 streak-risk push per user per evening
        }
      }
    }

    // 3. Sunday evening weekly recap ready (Sunday == weekday 0, 19:30+)
    const recapEnabled = setting?.weeklyRecapReady?.enabled !== false;
    if (clock.weekday === 0 && nowMin >= 19 * 60 + 30) {
      const { weekStart } = getISOWeekDetails(clock.dateString);
      const existingRecapNotif = await Notification.exists({
        userId: u._id,
        "data.socialKind": "weekly_recap",
        "data.periodKey": weekStart,
      });
      if (!existingRecapNotif) {
        await generateWeeklyRecapForUser(u._id, { weekStartOverride: weekStart }).catch(() => {});
        if (recapEnabled) {
          const title = "Your Weekly Recap Card is Ready ✨";
          const body = "See your streak, hydration total, XP earned, and share your Sunday story card!";
          await Notification.create({
            userId: u._id,
            type: "recap",
            title,
            body,
            data: {
              socialKind: "weekly_recap",
              periodKey: weekStart,
              route: "/group?recap=1",
            },
          });
          await sendPushToUser(u._id, {
            title,
            body,
            url: "/group?recap=1",
            type: "recap",
            tag: `recap-${weekStart}`,
          });
          recapSent++;
        }
      }
    }
  }

  return { dailySent, streakRiskSent, recapSent };
};

const startSocialCron = () => {
  if (nightlyTask || socialPulseTask) return;

  // Daily streak recalculation at 00:10 IST and also run every 6 hours for cross-timezone coverage
  nightlyTask = cron.schedule("10 0,6,12,18 * * *", async () => {
    try {
      await runNightlyStreakRecalc();
      await runWeeklyChallengeTick();
    } catch (err) {
      console.error("[SocialCron] Nightly job error:", err.message);
    }
  });

  // 15-minute pulse for user-time daily reminders, evening streak risk, and Sunday recaps
  socialPulseTask = cron.schedule("*/15 * * * *", async () => {
    try {
      await runSocialNotificationsTick(new Date());
    } catch (err) {
      console.error("[SocialCron] Pulse job error:", err.message);
    }
  });
};

const stopSocialCron = () => {
  if (nightlyTask) {
    nightlyTask.stop();
    nightlyTask = null;
  }
  if (socialPulseTask) {
    socialPulseTask.stop();
    socialPulseTask = null;
  }
};

module.exports = {
  runNightlyStreakRecalc,
  runWeeklyChallengeTick,
  runSocialNotificationsTick,
  startSocialCron,
  stopSocialCron,
};
