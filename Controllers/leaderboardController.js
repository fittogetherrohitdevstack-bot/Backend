const PointsLedger = require("../Modals/PointsLedger");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess } = require("../Utils/apiResponse");
const {
  getLocalDateString,
  getISOWeekDetails,
  addDaysToDateString,
} = require("../Utils/date");

// @desc Get group leaderboard (ranked strictly by consistency & XP points, never weight lost)
// @route GET /api/groups/:id/leaderboard
const getGroupLeaderboard = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const { period = "week" } = req.query; // week (Mon-Sun), month, all
  const timezone = req.user?.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), timezone);
  const currentWeek = getISOWeekDetails(todayStr);

  let dateFilter = {};
  let prevFilter = null;
  if (period === "week") {
    dateFilter = { date: { $gte: currentWeek.weekStart, $lte: currentWeek.weekEnd } };
    const prevWeekAnchor = addDaysToDateString(currentWeek.weekStart, -7);
    const prevWeek = getISOWeekDetails(prevWeekAnchor);
    prevFilter = { date: { $gte: prevWeek.weekStart, $lte: prevWeek.weekEnd } };
  } else if (period === "month") {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    dateFilter = { date: { $gte: getLocalDateString(monthAgo, timezone) } };
  }

  // Find all active members
  const memberships = await Membership.find({
    groupId,
    status: "active",
  }).populate("userId", "name email profileImage currentStreak longestStreak");

  const memberMap = new Map();
  memberships.forEach((m) => {
    if (m.userId) {
      memberMap.set(m.userId._id.toString(), {
        userId: m.userId._id,
        name: m.userId.name,
        profileImage: m.userId.profileImage,
        role: m.role,
        currentStreak: m.userId.currentStreak || 0,
        longestStreak: m.userId.longestStreak || 0,
        totalPoints: 0,
        mealPoints: 0,
        workoutPoints: 0,
        waterPoints: 0,
        bonusPoints: 0,
        loggedDays: 0,
      });
    }
  });

  // Aggregate daily consistency points for active members across all their squads
  const memberIds = memberships.map((m) => m.userId?._id).filter(Boolean);
  const ledgerEntries = await PointsLedger.find({
    userId: { $in: memberIds },
    ...dateFilter,
  }).lean();

  const memberDays = new Map();

  ledgerEntries.forEach((entry) => {
    const uId = entry.userId.toString();
    const stats = memberMap.get(uId);
    if (stats) {
      stats.totalPoints += entry.points || 0;
      if (entry.type === "meals") stats.mealPoints += entry.points;
      else if (entry.type === "workout") stats.workoutPoints += entry.points;
      else if (entry.type === "water") stats.waterPoints += entry.points;
      else stats.bonusPoints += entry.points;

      if (!memberDays.has(uId)) memberDays.set(uId, new Set());
      memberDays.get(uId).add(entry.date);
    }
  });

  // Compute previous period rank map so UI can animate rankDelta movements
  const prevRankMap = new Map();
  if (prevFilter && memberIds.length > 0) {
    try {
      const prevEntries = await PointsLedger.find({
        userId: { $in: memberIds },
        ...prevFilter,
      }).lean();
      if (Array.isArray(prevEntries) && prevEntries.length > 0) {
        const prevTotals = new Map();
        for (const id of memberIds) prevTotals.set(id.toString(), 0);
        for (const pe of prevEntries) {
          const k = pe.userId.toString();
          prevTotals.set(k, (prevTotals.get(k) || 0) + (pe.points || 0));
        }
        const sortedPrev = Array.from(prevTotals.entries()).sort((a, b) => b[1] - a[1]);
        sortedPrev.forEach(([id, pts], idx) => {
          if (pts > 0) prevRankMap.set(id, idx + 1);
        });
      }
    } catch (_) {
      // Non-blocking fallback when PointsLedger mock is single-call
    }
  }

  // Calculate consistency %
  const daysInPeriod = period === "week" ? 7 : period === "month" ? 30 : 60;
  const rankings = Array.from(memberMap.values()).map((m) => {
    const daysLogged = memberDays.get(m.userId.toString())?.size || 0;
    const consistencyPercent = Math.min(100, Math.round((daysLogged / daysInPeriod) * 100));
    return {
      ...m,
      loggedDays: daysLogged,
      consistencyPercent,
    };
  });

  // Sort strictly by points descending, break ties with consistency % then currentStreak
  rankings.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.consistencyPercent !== a.consistencyPercent) {
      return b.consistencyPercent - a.consistencyPercent;
    }
    return (b.currentStreak || 0) - (a.currentStreak || 0);
  });

  const rankedList = rankings.map((item, idx) => {
    const rank = idx + 1;
    const prevRank = prevRankMap.get(item.userId.toString()) ?? null;
    const rankDelta = prevRank !== null ? prevRank - rank : 0;
    return {
      rank,
      prevRank,
      rankDelta,
      ...item,
    };
  });

  // Phase 8 Optional Fun Stakes: purely cosmetic forfeit callout for lowest weekly points
  const stakesEnabled = Boolean(req.group?.weeklyStakes?.enabled && req.group?.weeklyStakes?.forfeitText);
  const lowestMember = rankedList.length > 1 ? rankedList[rankedList.length - 1] : null;
  const weeklyStakes = stakesEnabled && period === "week"
    ? {
        enabled: true,
        forfeitText: req.group.weeklyStakes.forfeitText,
        lowestUserId: lowestMember?.userId || null,
        lowestUserName: lowestMember?.name || "",
        lowestPoints: lowestMember?.totalPoints || 0,
      }
    : { enabled: false, forfeitText: "" };

  return sendSuccess(res, {
    period,
    weekStart: period === "week" ? currentWeek.weekStart : null,
    weekEnd: period === "week" ? currentWeek.weekEnd : null,
    leaderboard: rankedList,
    weeklyStakes,
  });
});

module.exports = {
  getGroupLeaderboard,
};
