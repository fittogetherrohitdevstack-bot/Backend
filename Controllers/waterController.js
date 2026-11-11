const WaterLog = require("../Modals/WaterLog");
const FitnessProfile = require("../Modals/FitnessProfile");
const PointsLedger = require("../Modals/PointsLedger");
const Membership = require("../Modals/Membership");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString } = require("../Utils/date");
const { POINTS_RULES } = require("../Utils/gamification");
const { emitGroupActivity } = require("../Utils/socket");

// @desc Add water intake
// @route POST /api/water
const addWater = asyncHandler(async (req, res) => {
  const { amountMl, date } = req.body;

  if (!amountMl || Number(amountMl) <= 0) {
    return sendError(res, "amountMl must be greater than 0", 400);
  }

  const logDate = date || getLocalDateString(new Date(), req.user.timezone);

  // Get user's target
  const profile = await FitnessProfile.findOne({ userId: req.user._id });
  const defaultTarget = profile?.targets?.waterMl || 3000;

  let waterLog = await WaterLog.findOne({
    userId: req.user._id,
    date: logDate,
  });

  if (!waterLog) {
    waterLog = new WaterLog({
      userId: req.user._id,
      date: logDate,
      targetMl: defaultTarget,
      entries: [],
    });
  }

  waterLog.entries.push({
    amountMl: Number(amountMl),
    consumedAt: new Date(),
  });

  await waterLog.save();

  const totalConsumed = waterLog.entries.reduce((sum, e) => sum + e.amountMl, 0);

  // If reached goal, award points
  if (totalConsumed >= waterLog.targetMl) {
    const membership = await Membership.findOne({
      userId: req.user._id,
      status: "active",
    });

    if (membership) {
      await PointsLedger.findOneAndUpdate(
        {
          userId: req.user._id,
          groupId: membership.groupId,
          date: logDate,
          type: "water",
        },
        {
          $set: {
            points: POINTS_RULES.WATER_GOAL_REACHED,
            meta: { totalConsumed, targetMl: waterLog.targetMl },
          },
        },
        { upsert: true, new: true }
      );

      emitGroupActivity(membership.groupId.toString(), "water-goal-hit", {
        userId: req.user._id,
        userName: req.user.name,
        totalConsumed,
      });
    }
  }

  return sendSuccess(res, {
    waterLog,
    totalConsumed,
    targetMl: waterLog.targetMl,
    percent: Math.min(100, Math.round((totalConsumed / waterLog.targetMl) * 100)),
  }, "Water intake recorded");
});

// @desc Get today's water intake
// @route GET /api/water/today
const getTodayWater = asyncHandler(async (req, res) => {
  const todayStr = getLocalDateString(new Date(), req.user.timezone);
  const profile = await FitnessProfile.findOne({ userId: req.user._id });
  const defaultTarget = profile?.targets?.waterMl || 3000;

  const waterLog = await WaterLog.findOne({
    userId: req.user._id,
    date: todayStr,
  });

  const totalConsumed = waterLog ? waterLog.entries.reduce((sum, e) => sum + e.amountMl, 0) : 0;
  const targetMl = waterLog?.targetMl || defaultTarget;

  return sendSuccess(res, {
    date: todayStr,
    totalConsumed,
    targetMl,
    percent: Math.min(100, Math.round((totalConsumed / targetMl) * 100)),
    entries: waterLog?.entries || [],
  });
});

// @desc Get water history
// @route GET /api/water/history
const getWaterHistory = asyncHandler(async (req, res) => {
  const logs = await WaterLog.find({ userId: req.user._id })
    .sort({ date: -1 })
    .limit(14);

  const formatted = logs.map((log) => ({
    date: log.date,
    totalConsumed: log.entries.reduce((sum, e) => sum + e.amountMl, 0),
    targetMl: log.targetMl,
  }));

  return sendSuccess(res, { history: formatted });
});

// @desc Delete an entry
// @route DELETE /api/water/entries/:entryId
const deleteWaterEntry = asyncHandler(async (req, res) => {
  const { entryId } = req.params;
  const todayStr = getLocalDateString(new Date(), req.user.timezone);

  const waterLog = await WaterLog.findOne({
    userId: req.user._id,
    date: todayStr,
  });

  if (!waterLog) {
    return sendError(res, "Water log not found", 404);
  }

  waterLog.entries = waterLog.entries.filter((e) => e._id.toString() !== entryId);
  await waterLog.save();

  const totalConsumed = waterLog.entries.reduce((sum, e) => sum + e.amountMl, 0);

  return sendSuccess(res, {
    waterLog,
    totalConsumed,
  }, "Water entry removed");
});

module.exports = {
  addWater,
  getTodayWater,
  getWaterHistory,
  deleteWaterEntry,
};
