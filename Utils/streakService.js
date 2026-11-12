const User = require("../Modals/User");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const WeightLog = require("../Modals/WeightLog");
const WaterLog = require("../Modals/WaterLog");
const MealLog = require("../Modals/MealLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const NudgeLog = require("../Modals/NudgeLog");
const {
  getLocalDateString,
  getRecentDays,
  getISOWeekDetails,
  addDaysToDateString,
} = require("./date");

const STREAK_MILESTONES = [3, 7, 14, 30];

/**
 * Pure helper computing currentStreak, longestStreak, lastLogDate, and today status
 * from a chronologically ordered list of dates (`lookbackDates` ending on `todayStr`).
 * Supports weekly streak freezes (`frozenDatesSet`) that bridge missed days.
 */
const calculateStreakFromActivity = ({
  lookbackDates = [],
  loggedDatesSet = new Set(),
  frozenDatesSet = new Set(),
  todayStr,
}) => {
  if (!lookbackDates.length) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastLogDate: "",
      todayLogged: false,
    };
  }

  const endDate = todayStr || lookbackDates[lookbackDates.length - 1];
  const dates =
    lookbackDates[lookbackDates.length - 1] === endDate
      ? lookbackDates
      : [...lookbackDates.filter((d) => d < endDate), endDate];

  let lastLogDate = "";
  for (let i = dates.length - 1; i >= 0; i--) {
    if (loggedDatesSet.has(dates[i])) {
      lastLogDate = dates[i];
      break;
    }
  }

  const isCovered = (d) => loggedDatesSet.has(d) || frozenDatesSet.has(d);

  // Longest streak across lookback window
  let longestStreak = 0;
  let run = 0;
  for (const d of dates) {
    if (isCovered(d)) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  // Current streak: if today not logged yet, preserve streak ending yesterday
  const lastIdx = dates.length - 1;
  const todayLogged = loggedDatesSet.has(dates[lastIdx]);
  const todayCovered = isCovered(dates[lastIdx]);

  let checkIdx = todayCovered ? lastIdx : lastIdx - 1;
  let currentStreak = 0;
  while (checkIdx >= 0 && isCovered(dates[checkIdx])) {
    currentStreak++;
    checkIdx--;
  }

  // Note: frozen days preserve the chain, but streak shouldn't be > 0 purely from a freeze with 0 actual logs in the run
  let hasActualLogInCurrentRun = false;
  for (let i = checkIdx + 1; i <= (todayCovered ? lastIdx : lastIdx - 1); i++) {
    if (loggedDatesSet.has(dates[i])) {
      hasActualLogInCurrentRun = true;
      break;
    }
  }
  if (!hasActualLogInCurrentRun) {
    currentStreak = 0;
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    lastLogDate,
    todayLogged,
  };
};

/**
 * Determines which dates in [startDate..endDate] have at least one qualifying log:
 * weight, water (>0ml entry), eaten meal/item, or completed/rest workout.
 */
const fetchUserLoggedDatesSet = async (userId, startDate, endDate) => {
  const filter = { userId, date: { $gte: startDate, $lte: endDate } };
  const [weights, waters, meals, workouts] = await Promise.all([
    WeightLog.find(filter).select("date").lean(),
    WaterLog.find(filter).select("date entries").lean(),
    MealLog.find(filter).select("date meals.status meals.plannedFoodItems.eaten").lean(),
    WorkoutSession.find(filter).select("date status").lean(),
  ]);

  const sourcesByDate = new Map();
  const markSource = (dateStr, source) => {
    if (!dateStr) return;
    if (!sourcesByDate.has(dateStr)) {
      sourcesByDate.set(dateStr, { weight: false, water: false, meal: false, workout: false });
    }
    sourcesByDate.get(dateStr)[source] = true;
  };

  for (const w of weights) {
    markSource(w.date, "weight");
  }
  for (const wa of waters) {
    const total = (wa.entries || []).reduce((acc, e) => acc + (Number(e.amountMl) || 0), 0);
    if (total > 0) {
      markSource(wa.date, "water");
    }
  }
  for (const m of meals) {
    const hasEaten = (m.meals || []).some(
      (meal) =>
        meal.status === "eaten" ||
        (meal.plannedFoodItems || []).some((it) => it.eaten)
    );
    if (hasEaten) {
      markSource(m.date, "meal");
    }
  }
  for (const wo of workouts) {
    if (wo.status === "completed" || wo.status === "rest") {
      markSource(wo.date, "workout");
    }
  }

  return {
    loggedDatesSet: new Set(sourcesByDate.keys()),
    sourcesByDate,
  };
};

/**
 * Ensures weekly freeze reset when entering a new Monday-Sunday week.
 */
const syncWeeklyFreezeReset = (user, todayStr) => {
  const { weekStart } = getISOWeekDetails(todayStr);
  if (!user.streakFreeze) {
    user.streakFreeze = { available: true, lastResetWeek: weekStart, usedDates: [] };
    return true;
  }
  if (user.streakFreeze.lastResetWeek !== weekStart) {
    user.streakFreeze.available = true;
    user.streakFreeze.lastResetWeek = weekStart;
    return true;
  }
  return false;
};

/**
 * Recomputes and persists user's currentStreak, longestStreak, lastLogDate,
 * triggers milestone feed events (3, 7, 14, 30), and updates all squads they belong to.
 */
const recalculateUserStreak = async (userId, { lookbackDays = 90, skipGroupSync = false } = {}) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const tz = user.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), tz);
  const lookbackDates = getRecentDays(lookbackDays, tz);
  const startDate = lookbackDates[0];

  syncWeeklyFreezeReset(user, todayStr);

  const { loggedDatesSet, sourcesByDate } = await fetchUserLoggedDatesSet(
    userId,
    startDate,
    todayStr
  );
  const frozenDatesSet = new Set(user.streakFreeze?.usedDates || []);

  const prevStreak = user.currentStreak || 0;
  const result = calculateStreakFromActivity({
    lookbackDates,
    loggedDatesSet,
    frozenDatesSet,
    todayStr,
  });

  user.currentStreak = result.currentStreak;
  user.longestStreak = Math.max(user.longestStreak || 0, result.longestStreak);
  user.lastLogDate = result.lastLogDate || user.lastLogDate || "";
  await user.save();

  // Check if user newly crossed a streak milestone today
  if (
    result.todayLogged &&
    STREAK_MILESTONES.includes(result.currentStreak) &&
    result.currentStreak > prevStreak
  ) {
    try {
      const { emitSquadFeedEvent } = require("./feedService");
      await emitSquadFeedEvent({
        userId: user._id,
        type: "streak_milestone",
        title: `hit a ${result.currentStreak}-day streak! 🔥`,
        dateKey: todayStr,
        dedupeKey: `streak_milestone_${user._id}_${result.currentStreak}_${todayStr}`,
        meta: { milestone: result.currentStreak },
      });
    } catch (err) {
      console.warn("[Streak] Milestone feed emit warning:", err.message);
    }
  }

  if (!skipGroupSync) {
    const memberships = await Membership.find({ userId, status: "active" }).select("groupId").lean();
    for (const m of memberships) {
      await recalculateGroupStreak(m.groupId).catch(() => {});
    }
  }

  return {
    ...result,
    longestStreak: user.longestStreak,
    freezeAvailable: user.streakFreeze?.available !== false,
    usedFreezeDates: user.streakFreeze?.usedDates || [],
    todaySources: sourcesByDate.get(todayStr) || {
      weight: false,
      water: false,
      meal: false,
      workout: false,
    },
  };
};

/**
 * Allows a user to spend their 1 weekly streak freeze to cover yesterday (or today).
 */
const useStreakFreeze = async (userId, targetDate = null) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const tz = user.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), tz);
  syncWeeklyFreezeReset(user, todayStr);

  if (!user.streakFreeze?.available) {
    return {
      ok: false,
      reason: "Weekly streak freeze already used this week. Resets Monday.",
    };
  }

  const yesterdayStr = addDaysToDateString(todayStr, -1);
  const freezeDate = targetDate || yesterdayStr;

  if (!user.streakFreeze.usedDates.includes(freezeDate)) {
    user.streakFreeze.usedDates.push(freezeDate);
    // Keep last 30 used dates bounded
    if (user.streakFreeze.usedDates.length > 30) {
      user.streakFreeze.usedDates = user.streakFreeze.usedDates.slice(-30);
    }
  }
  user.streakFreeze.available = false;
  await user.save();

  const updated = await recalculateUserStreak(userId);
  return { ok: true, frozenDate: freezeDate, streak: updated };
};

/**
 * Recomputes Squad Streak for a group:
 * A day counts toward the squad streak ONLY if EVERY active squad member
 * logged (or used a freeze) for that calendar day!
 */
const recalculateGroupStreak = async (groupId, { lookbackDays = 60 } = {}) => {
  const group = await Group.findById(groupId);
  if (!group) return null;

  const memberships = await Membership.find({ groupId, status: "active" })
    .populate("userId", "timezone streakFreeze")
    .lean();

  if (memberships.length === 0) {
    group.currentStreak = 0;
    await group.save();
    return { currentStreak: 0, longestStreak: group.longestStreak || 0, lastLogDate: "" };
  }

  // Group streak uses group's reference lookback (creator / default Asia/Kolkata)
  const refTz = memberships[0]?.userId?.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), refTz);
  const lookbackDates = getRecentDays(lookbackDays, refTz);
  const startDate = lookbackDates[0];

  const memberLoggedSets = await Promise.all(
    memberships.map(async (m) => {
      const uId = m.userId?._id;
      const { loggedDatesSet } = await fetchUserLoggedDatesSet(uId, startDate, todayStr);
      const freezeSet = new Set(m.userId?.streakFreeze?.usedDates || []);
      return new Set([...loggedDatesSet, ...freezeSet]);
    })
  );

  // Build intersection set: dates where ALL active members logged/froze
  const groupLoggedSet = new Set();
  for (const d of lookbackDates) {
    const allLogged = memberLoggedSets.every((set) => set.has(d));
    if (allLogged) {
      groupLoggedSet.add(d);
    }
  }

  const stats = calculateStreakFromActivity({
    lookbackDates,
    loggedDatesSet: groupLoggedSet,
    frozenDatesSet: new Set(),
    todayStr,
  });

  group.currentStreak = stats.currentStreak;
  group.longestStreak = Math.max(group.longestStreak || 0, stats.longestStreak);
  group.lastLogDate = stats.lastLogDate || group.lastLogDate || "";
  await group.save();

  return {
    currentStreak: group.currentStreak,
    longestStreak: group.longestStreak,
    lastLogDate: group.lastLogDate,
    allLoggedToday: stats.todayLogged,
  };
};

/**
 * Phase 3: "Who hasn't logged today?" status strip + nudge eligibility for a squad.
 */
const getSquadTodayMemberStatuses = async (groupId, viewerUserId) => {
  const memberships = await Membership.find({ groupId, status: "active" })
    .populate("userId", "name profileImage timezone currentStreak longestStreak socialPrivacy")
    .lean();

  const statuses = await Promise.all(
    memberships.map(async (m) => {
      const user = m.userId;
      if (!user) return null;
      const tz = user.timezone || "Asia/Kolkata";
      const localToday = getLocalDateString(new Date(), tz);
      const { sourcesByDate } = await fetchUserLoggedDatesSet(user._id, localToday, localToday);
      const sources = sourcesByDate.get(localToday) || {
        weight: false,
        water: false,
        meal: false,
        workout: false,
      };
      const loggedToday = Boolean(
        sources.weight || sources.water || sources.meal || sources.workout
      );

      const [nudgedByViewerCount, receivedTodayCount] = await Promise.all([
        viewerUserId
          ? NudgeLog.countDocuments({
              senderId: viewerUserId,
              receiverId: user._id,
              dateKey: localToday,
            })
          : 0,
        NudgeLog.countDocuments({
          receiverId: user._id,
          dateKey: localToday,
        }),
      ]);

      const allowNudges = user.socialPrivacy?.allowNudges !== false;
      const isSelf = viewerUserId && user._id.toString() === viewerUserId.toString();

      return {
        userId: user._id,
        name: user.name,
        profileImage: user.profileImage || "",
        role: m.role,
        localDate: localToday,
        loggedToday,
        sources,
        currentStreak: user.currentStreak || 0,
        allowNudges,
        nudgedByMeToday: nudgedByViewerCount >= 1,
        nudgesReceivedToday: receivedTodayCount,
        canNudge:
          !isSelf &&
          !loggedToday &&
          allowNudges &&
          nudgedByViewerCount < 1 &&
          receivedTodayCount < 3,
      };
    })
  );

  const valid = statuses.filter(Boolean);
  const loggedCount = valid.filter((s) => s.loggedToday).length;
  const pendingCount = valid.length - loggedCount;

  return {
    members: valid,
    totalMembers: valid.length,
    loggedCount,
    pendingCount,
    allLoggedToday: valid.length > 0 && pendingCount === 0,
  };
};

module.exports = {
  STREAK_MILESTONES,
  calculateStreakFromActivity,
  fetchUserLoggedDatesSet,
  syncWeeklyFreezeReset,
  recalculateUserStreak,
  useStreakFreeze,
  recalculateGroupStreak,
  getSquadTodayMemberStatuses,
};
