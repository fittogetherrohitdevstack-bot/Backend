const Badge = require("../Modals/Badge");
const UserBadge = require("../Modals/UserBadge");
const MealLog = require("../Modals/MealLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const WaterLog = require("../Modals/WaterLog");
const ChallengeEntry = require("../Modals/ChallengeEntry");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess } = require("../Utils/apiResponse");
const { SEEDED_BADGES } = require("../Utils/gamification");
const { emitGroupActivity } = require("../Utils/socket");
const { emitSquadFeedEvent } = require("../Utils/feedService");
const { getLocalDateString } = require("../Utils/date");

// @desc Get user's earned and available badges
// @route GET /api/users/me/badges
const getMyBadges = asyncHandler(async (req, res) => {
  // 1. Ensure catalog badges exist
  for (const b of SEEDED_BADGES) {
    await Badge.findOneAndUpdate(
      { code: b.code },
      { $setOnInsert: b },
      { upsert: true }
    );
  }

  const catalog = await Badge.find().sort({ code: 1 });
  const earned = await UserBadge.find({ userId: req.user._id });
  const earnedMap = new Map(earned.map((ub) => [ub.badgeCode, ub.earnedAt]));

  // Dynamically check and award any newly qualified badges
  const newlyEarned = [];

  // Check FIRST_LOG
  if (!earnedMap.has("FIRST_LOG")) {
    const hasMeal = await MealLog.exists({ userId: req.user._id, "meals.status": "eaten" });
    const hasWorkout = await WorkoutSession.exists({ userId: req.user._id, status: "completed" });
    if (hasMeal || hasWorkout) {
      newlyEarned.push("FIRST_LOG");
    }
  }

  // Check HYDRATION_HERO (7 water days reached)
  if (!earnedMap.has("HYDRATION_HERO")) {
    const waterLogs = await WaterLog.find({ userId: req.user._id });
    let count = 0;
    waterLogs.forEach((w) => {
      const sum = w.entries.reduce((acc, e) => acc + e.amountMl, 0);
      if (sum >= w.targetMl) count++;
    });
    if (count >= 7) newlyEarned.push("HYDRATION_HERO");
  }

  // Check CHALLENGE_CHAMPION
  if (!earnedMap.has("CHALLENGE_CHAMPION")) {
    const completedChallenge = await ChallengeEntry.exists({
      userId: req.user._id,
      completed: true,
    });
    if (completedChallenge) newlyEarned.push("CHALLENGE_CHAMPION");
  }

  // Check IRON_REGULAR (4 workouts completed)
  if (!earnedMap.has("IRON_REGULAR")) {
    const workoutCount = await WorkoutSession.countDocuments({
      userId: req.user._id,
      status: "completed",
    });
    if (workoutCount >= 4) newlyEarned.push("IRON_REGULAR");
  }

  const userDoc = await User.findById(req.user._id).select("currentStreak longestStreak timezone").lean();

  // Check STREAK_7 (7-Day Streak) & STREAK_30
  if (!earnedMap.has("STREAK_7") && (userDoc?.longestStreak || 0) >= 7) {
    newlyEarned.push("STREAK_7");
  }
  if (!earnedMap.has("STREAK_30") && (userDoc?.longestStreak || 0) >= 30) {
    newlyEarned.push("STREAK_30");
  }

  // Check CONSISTENCY_KING (14+ day streak)
  if (!earnedMap.has("CONSISTENCY_KING") && (userDoc?.longestStreak || 0) >= 14) {
    newlyEarned.push("CONSISTENCY_KING");
  }

  // Check WATER_WARRIOR (10 water goal days)
  if (!earnedMap.has("WATER_WARRIOR")) {
    const waterLogs = await WaterLog.find({ userId: req.user._id }).lean();
    let hitDays = 0;
    for (const w of waterLogs) {
      const sum = (w.entries || []).reduce((acc, e) => acc + (e.amountMl || 0), 0);
      if (sum >= Math.min(w.targetMl || 2000, 2000)) hitDays++;
    }
    if (hitDays >= 10) newlyEarned.push("WATER_WARRIOR");
  }

  // Check SQUAD_STAR (active in at least 1 squad & 50+ XP / 1+ challenge joined)
  if (!earnedMap.has("SQUAD_STAR")) {
    const [inSquad, hasEntry] = await Promise.all([
      Membership.exists({ userId: req.user._id, status: "active" }),
      ChallengeEntry.exists({ userId: req.user._id }),
    ]);
    if (inSquad && hasEntry) newlyEarned.push("SQUAD_STAR");
  }

  // Save any newly awarded badges
  const todayStr = getLocalDateString(new Date(), userDoc?.timezone || "Asia/Kolkata");
  if (newlyEarned.length > 0) {
    const membership = await Membership.findOne({
      userId: req.user._id,
      status: "active",
    });

    for (const code of newlyEarned) {
      const ub = await UserBadge.create({
        userId: req.user._id,
        groupId: membership?.groupId || null,
        badgeCode: code,
        earnedAt: new Date(),
      });
      earnedMap.set(code, ub.earnedAt);

      const badgeInfo = catalog.find((b) => b.code === code);
      await emitSquadFeedEvent({
        userId: req.user._id,
        type: "badge_earned",
        title: `unlocked the ${badgeInfo?.name || code} badge! 🏅`,
        dateKey: todayStr,
        dedupeKey: `badge_${req.user._id}_${code}`,
        meta: { badgeCode: code, badgeName: badgeInfo?.name || code },
      });

      if (membership) {
        emitGroupActivity(membership.groupId.toString(), "badge-earned", {
          userId: req.user._id,
          userName: req.user.name,
          badgeName: badgeInfo?.name || code,
          badgeIcon: badgeInfo?.icon || "Award",
        });
      }
    }
  }

  const badges = catalog.map((b) => ({
    code: b.code,
    name: b.name,
    description: b.description,
    icon: b.icon,
    isEarned: earnedMap.has(b.code),
    earnedAt: earnedMap.get(b.code) || null,
    isNewlyUnlocked: newlyEarned.includes(b.code),
  }));

  return sendSuccess(res, {
    badges,
    totalEarned: earnedMap.size,
    newlyEarned,
  });
});

module.exports = {
  getMyBadges,
};
