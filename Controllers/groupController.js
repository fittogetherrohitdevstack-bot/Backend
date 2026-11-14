const crypto = require("crypto");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const FitnessProfile = require("../Modals/FitnessProfile");
const MealLog = require("../Modals/MealLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const WaterLog = require("../Modals/WaterLog");
const PointsLedger = require("../Modals/PointsLedger");
const Badge = require("../Modals/Badge");
const UserBadge = require("../Modals/UserBadge");
const BodyMeasurement = require("../Modals/BodyMeasurement");
const NudgeLog = require("../Modals/NudgeLog");
const WeightLog = require("../Modals/WeightLog");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString, getISOWeekDetails } = require("../Utils/date");
const { emitGroupActivity } = require("../Utils/socket");
const { calculateChartTotals } = require("./mealController");
const {
  recalculateGroupStreak,
  getSquadTodayMemberStatuses,
  fetchUserLoggedDatesSet,
} = require("../Utils/streakService");
const { ensureWeeklyChallengeForGroup } = require("../Utils/challengeService");

// @desc Create a new fitness group
// @route POST /api/groups
const createGroup = asyncHandler(async (req, res) => {
  const { name, description, maxMembers } = req.body;

  const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  const group = await Group.create({
    name,
    description: description || "",
    createdBy: req.user._id,
    inviteCode,
    maxMembers: maxMembers || 15,
  });

  await Membership.create({
    groupId: group._id,
    userId: req.user._id,
    role: "admin",
    status: "active",
  });

  return sendSuccess(res, { group }, "Group created successfully", 201);
});

// @desc Join group via invite code
// @route POST /api/groups/join
const joinGroup = asyncHandler(async (req, res) => {
  const { inviteCode } = req.body;

  if (!inviteCode) {
    return sendError(res, "Invite code is required", 400);
  }

  const group = await Group.findOne({
    inviteCode: inviteCode.trim().toUpperCase(),
    isActive: true,
  });

  if (!group) {
    return sendError(res, "Invalid or expired invite code", 404);
  }

  // Check existing membership
  let membership = await Membership.findOne({
    groupId: group._id,
    userId: req.user._id,
  });

  if (membership && membership.status === "active") {
    return sendSuccess(res, { group, membership }, "You are already a member of this group");
  }

  // Check member capacity
  const activeCount = await Membership.countDocuments({
    groupId: group._id,
    status: "active",
  });

  if (activeCount >= group.maxMembers) {
    return sendError(res, `This group is full (max ${group.maxMembers} members)`, 400);
  }

  if (membership) {
    membership.status = "active";
    membership.joinedAt = new Date();
    await membership.save();
  } else {
    membership = await Membership.create({
      groupId: group._id,
      userId: req.user._id,
      role: "member",
      status: "active",
    });
  }

  emitGroupActivity(group._id.toString(), "member-joined", {
    userId: req.user._id,
    userName: req.user.name,
  });

  await recalculateGroupStreak(group._id).catch(() => {});

  return sendSuccess(res, { group, membership }, "Joined group successfully", 200);
});

// @desc Public invite link preview (safe metadata only, no user logs)
// @route GET /api/groups/invite/:code
const getInvitePreview = asyncHandler(async (req, res) => {
  const code = String(req.params.code || "").trim().toUpperCase();
  if (!code) {
    return sendError(res, "Invite code is required", 400);
  }

  const group = await Group.findOne({ inviteCode: code, isActive: true })
    .select("name description inviteCode maxMembers currentStreak longestStreak createdAt")
    .lean();

  if (!group) {
    return sendError(res, "Squad invite link is invalid or expired", 404);
  }

  const memberCount = await Membership.countDocuments({
    groupId: group._id,
    status: "active",
  });

  return sendSuccess(res, {
    squad: {
      _id: group._id,
      name: group.name,
      description: group.description,
      inviteCode: group.inviteCode,
      memberCount,
      maxMembers: group.maxMembers,
      isFull: memberCount >= group.maxMembers,
      currentStreak: group.currentStreak || 0,
      longestStreak: group.longestStreak || 0,
    },
  });
});

// @desc Get user's groups
// @route GET /api/groups/mine
const getMyGroups = asyncHandler(async (req, res) => {
  const memberships = await Membership.find({
    userId: req.user._id,
    status: "active",
  }).populate("groupId");

  const groups = memberships
    .filter((m) => m.groupId && m.groupId.isActive)
    .map((m) => ({
      ...m.groupId.toObject(),
      userRole: m.role,
      joinedAt: m.joinedAt,
    }));

  return sendSuccess(res, { groups });
});

// @desc Get group details
// @route GET /api/groups/:id
const getGroupById = asyncHandler(async (req, res) => {
  const group = req.group;
  const memberCount = await Membership.countDocuments({
    groupId: group._id,
    status: "active",
  });

  return sendSuccess(res, {
    group: {
      ...group.toObject(),
      memberCount,
      userRole: req.membership.role,
    },
  });
});

// @desc Update group details (Admin only)
// @route PUT /api/groups/:id
const updateGroup = asyncHandler(async (req, res) => {
  const { name, description, maxMembers, weeklyStakes, challengeSettings } = req.body;
  const group = req.group;

  if (name) group.name = name;
  if (description !== undefined) group.description = description;
  if (maxMembers) group.maxMembers = maxMembers;

  if (weeklyStakes && typeof weeklyStakes === "object") {
    group.weeklyStakes = {
      enabled:
        weeklyStakes.enabled !== undefined
          ? Boolean(weeklyStakes.enabled)
          : Boolean(group.weeklyStakes?.enabled),
      forfeitText:
        weeklyStakes.forfeitText !== undefined
          ? String(weeklyStakes.forfeitText).trim().slice(0, 140)
          : group.weeklyStakes?.forfeitText || "",
    };
  }

  if (challengeSettings && typeof challengeSettings === "object") {
    group.challengeSettings = {
      autoRotate:
        challengeSettings.autoRotate !== undefined
          ? Boolean(challengeSettings.autoRotate)
          : group.challengeSettings?.autoRotate !== false,
      preferredTemplate:
        challengeSettings.preferredTemplate !== undefined
          ? String(challengeSettings.preferredTemplate)
          : group.challengeSettings?.preferredTemplate || "",
      rotationIndex: group.challengeSettings?.rotationIndex || 0,
    };
  }

  await group.save();
  return sendSuccess(res, { group }, "Group updated successfully");
});

// @desc List group members with privacy filtered profiles
// @route GET /api/groups/:id/members
const getGroupMembers = asyncHandler(async (req, res) => {
  const groupId = req.group._id;

  const memberships = await Membership.find({
    groupId,
    status: "active",
  }).populate("userId", "name email profileImage timezone currentStreak longestStreak createdAt");

  const userIds = memberships.map((m) => m.userId?._id).filter(Boolean);
  const profiles = await FitnessProfile.find({ userId: { $in: userIds } });
  const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

  const members = memberships.map((m) => {
    const userObj = m.userId ? m.userId.toObject() : {};
    const profile = profileMap.get(userObj._id?.toString());
    const isSelf = userObj._id?.toString() === req.user._id.toString();

    let safeProfile = null;
    if (profile) {
      const isWeightPublic = profile.privacy?.weight === "group" || isSelf;
      safeProfile = {
        fitnessGoal: profile.fitnessGoal,
        activityLevel: profile.activityLevel,
        dietPreference: profile.dietPreference,
        targets: profile.targets,
        // Privacy checks: only expose if shared or if viewing own profile
        weight: isWeightPublic ? profile.currentWeight : null,
        targetWeight: isWeightPublic ? profile.targetWeight : null,
        isWeightPrivate: !isWeightPublic,
      };
    }

    return {
      userId: userObj._id,
      name: userObj.name,
      email: isSelf ? userObj.email : undefined,
      profileImage: userObj.profileImage,
      currentStreak: userObj.currentStreak || 0,
      longestStreak: userObj.longestStreak || 0,
      role: m.role,
      joinedAt: m.joinedAt,
      profile: safeProfile,
    };
  });

  return sendSuccess(res, { members });
});

// @desc Get detailed squad member profile with daily achievements, streaks, badges, points & privacy-gated personal metrics
// @route GET /api/groups/:id/members/:userId/profile
const getGroupMemberProfile = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const targetUserId = req.params.userId;
  const requesterId = req.user._id;

  // 1. Verify target is an active member of this squad
  const targetMembership = await Membership.findOne({
    groupId,
    userId: targetUserId,
    status: "active",
  }).lean();

  if (!targetMembership) {
    return sendError(res, "Member not found in this squad", 404);
  }

  // 2. Fetch target user details
  const targetUser = await User.findById(targetUserId)
    .select("name email profileImage timezone currentStreak longestStreak lastLogDate socialPrivacy createdAt")
    .lean();

  if (!targetUser) {
    return sendError(res, "User not found", 404);
  }

  const isSelf = requesterId.toString() === targetUser._id.toString();

  // 3. Fetch target user's fitness profile
  const fitnessProfile = await FitnessProfile.findOne({ userId: targetUser._id }).lean();

  // Privacy evaluations
  const isWeightPublic =
    isSelf ||
    (fitnessProfile?.privacy?.weight === "group" && targetUser?.socialPrivacy?.showWeightInFeed !== false);

  const isMeasurementsPublic =
    isSelf || fitnessProfile?.privacy?.measurements === "group";

  const isPhotosPublic =
    isSelf || fitnessProfile?.privacy?.photos === "group";

  // 4. Daily achievements & today's habit check-ins
  const tz = targetUser.timezone || "Asia/Kolkata";
  const localToday = getLocalDateString(new Date(), tz);
  const { sourcesByDate } = await fetchUserLoggedDatesSet(targetUser._id, localToday, localToday);
  const sources = sourcesByDate.get(localToday) || {
    weight: false,
    water: false,
    meal: false,
    workout: false,
  };
  const todayLogged = Boolean(
    sources.weight || sources.water || sources.meal || sources.workout
  );

  // Water check-in detail
  const waterLog = await WaterLog.findOne({ userId: targetUser._id, date: localToday }).lean();
  const waterLoggedMl = (waterLog?.entries || []).reduce(
    (acc, e) => acc + (Number(e.amountMl) || 0),
    0
  );
  const waterTargetMl = fitnessProfile?.targets?.waterMl || 3000;
  const waterCompleted = waterLoggedMl >= waterTargetMl;

  // Meal check-in detail
  const mealLog = await MealLog.findOne({ userId: targetUser._id, date: localToday }).lean();
  const mealsList = mealLog?.meals || [];
  const eatenMealsCount = mealsList.filter(
    (m) => m.status === "eaten" || (m.plannedFoodItems || []).some((i) => i.eaten)
  ).length;
  const totalPlannedMeals = mealsList.length;
  const mealsCompleted = totalPlannedMeals > 0 ? eatenMealsCount >= totalPlannedMeals : sources.meal;

  // Workout check-in detail
  const workoutSession = await WorkoutSession.findOne({
    userId: targetUser._id,
    date: localToday,
  }).lean();
  const workoutStatus = workoutSession ? workoutSession.status : "none";
  const workoutName = workoutSession?.name || (workoutStatus === "rest" ? "Rest Day" : "");

  // 5. Weekly consistency points & Squad Rank
  const { weekStart, weekEnd } = getISOWeekDetails(localToday);
  const activeMemberships = await Membership.find({ groupId, status: "active" })
    .select("userId")
    .lean();
  const squadUserIds = activeMemberships.map((m) => m.userId);

  const weeklyLedgers = await PointsLedger.aggregate([
    {
      $match: {
        userId: { $in: squadUserIds },
        date: { $gte: weekStart, $lte: weekEnd },
      },
    },
    {
      $group: {
        _id: "$userId",
        totalPoints: { $sum: "$points" },
      },
    },
    { $sort: { totalPoints: -1 } },
  ]);

  const targetIdStr = targetUser._id.toString();
  const rankIdx = weeklyLedgers.findIndex((l) => l._id.toString() === targetIdStr);
  const weeklyRank = rankIdx !== -1 ? rankIdx + 1 : squadUserIds.length;
  const weeklyPoints = rankIdx !== -1 ? weeklyLedgers[rankIdx].totalPoints : 0;

  // 6. Badges earned
  const userBadges = await UserBadge.find({ userId: targetUser._id })
    .sort({ earnedAt: -1 })
    .lean();
  const badgeCodes = userBadges.map((ub) => ub.badgeCode);
  const badgesCatalog = await Badge.find({ code: { $in: badgeCodes } }).lean();
  const catalogMap = new Map(badgesCatalog.map((b) => [b.code, b]));

  const badges = userBadges.map((ub) => {
    const cat = catalogMap.get(ub.badgeCode);
    return {
      code: ub.badgeCode,
      name: cat?.name || ub.badgeCode,
      description: cat?.description || "Earned achievement badge",
      icon: cat?.icon || "Award",
      earnedAt: ub.earnedAt,
    };
  });

  // 7. Personal details & metrics with strict privacy masking
  let weightData = {
    isPrivate: !isWeightPublic,
  };
  if (isWeightPublic) {
    weightData = {
      isPrivate: false,
      currentWeight: fitnessProfile?.currentWeight ?? null,
      targetWeight: fitnessProfile?.targetWeight ?? null,
      hideWeightNumbers: Boolean(fitnessProfile?.hideWeightNumbers),
    };
  }

  let measurementsData = {
    isPrivate: !isMeasurementsPublic,
  };
  if (isMeasurementsPublic) {
    const latestMeasurement = await BodyMeasurement.findOne({ userId: targetUser._id })
      .sort({ date: -1 })
      .lean();
    measurementsData = {
      isPrivate: false,
      latestDate: latestMeasurement?.date || null,
      measurementsCm: latestMeasurement?.measurementsCm || null,
    };
  }

  // 8. Nudge eligibility check
  const allowNudges = targetUser?.socialPrivacy?.allowNudges !== false;
  let canNudge = false;
  let nudgedByMeToday = false;
  let nudgesReceivedToday = 0;

  if (!isSelf) {
    const [nudgedByViewerCount, receivedCount] = await Promise.all([
      NudgeLog.countDocuments({
        senderId: requesterId,
        receiverId: targetUser._id,
        dateKey: localToday,
      }),
      NudgeLog.countDocuments({
        receiverId: targetUser._id,
        dateKey: localToday,
      }),
    ]);
    nudgedByMeToday = nudgedByViewerCount >= 1;
    nudgesReceivedToday = receivedCount;
    canNudge =
      !todayLogged &&
      allowNudges &&
      nudgedByViewerCount < 1 &&
      receivedCount < 3;
  }

  return sendSuccess(res, {
    user: {
      _id: targetUser._id,
      name: targetUser.name,
      email: isSelf ? targetUser.email : undefined,
      profileImage: targetUser.profileImage || "",
      currentStreak: targetUser.currentStreak || 0,
      longestStreak: targetUser.longestStreak || 0,
      lastLogDate: targetUser.lastLogDate || "",
      role: targetMembership.role,
      joinedAt: targetMembership.joinedAt || targetMembership.createdAt,
      isSelf,
    },
    today: {
      date: localToday,
      loggedToday,
      sources,
      water: {
        loggedMl: waterLoggedMl,
        targetMl: waterTargetMl,
        completed: waterCompleted,
      },
      meals: {
        eatenCount: eatenMealsCount,
        totalMeals: totalPlannedMeals,
        completed: mealsCompleted,
      },
      workout: {
        status: workoutStatus,
        name: workoutName,
        completed: workoutStatus === "completed" || workoutStatus === "rest",
      },
      weightLogged: sources.weight,
    },
    leaderboard: {
      weeklyPoints,
      weeklyRank,
      totalSquadMembers: squadUserIds.length,
    },
    badges,
    personalDetails: {
      fitnessGoal: fitnessProfile?.fitnessGoal || "maintenance",
      activityLevel: fitnessProfile?.activityLevel || "moderate",
      dietPreference: fitnessProfile?.dietPreference || "non_vegetarian",
      height: fitnessProfile?.height || null,
      targets: fitnessProfile?.targets || null,
      weight: weightData,
      measurements: measurementsData,
    },
    nudge: {
      canNudge,
      nudgedByMeToday,
      nudgesReceivedToday,
      allowNudges,
    },
  });
});

// @desc Regenerate invite code (Admin only)
// @route POST /api/groups/:id/invite/regenerate
const regenerateInviteCode = asyncHandler(async (req, res) => {
  const group = req.group;
  group.inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  await group.save();

  return sendSuccess(res, { inviteCode: group.inviteCode }, "Invite code regenerated");
});

// @desc Leave group
// @route POST /api/groups/:id/leave
const leaveGroup = asyncHandler(async (req, res) => {
  const membership = req.membership;
  membership.status = "left";
  await membership.save();

  // If was admin, ensure at least one active admin remains
  if (membership.role === "admin") {
    const remainingAdmin = await Membership.findOne({
      groupId: req.group._id,
      status: "active",
      role: "admin",
    });

    if (!remainingAdmin) {
      const nextMember = await Membership.findOne({
        groupId: req.group._id,
        status: "active",
      }).sort({ joinedAt: 1 });

      if (nextMember) {
        nextMember.role = "admin";
        await nextMember.save();
      }
    }
  }

  return sendSuccess(res, null, "You have left the group");
});

// @desc Remove group member (Admin only)
// @route DELETE /api/groups/:id/members/:userId
const removeMember = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const groupId = req.group._id;

  if (userId === req.user._id.toString()) {
    return sendError(res, "You cannot kick yourself; use leave group instead", 400);
  }

  const membership = await Membership.findOne({
    groupId,
    userId,
    status: "active",
  });

  if (!membership) {
    return sendError(res, "Member not found in this group", 404);
  }

  membership.status = "left";
  await membership.save();

  return sendSuccess(res, null, "Member removed from group");
});

// @desc Group dashboard aggregated feed
// @route GET /api/groups/:id/dashboard
const getGroupDashboard = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const fallbackTimezone = req.user.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), fallbackTimezone);

  // 1. Fetch active members
  const memberships = await Membership.find({
    groupId,
    status: "active",
  }).populate("userId", "name email profileImage timezone");

  const memberIds = memberships.map((m) => m.userId?._id).filter(Boolean);

  // Resolve each member's local today date so account and squad stay in lockstep
  const memberDateMap = new Map();
  const uniqueDatesSet = new Set([todayStr]);
  memberships.forEach((m) => {
    const userObj = m.userId;
    if (!userObj?._id) return;
    const localDate = getLocalDateString(new Date(), userObj.timezone || fallbackTimezone);
    memberDateMap.set(userObj._id.toString(), localDate);
    uniqueDatesSet.add(localDate);
  });
  const uniqueDates = Array.from(uniqueDatesSet);

  // Fetch member water targets + today's meal logs, workouts, and water logs in parallel
  const [profiles, todayMealLogs, todayWorkouts, todayWater] = await Promise.all([
    FitnessProfile.find({ userId: { $in: memberIds } })
      .select("userId targets.waterMl")
      .lean(),
    // MealLog is unique per { userId, date } regardless of groupId (DietTemplates/Tracker logs omit groupId)
    MealLog.find({
      userId: { $in: memberIds },
      date: { $in: uniqueDates },
    }).lean(),
    WorkoutSession.find({
      userId: { $in: memberIds },
      date: { $in: uniqueDates },
    }).lean(),
    WaterLog.find({
      userId: { $in: memberIds },
      date: { $in: uniqueDates },
    }).lean(),
  ]);

  const waterTargetMap = new Map(
    profiles.map((p) => [p.userId.toString(), p.targets?.waterMl])
  );
  const mealLogMap = new Map(
    todayMealLogs.map((log) => [`${log.userId.toString()}_${log.date}`, log])
  );
  const workoutMap = new Map(
    todayWorkouts.map((w) => [`${w.userId.toString()}_${w.date}`, w])
  );
  const waterMap = new Map(
    todayWater.map((w) => [`${w.userId.toString()}_${w.date}`, w])
  );

  // Aggregate member progress cards
  let totalPlannedItems = 0;
  let totalCompletedItems = 0;

  const memberSummaries = memberships.map((m) => {
    const user = m.userId ? m.userId.toObject() : {};
    const uId = user._id?.toString();
    const localDate = memberDateMap.get(uId) || todayStr;
    const key = `${uId}_${localDate}`;

    // Meals calculation using the exact same item-level totals as Account Dashboard & Daily Tracker
    const mealLog = mealLogMap.get(key);
    let totalMeals = 0;
    let eatenMeals = 0;
    let totalItems = 0;
    let itemsCompleted = 0;
    let mealCompletionRate = 0;

    if (mealLog && mealLog.meals && mealLog.meals.length > 0) {
      const totals = calculateChartTotals(mealLog.meals);
      totalMeals = totals.totalMeals;
      eatenMeals = totals.mealsCompleted;
      totalItems = totals.totalItems;
      itemsCompleted = totals.itemsCompleted;
      mealCompletionRate =
        totalItems > 0
          ? totals.completionPercentage
          : Math.round((eatenMeals / totalMeals) * 100);

      totalPlannedItems += totalItems;
      totalCompletedItems += itemsCompleted;
    }

    // Workout calculation
    const workout = workoutMap.get(key);
    const workoutStatus = workout ? workout.status : "pending";
    const workoutCompleted = workoutStatus === "completed" || workoutStatus === "rest";

    // Water calculation synchronized with FitnessProfile target + WaterLog entries
    const water = waterMap.get(key);
    const waterTarget = waterTargetMap.get(uId) || water?.targetMl || 3000;
    const totalWaterMl = water
      ? (water.entries || []).reduce((sum, e) => sum + (e.amountMl || 0), 0)
      : 0;
    const waterProgressPercent =
      waterTarget > 0
        ? Math.min(100, Math.round((totalWaterMl / waterTarget) * 100))
        : 0;

    return {
      userId: user._id,
      name: user.name,
      profileImage: user.profileImage,
      role: m.role,
      today: {
        totalMeals,
        eatenMeals,
        totalItems,
        itemsCompleted,
        mealCompletionRate,
        workoutStatus,
        workoutCompleted,
        totalWaterMl,
        waterTarget,
        waterProgressPercent,
      },
    };
  });

  // Calculate overall group consistency
  const totalPlannedMeals = memberSummaries.reduce((sum, m) => sum + m.today.totalMeals, 0);
  const totalEatenMeals = memberSummaries.reduce((sum, m) => sum + m.today.eatenMeals, 0);
  const groupConsistency =
    totalPlannedItems > 0
      ? Math.round((totalCompletedItems / totalPlannedItems) * 100)
      : totalPlannedMeals > 0
      ? Math.round((totalEatenMeals / totalPlannedMeals) * 100)
      : 0;

  const mongoose = require("mongoose");
  const isDbReady = mongoose.connection.readyState === 1;
  const rawGroup = typeof req.group.toObject === "function" ? req.group.toObject() : req.group;

  let streakStats = null;
  let todayStatus = null;
  let activeWeeklyChallenge = null;

  if (isDbReady) {
    [streakStats, todayStatus, activeWeeklyChallenge] = await Promise.all([
      recalculateGroupStreak(req.group._id).catch(() => ({
        currentStreak: rawGroup.currentStreak || 0,
        longestStreak: rawGroup.longestStreak || 0,
        lastLogDate: rawGroup.lastLogDate || "",
      })),
      getSquadTodayMemberStatuses(req.group._id, req.user._id).catch(() => null),
      rawGroup.challengeSettings?.autoRotate !== false
        ? ensureWeeklyChallengeForGroup(req.group._id).catch(() => null)
        : Promise.resolve(null),
    ]);
  }

  return sendSuccess(res, {
    group: {
      ...rawGroup,
      currentStreak: streakStats?.currentStreak ?? rawGroup.currentStreak ?? 0,
      longestStreak: streakStats?.longestStreak ?? rawGroup.longestStreak ?? 0,
      lastLogDate: streakStats?.lastLogDate ?? rawGroup.lastLogDate ?? "",
    },
    date: todayStr,
    groupConsistency,
    activeMembersCount: memberSummaries.length,
    members: memberSummaries,
    streakStats,
    todayStatus,
    activeWeeklyChallenge,
    userRole: req.membership?.role || "member",
  });
});

module.exports = {
  createGroup,
  joinGroup,
  getInvitePreview,
  getMyGroups,
  getGroupById,
  updateGroup,
  getGroupMembers,
  getGroupMemberProfile,
  regenerateInviteCode,
  leaveGroup,
  removeMember,
  getGroupDashboard,
};
