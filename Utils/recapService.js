const WeeklyRecap = require("../Modals/WeeklyRecap");
const User = require("../Modals/User");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const WaterLog = require("../Modals/WaterLog");
const WeightLog = require("../Modals/WeightLog");
const PointsLedger = require("../Modals/PointsLedger");
const { getLocalDateString, getISOWeekDetails } = require("./date");
const { fetchUserLoggedDatesSet, recalculateUserStreak } = require("./streakService");

/**
 * Computes Monday–Sunday Weekly Recap statistics (respecting weight privacy & optional Phase 8 fun stakes).
 */
const generateWeeklyRecapForUser = async (
  userId,
  { weekStartOverride = null, persist = true } = {}
) => {
  const user = await User.findById(userId).lean();
  if (!user) return null;

  const tz = user.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), tz);
  const currentWeek = getISOWeekDetails(todayStr);

  const weekStart = weekStartOverride || currentWeek.weekStart;
  const weekEnd = weekStartOverride
    ? getISOWeekDetails(weekStartOverride).weekEnd
    : currentWeek.weekEnd;

  // Refresh streak accurately before snapshotting
  const liveStreak = await recalculateUserStreak(userId, { skipGroupSync: true }).catch(() => null);

  const [waterLogs, weightLogs, pointsRows, membership] = await Promise.all([
    WaterLog.find({ userId, date: { $gte: weekStart, $lte: weekEnd } }).lean(),
    WeightLog.find({ userId, date: { $gte: weekStart, $lte: weekEnd } })
      .sort({ date: 1 })
      .lean(),
    PointsLedger.find({ userId, date: { $gte: weekStart, $lte: weekEnd } }).lean(),
    Membership.findOne({ userId, status: "active" }).populate("groupId").lean(),
  ]);

  const waterTotalMl = waterLogs.reduce(
    (sum, w) => sum + (w.entries || []).reduce((acc, e) => acc + (Number(e.amountMl) || 0), 0),
    0
  );

  const { loggedDatesSet } = await fetchUserLoggedDatesSet(userId, weekStart, weekEnd);
  const daysLogged = loggedDatesSet.size;
  const xpEarned = pointsRows.reduce((sum, p) => sum + (Number(p.points) || 0), 0);

  // Respect user privacy toggle for showing weight change on shareable recap card
  const weightChangeAllowed = Boolean(user.socialPrivacy?.showWeightInRecap);
  let weightChangeKg = null;
  if (weightChangeAllowed && weightLogs.length >= 2) {
    const firstW = weightLogs[0].weightKg;
    const lastW = weightLogs[weightLogs.length - 1].weightKg;
    weightChangeKg = Math.round((lastW - firstW) * 10) / 10;
  }

  // Squad standings & optional Phase 8 fun forfeit
  let groupId = null;
  let squadName = "";
  let squadInviteCode = "";
  let squadStreak = 0;
  let squadRank = null;
  let squadSize = 0;
  let forfeitAlert = {
    enabled: false,
    forfeitText: "",
    lowestMemberUserId: null,
    lowestMemberName: "",
    lowestMemberPoints: 0,
    isCurrentUserLowest: false,
  };

  if (membership?.groupId) {
    const group = membership.groupId;
    groupId = group._id;
    squadName = group.name || "";
    squadInviteCode = group.inviteCode || "";
    squadStreak = group.currentStreak || 0;

    const groupMemberships = await Membership.find({
      groupId: group._id,
      status: "active",
    })
      .populate("userId", "name")
      .lean();

    const memberIds = groupMemberships.map((m) => m.userId?._id).filter(Boolean);
    squadSize = memberIds.length;

    const squadPointsRows = await PointsLedger.find({
      userId: { $in: memberIds },
      date: { $gte: weekStart, $lte: weekEnd },
    }).lean();

    const totalsByUser = new Map();
    for (const mId of memberIds) {
      totalsByUser.set(mId.toString(), 0);
    }
    for (const row of squadPointsRows) {
      const k = row.userId.toString();
      totalsByUser.set(k, (totalsByUser.get(k) || 0) + (Number(row.points) || 0));
    }

    const ranked = groupMemberships
      .filter((m) => m.userId)
      .map((m) => ({
        userId: m.userId._id,
        name: m.userId.name,
        points: totalsByUser.get(m.userId._id.toString()) || 0,
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const myIdx = ranked.findIndex((r) => r.userId.toString() === userId.toString());
    squadRank = myIdx >= 0 ? myIdx + 1 : null;

    if (group.weeklyStakes?.enabled && group.weeklyStakes?.forfeitText && ranked.length > 1) {
      const lowest = ranked[ranked.length - 1];
      forfeitAlert = {
        enabled: true,
        forfeitText: group.weeklyStakes.forfeitText,
        lowestMemberUserId: lowest.userId,
        lowestMemberName: lowest.name,
        lowestMemberPoints: lowest.points,
        isCurrentUserLowest: lowest.userId.toString() === userId.toString(),
      };
    }
  }

  const stats = {
    userName: user.name,
    streak: liveStreak ? liveStreak.currentStreak : user.currentStreak || 0,
    longestStreak: liveStreak ? liveStreak.longestStreak : user.longestStreak || 0,
    squadStreak,
    squadName,
    squadInviteCode,
    waterTotalMl,
    daysLogged,
    xpEarned,
    squadRank,
    squadSize,
    weightChangeKg,
    weightChangeAllowed,
    forfeitAlert,
  };

  if (!persist) {
    return {
      userId,
      groupId,
      weekStart,
      weekEnd,
      stats,
      generatedAt: new Date(),
    };
  }

  const saved = await WeeklyRecap.findOneAndUpdate(
    { userId, weekStart },
    {
      $set: {
        groupId,
        weekStart,
        weekEnd,
        stats,
        generatedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  return saved;
};

module.exports = {
  generateWeeklyRecapForUser,
};
