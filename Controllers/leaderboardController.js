const PointsLedger = require("../Modals/PointsLedger");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess } = require("../Utils/apiResponse");
const { getLocalDateString } = require("../Utils/date");

// @desc Get group leaderboard
// @route GET /api/groups/:id/leaderboard
const getGroupLeaderboard = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const { period = "week" } = req.query; // week, month, all
  const timezone = req.user.timezone;
  const today = new Date();

  let dateFilter = {};
  if (period === "week") {
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFilter = { date: { $gte: getLocalDateString(weekAgo, timezone) } };
  } else if (period === "month") {
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateFilter = { date: { $gte: getLocalDateString(monthAgo, timezone) } };
  }

  // Find all active members
  const memberships = await Membership.find({
    groupId,
    status: "active",
  }).populate("userId", "name email profileImage");

  const memberMap = new Map();
  memberships.forEach((m) => {
    if (m.userId) {
      memberMap.set(m.userId._id.toString(), {
        userId: m.userId._id,
        name: m.userId.name,
        profileImage: m.userId.profileImage,
        role: m.role,
        totalPoints: 0,
        mealPoints: 0,
        workoutPoints: 0,
        waterPoints: 0,
        bonusPoints: 0,
        loggedDays: 0,
      });
    }
  });

  // Aggregate points from ledger
  const ledgerEntries = await PointsLedger.find({
    groupId,
    ...dateFilter,
  });

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

  // Sort by points descending, break ties with consistency %
  rankings.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.consistencyPercent - a.consistencyPercent;
  });

  // Add rank numbers
  const rankedList = rankings.map((item, idx) => ({
    rank: idx + 1,
    ...item,
  }));

  return sendSuccess(res, {
    period,
    leaderboard: rankedList,
  });
});

module.exports = {
  getGroupLeaderboard,
};
