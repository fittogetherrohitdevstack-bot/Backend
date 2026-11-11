const WaterLog = require("../Modals/WaterLog");
const FitnessProfile = require("../Modals/FitnessProfile");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString } = require("../Utils/date");
const { POINTS_RULES, syncDailyHabitPoints } = require("../Utils/gamification");

const syncWaterGamification = async ({
  user,
  dateStr,
  totalConsumed,
  targetMl,
  notifyGoalHit = false,
}) => {
  const timezone = user.timezone || "Asia/Kolkata";
  const isTodayDate = dateStr === getLocalDateString(new Date(), timezone);
  const goalHit = totalConsumed >= targetMl;

  let eventName = null;
  if (isTodayDate) {
    eventName = notifyGoalHit && goalHit ? "water-goal-hit" : "squad-sync";
  }

  await syncDailyHabitPoints({
    userId: user._id,
    date: dateStr,
    type: "water",
    points: goalHit ? POINTS_RULES.WATER_GOAL_REACHED : 0,
    meta: { totalConsumed, targetMl },
    eventName,
    eventPayload: isTodayDate
      ? {
          userId: user._id,
          userName: user.name,
          totalConsumed,
          targetMl,
        }
      : null,
  });
};

// @desc Add water intake
// @route POST /api/water
const addWater = asyncHandler(async (req, res) => {
  const { amountMl, date } = req.body;

  if (!amountMl || Number(amountMl) <= 0) {
    return sendError(res, "amountMl must be greater than 0", 400);
  }

  const logDate = date || getLocalDateString(new Date(), req.user.timezone);

  // Keep WaterLog target synchronized with user's FitnessProfile target
  const profile = await FitnessProfile.findOne({ userId: req.user._id }).lean();
  const resolvedTarget = profile?.targets?.waterMl || 3000;

  let waterLog = await WaterLog.findOne({
    userId: req.user._id,
    date: logDate,
  });

  const previousTotal = waterLog
    ? (waterLog.entries || []).reduce((sum, e) => sum + e.amountMl, 0)
    : 0;

  if (!waterLog) {
    waterLog = new WaterLog({
      userId: req.user._id,
      date: logDate,
      targetMl: resolvedTarget,
      entries: [],
    });
  } else if (profile?.targets?.waterMl) {
    waterLog.targetMl = profile.targets.waterMl;
  }

  waterLog.entries.push({
    amountMl: Number(amountMl),
    consumedAt: new Date(),
  });

  await waterLog.save();

  const totalConsumed = waterLog.entries.reduce((sum, e) => sum + e.amountMl, 0);
  const crossedGoalNow = previousTotal < waterLog.targetMl && totalConsumed >= waterLog.targetMl;

  await syncWaterGamification({
    user: req.user,
    dateStr: logDate,
    totalConsumed,
    targetMl: waterLog.targetMl,
    notifyGoalHit: crossedGoalNow,
  });

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
  const [profile, waterLog] = await Promise.all([
    FitnessProfile.findOne({ userId: req.user._id }).lean(),
    WaterLog.findOne({
      userId: req.user._id,
      date: todayStr,
    }),
  ]);

  const totalConsumed = waterLog ? waterLog.entries.reduce((sum, e) => sum + e.amountMl, 0) : 0;
  const targetMl = profile?.targets?.waterMl || waterLog?.targetMl || 3000;

  return sendSuccess(res, {
    date: todayStr,
    totalConsumed,
    targetMl,
    percent: targetMl > 0 ? Math.min(100, Math.round((totalConsumed / targetMl) * 100)) : 0,
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

  const [profile, waterLog] = await Promise.all([
    FitnessProfile.findOne({ userId: req.user._id }).lean(),
    WaterLog.findOne({
      userId: req.user._id,
      date: todayStr,
    }),
  ]);

  if (!waterLog) {
    return sendError(res, "Water log not found", 404);
  }

  const resolvedTarget = profile?.targets?.waterMl || waterLog.targetMl || 3000;
  waterLog.targetMl = resolvedTarget;
  waterLog.entries = waterLog.entries.filter((e) => e._id.toString() !== entryId);
  await waterLog.save();

  const totalConsumed = waterLog.entries.reduce((sum, e) => sum + e.amountMl, 0);

  await syncWaterGamification({
    user: req.user,
    dateStr: todayStr,
    totalConsumed,
    targetMl: resolvedTarget,
    notifyGoalHit: false,
  });

  return sendSuccess(res, {
    waterLog,
    totalConsumed,
    targetMl: resolvedTarget,
    percent: resolvedTarget > 0 ? Math.min(100, Math.round((totalConsumed / resolvedTarget) * 100)) : 0,
  }, "Water entry removed");
});

module.exports = {
  addWater,
  getTodayWater,
  getWaterHistory,
  deleteWaterEntry,
};
