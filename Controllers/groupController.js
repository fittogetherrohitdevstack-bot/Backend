const crypto = require("crypto");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const FitnessProfile = require("../Modals/FitnessProfile");
const MealLog = require("../Modals/MealLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const WaterLog = require("../Modals/WaterLog");
const PointsLedger = require("../Modals/PointsLedger");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString } = require("../Utils/date");
const { emitGroupActivity } = require("../Utils/socket");
const { calculateChartTotals } = require("./mealController");

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

  return sendSuccess(res, { group, membership }, "Joined group successfully", 200);
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
  const { name, description, maxMembers } = req.body;
  const group = req.group;

  if (name) group.name = name;
  if (description !== undefined) group.description = description;
  if (maxMembers) group.maxMembers = maxMembers;

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
  }).populate("userId", "name email profileImage timezone createdAt");

  const userIds = memberships.map((m) => m.userId?._id).filter(Boolean);
  const profiles = await FitnessProfile.find({ userId: { $in: userIds } });
  const profileMap = new Map(profiles.map((p) => [p.userId.toString(), p]));

  const members = memberships.map((m) => {
    const userObj = m.userId ? m.userId.toObject() : {};
    const profile = profileMap.get(userObj._id?.toString());
    const isSelf = userObj._id?.toString() === req.user._id.toString();

    let safeProfile = null;
    if (profile) {
      safeProfile = {
        fitnessGoal: profile.fitnessGoal,
        activityLevel: profile.activityLevel,
        dietPreference: profile.dietPreference,
        targets: profile.targets,
        // Privacy checks: only expose if shared or if viewing own profile
        weight: (profile.privacy.weight === "group" || isSelf) ? profile.currentWeight : null,
        targetWeight: (profile.privacy.weight === "group" || isSelf) ? profile.targetWeight : null,
      };
    }

    return {
      userId: userObj._id,
      name: userObj.name,
      email: userObj.email,
      profileImage: userObj.profileImage,
      role: m.role,
      joinedAt: m.joinedAt,
      profile: safeProfile,
    };
  });

  return sendSuccess(res, { members });
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

  return sendSuccess(res, {
    group: req.group,
    date: todayStr,
    groupConsistency,
    activeMembersCount: memberSummaries.length,
    members: memberSummaries,
  });
});

module.exports = {
  createGroup,
  joinGroup,
  getMyGroups,
  getGroupById,
  updateGroup,
  getGroupMembers,
  regenerateInviteCode,
  leaveGroup,
  removeMember,
  getGroupDashboard,
};
