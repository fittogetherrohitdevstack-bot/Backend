const Challenge = require("../Modals/Challenge");
const ChallengeEntry = require("../Modals/ChallengeEntry");
const MealLog = require("../Modals/MealLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const WaterLog = require("../Modals/WaterLog");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { emitGroupActivity } = require("../Utils/socket");
const { calculateChartTotals } = require("./mealController");

// @desc Create group challenge
// @route POST /api/groups/:id/challenges
const createChallenge = asyncHandler(async (req, res) => {
  const { title, description, challengeType, target, startDate, endDate } = req.body;
  const groupId = req.group._id;

  if (!title || !challengeType || !target || !startDate || !endDate) {
    return sendError(res, "Title, challengeType, target, startDate, and endDate are required", 400);
  }

  const challenge = await Challenge.create({
    groupId,
    title,
    description: description || "",
    challengeType,
    target: Number(target),
    startDate,
    endDate,
    createdBy: req.user._id,
    status: "active",
  });

  // Creator automatically joins
  await ChallengeEntry.create({
    challengeId: challenge._id,
    userId: req.user._id,
    progress: 0,
    completed: false,
  });

  emitGroupActivity(groupId.toString(), "challenge-created", {
    challengeId: challenge._id,
    title: challenge.title,
    challengeType: challenge.challengeType,
    target: challenge.target,
    createdBy: req.user.name,
  });

  return sendSuccess(res, { challenge }, "Challenge created successfully", 201);
});

// @desc Get group challenges
// @route GET /api/groups/:id/challenges
const getGroupChallenges = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const challenges = await Challenge.find({ groupId })
    .populate("createdBy", "name profileImage")
    .sort({ createdAt: -1 });

  const challengeIds = challenges.map((c) => c._id);
  const myEntries = await ChallengeEntry.find({
    challengeId: { $in: challengeIds },
    userId: req.user._id,
  });
  const myEntryMap = new Map(myEntries.map((e) => [e.challengeId.toString(), e]));

  const participantCounts = await ChallengeEntry.aggregate([
    { $match: { challengeId: { $in: challengeIds } } },
    { $group: { _id: "$challengeId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(participantCounts.map((p) => [p._id.toString(), p.count]));

  const formatted = challenges.map((c) => {
    const entry = myEntryMap.get(c._id.toString());
    return {
      ...c.toObject(),
      isJoined: !!entry,
      myProgress: entry ? entry.progress : 0,
      myCompleted: entry ? entry.completed : false,
      participantCount: countMap.get(c._id.toString()) || 0,
    };
  });

  return sendSuccess(res, { challenges: formatted });
});

// @desc Join challenge
// @route POST /api/challenges/:id/join
const joinChallenge = asyncHandler(async (req, res) => {
  const challenge = await Challenge.findById(req.params.id);
  if (!challenge) {
    return sendError(res, "Challenge not found", 404);
  }

  let entry = await ChallengeEntry.findOne({
    challengeId: challenge._id,
    userId: req.user._id,
  });

  if (entry) {
    return sendSuccess(res, { entry }, "Already participating in this challenge");
  }

  entry = await ChallengeEntry.create({
    challengeId: challenge._id,
    userId: req.user._id,
    progress: 0,
    completed: false,
  });

  emitGroupActivity(challenge.groupId.toString(), "challenge-joined", {
    challengeId: challenge._id,
    userName: req.user.name,
    challengeTitle: challenge.title,
  });

  return sendSuccess(res, { entry }, "Joined challenge successfully", 201);
});

const Membership = require("../Modals/Membership");
const {
  CHALLENGE_TEMPLATES,
  computeChallengeMemberProgress,
  ensureWeeklyChallengeForGroup,
} = require("../Utils/challengeService");

// @desc List available Mon-Sun weekly challenge templates
// @route GET /api/groups/:id/challenges/templates
const getChallengeTemplates = asyncHandler(async (req, res) => {
  return sendSuccess(res, { templates: CHALLENGE_TEMPLATES });
});

// @desc Admin picks/switches active weekly challenge template for squad
// @route POST /api/groups/:id/challenges/weekly
const selectWeeklyChallengeTemplate = asyncHandler(async (req, res) => {
  const { templateKey } = req.body;
  const challenge = await ensureWeeklyChallengeForGroup(req.group._id, {
    templateKey: templateKey || null,
    createdBy: req.user._id,
  });

  if (templateKey && req.group) {
    req.group.challengeSettings = {
      ...(req.group.challengeSettings || {}),
      preferredTemplate: templateKey,
    };
    await req.group.save();
  }

  return sendSuccess(res, { challenge }, "Weekly challenge updated for squad");
});

// @desc Get challenge details & standings
// @route GET /api/challenges/:id
const getChallengeDetails = asyncHandler(async (req, res) => {
  const challenge = await Challenge.findById(req.params.id).populate("createdBy", "name profileImage");
  if (!challenge) {
    return sendError(res, "Challenge not found", 404);
  }

  const membership = await Membership.findOne({
    groupId: challenge.groupId,
    userId: req.user._id,
    status: "active",
  }).lean();

  if (!membership) {
    return sendError(res, "Forbidden: you must be a member of this squad", 403);
  }

  const entries = await ChallengeEntry.find({ challengeId: challenge._id })
    .populate("userId", "name email profileImage");

  const standings = [];

  for (const entry of entries) {
    if (!entry.userId) continue;
    const uId = entry.userId._id;
    const actualProgress = await computeChallengeMemberProgress(
      challenge,
      uId,
      entry.progress
    );

    const isCompleted = actualProgress >= challenge.target;
    if (entry.progress !== actualProgress || entry.completed !== isCompleted) {
      entry.progress = actualProgress;
      entry.completed = isCompleted;
      if (isCompleted && !entry.completedAt) entry.completedAt = new Date();
      await entry.save();
    }

    standings.push({
      userId: entry.userId._id,
      name: entry.userId.name,
      profileImage: entry.userId.profileImage,
      progress: actualProgress,
      target: challenge.target,
      percent: Math.min(100, Math.round((actualProgress / challenge.target) * 100)),
      completed: isCompleted,
      completedAt: entry.completedAt,
    });
  }

  // Sort standings by progress descending
  standings.sort((a, b) => b.progress - a.progress);

  return sendSuccess(res, {
    challenge,
    standings,
  });
});

module.exports = {
  createChallenge,
  getGroupChallenges,
  joinChallenge,
  getChallengeDetails,
  getChallengeTemplates,
  selectWeeklyChallengeTemplate,
};
