const Badge = require("../Modals/Badge");
const UserBadge = require("../Modals/UserBadge");
const MealLog = require("../Modals/MealLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const WaterLog = require("../Modals/WaterLog");
const ChallengeEntry = require("../Modals/ChallengeEntry");
const Membership = require("../Modals/Membership");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess } = require("../Utils/apiResponse");
const { SEEDED_BADGES } = require("../Utils/gamification");
const { emitGroupActivity } = require("../Utils/socket");

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

  // Save any newly awarded badges
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

      if (membership) {
        const badgeInfo = catalog.find((b) => b.code === code);
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
  }));

  return sendSuccess(res, {
    badges,
    totalEarned: earnedMap.size,
  });
});

module.exports = {
  getMyBadges,
};
