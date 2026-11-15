const PointsLedger = require("../Modals/PointsLedger");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const { fetchUserLoggedDatesSet } = require("./streakService");
const { getLocalDateString, addDaysToDateString } = require("./date");

const PENALTY_RULES = {
  meals: -15,
  water: -10,
  workout: -15,
};

const getDatesInRange = (startDate, endDate) => {
  const dates = [];
  let curr = startDate;
  while (curr <= endDate) {
    dates.push(curr);
    curr = addDaysToDateString(curr, 1);
  }
  return dates;
};

/**
 * Synchronizes habit penalties for a specific user across a date window [startDate..endDate].
 * Strictly checks past completed days (date < todayStr).
 * Waives penalties if a streak freeze was active on that date.
 * If habit is completed, ensures any previous penalty record is deleted.
 */
const syncMissedHabitPenalties = async (userId, startDate, endDate) => {
  if (!userId || !startDate || !endDate) return;

  const [membership, user] = await Promise.all([
    Membership.findOne({ userId, status: "active" }).select("groupId createdAt").lean(),
    User.findById(userId).select("timezone streakFreeze createdAt").lean(),
  ]);

  if (!membership || !user) return;

  const userTz = user.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), userTz);

  // Do not penalize dates before the user created their account or joined squad
  const userCreatedDate = user.createdAt
    ? getLocalDateString(user.createdAt, userTz)
    : startDate;
  const joinedDate = membership.createdAt
    ? getLocalDateString(membership.createdAt, userTz)
    : startDate;
  const cutoffStart = userCreatedDate > joinedDate ? userCreatedDate : joinedDate;
  const effectiveStart = startDate < cutoffStart ? cutoffStart : startDate;

  if (effectiveStart > endDate) return;

  const frozenDatesSet = new Set(user.streakFreeze?.usedDates || []);
  const { sourcesByDate } = await fetchUserLoggedDatesSet(userId, effectiveStart, endDate);

  const datesToCheck = getDatesInRange(effectiveStart, endDate).filter((d) => d < todayStr);

  for (const date of datesToCheck) {
    // If the day is protected by a streak freeze, waive all penalties
    if (frozenDatesSet.has(date)) {
      await PointsLedger.deleteMany({
        userId,
        date,
        type: { $in: ["penalty_meals", "penalty_water", "penalty_workout"] },
      }).catch(() => {});
      continue;
    }

    const sources = sourcesByDate.get(date) || {
      meal: false,
      water: false,
      workout: false,
    };

    // 1. Meals Penalty (-15 XP if 0 meals logged)
    if (!sources.meal) {
      await PointsLedger.findOneAndUpdate(
        { userId, date, type: "penalty_meals" },
        {
          $set: {
            groupId: membership.groupId,
            points: PENALTY_RULES.meals,
            meta: { reason: "Missed daily meals log", habit: "meals" },
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      ).catch(() => {});
    } else {
      await PointsLedger.deleteOne({ userId, date, type: "penalty_meals" }).catch(() => {});
    }

    // 2. Water Penalty (-10 XP if no water logged)
    if (!sources.water) {
      await PointsLedger.findOneAndUpdate(
        { userId, date, type: "penalty_water" },
        {
          $set: {
            groupId: membership.groupId,
            points: PENALTY_RULES.water,
            meta: { reason: "Missed daily water goal", habit: "water" },
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      ).catch(() => {});
    } else {
      await PointsLedger.deleteOne({ userId, date, type: "penalty_water" }).catch(() => {});
    }

    // 3. Workout/Exercise Penalty (-15 XP if no workout or rest day logged)
    if (!sources.workout) {
      await PointsLedger.findOneAndUpdate(
        { userId, date, type: "penalty_workout" },
        {
          $set: {
            groupId: membership.groupId,
            points: PENALTY_RULES.workout,
            meta: { reason: "Missed daily workout/exercise log", habit: "workout" },
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      ).catch(() => {});
    } else {
      await PointsLedger.deleteOne({ userId, date, type: "penalty_workout" }).catch(() => {});
    }
  }
};

/**
 * Syncs weekly penalties for all active squad members for completed days of the week.
 */
const syncSquadWeeklyPenalties = async (memberIds = [], weekStart, todayStr) => {
  if (!memberIds.length || !weekStart || !todayStr) return;
  const yesterdayStr = addDaysToDateString(todayStr, -1);
  if (yesterdayStr < weekStart) return; // Monday morning: no past days in this week yet

  const tasks = memberIds.map((uId) =>
    syncMissedHabitPenalties(uId, weekStart, yesterdayStr).catch(() => {})
  );
  await Promise.allSettled(tasks);
};

/**
 * Clear penalty directly when habit is logged retroactively
 */
const clearHabitPenalty = async (userId, date, habitType) => {
  if (!userId || !date || !habitType) return;
  const pType = `penalty_${habitType}`;
  await PointsLedger.deleteOne({ userId, date, type: pType }).catch(() => {});
};

module.exports = {
  PENALTY_RULES,
  syncMissedHabitPenalties,
  syncSquadWeeklyPenalties,
  clearHabitPenalty,
};
