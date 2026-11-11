const path = require("path");
const fs = require("fs");
const WeeklyTarget = require("../Modals/WeeklyTarget");
const WeightLog = require("../Modals/WeightLog");
const BodyMeasurement = require("../Modals/BodyMeasurement");
const FitnessProfile = require("../Modals/FitnessProfile");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const {
  getLocalDateString,
  getISOWeekDetails,
  getPreviousWeekStart,
  isValidDateString,
  getPhotoCycleDetails,
} = require("../Utils/date");
const {
  evaluateTargetGuardrail,
  suggestWeeklyTarget,
  buildWeeklyProgress,
} = require("../Utils/weeklyTargets");

/**
 * Safely resolves optional Step 3 (ReminderSetting) & Step 5 (ProgressPhotoSet) state
 * if those modules have been registered, without breaking Step 2 standalone operation.
 */
const resolveAuxiliaryCheckInState = async ({
  userId,
  todayLocalDate,
  weekStart,
  weekEnd,
  photoCheckinsEnabled,
}) => {
  let scheduledMeasurementWeekday = 0; // default Sunday
  let photoAnchorDate = todayLocalDate;

  const reminderModelPath = path.resolve(__dirname, "../Modals/ReminderSetting.js");
  if (fs.existsSync(reminderModelPath)) {
    try {
      const ReminderSetting = require(reminderModelPath);
      const reminderSetting = await ReminderSetting.findOne({ userId }).lean();
      if (reminderSetting?.weeklyMeasurements?.weekday !== undefined) {
        scheduledMeasurementWeekday = reminderSetting.weeklyMeasurements.weekday;
      }
      if (reminderSetting?.biweeklyPhotos?.anchorDate) {
        photoAnchorDate = getLocalDateString(
          reminderSetting.biweeklyPhotos.anchorDate,
          reminderSetting.timezone || "Asia/Kolkata"
        );
      }
    } catch (_) {
      // Optional model not active yet
    }
  }

  let photoStatusSummary = {
    status: photoCheckinsEnabled ? "due" : "disabled",
    completedCount: 0,
    requiredCount: 3,
    dueDate: photoCheckinsEnabled ? photoAnchorDate : null,
  };

  if (photoCheckinsEnabled) {
    const photoSetPath = path.resolve(__dirname, "../Modals/ProgressPhotoSet.js");
    if (fs.existsSync(photoSetPath)) {
      try {
        const ProgressPhotoSet = require(photoSetPath);
        const targetDateForCycle = weekEnd < todayLocalDate ? weekEnd : todayLocalDate;
        const cyclePreview = getPhotoCycleDetails(photoAnchorDate, targetDateForCycle, 0);
        const setForCycle = await ProgressPhotoSet.findOne({
          userId,
          cycleNumber: cyclePreview.cycleNumber,
        }).lean();

        const completedCount = ["front_relaxed", "side_relaxed", "back_relaxed"].filter(
          (pose) => Boolean(setForCycle?.photos?.[pose]?.url)
        ).length;

        const cycleInfo = getPhotoCycleDetails(
          photoAnchorDate,
          targetDateForCycle,
          completedCount
        );
        photoStatusSummary = {
          status: cycleInfo.status,
          completedCount,
          requiredCount: 3,
          cycleNumber: cycleInfo.cycleNumber,
          dueDate: cycleInfo.dueDate,
        };
      } catch (_) {
        // Fallback smoothly
      }
    }
  }

  return { scheduledMeasurementWeekday, photoStatusSummary };
};

/**
 * Lazily and idempotently creates a WeeklyTarget from FitnessProfile.targetDefaults
 * ONLY when weeklyTargets feature flag is enabled and carry-over defaults are active.
 */
const ensureWeeklyTargetIfEnabled = async ({ userId, weekStart, profile }) => {
  let targetDoc = await WeeklyTarget.findOne({ userId, weekStart }).lean();
  const weeklyTargetsEnabled = Boolean(profile?.featureFlags?.weeklyTargets);

  if (targetDoc) return targetDoc;
  if (!weeklyTargetsEnabled) return null;

  const defaults = profile?.targetDefaults;
  if (!defaults || !defaults.enabled) return null;

  try {
    targetDoc = await WeeklyTarget.findOneAndUpdate(
      { userId, weekStart },
      {
        $setOnInsert: {
          userId,
          weekStart,
          weightChangeKgPerWeek:
            defaults.weightChangeKgPerWeek !== undefined ? defaults.weightChangeKgPerWeek : null,
          weighInsTarget: defaults.weighInsTarget || 5,
          waistChangeCm: defaults.waistChangeCm !== undefined ? defaults.waistChangeCm : null,
          note: defaults.note || "",
          source: "carried_over",
        },
      },
      { upsert: true, new: true, lean: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      targetDoc = await WeeklyTarget.findOne({ userId, weekStart }).lean();
    } else {
      throw err;
    }
  }

  return targetDoc;
};

// @desc Get weekly target + live computed progress for a week (defaults to current local week)
// @route GET /api/targets/weekly?week=YYYY-MM-DD
const getWeeklyTarget = asyncHandler(async (req, res) => {
  const userTimezone = req.user.timezone || "Asia/Kolkata";
  const todayLocalDate = getLocalDateString(new Date(), userTimezone);
  const { week } = req.query;

  const referenceDate = week && isValidDateString(week) ? week : todayLocalDate;
  if (week && !isValidDateString(week)) {
    return sendError(res, "Invalid week date parameter. Use YYYY-MM-DD.", 400);
  }

  const { weekStart, weekEnd } = getISOWeekDetails(referenceDate);
  const prevWeekStart = getPreviousWeekStart(weekStart, 1);
  const { weekEnd: prevWeekEnd } = getISOWeekDetails(prevWeekStart);

  const profile = await FitnessProfile.findOne({ userId: req.user._id }).lean();
  const weeklyTargetsEnabled = Boolean(profile?.featureFlags?.weeklyTargets);
  const photoCheckinsEnabled = Boolean(profile?.featureFlags?.photoCheckins);

  const [targetDoc, weightLogs, measurements, auxState] = await Promise.all([
    ensureWeeklyTargetIfEnabled({ userId: req.user._id, weekStart, profile }),
    WeightLog.find({
      userId: req.user._id,
      date: { $gte: prevWeekStart, $lte: weekEnd },
    })
      .sort({ date: 1 })
      .lean(),
    BodyMeasurement.find({
      userId: req.user._id,
      weekStart: { $lte: weekStart },
    })
      .sort({ weekStart: -1 })
      .limit(2)
      .lean(),
    resolveAuxiliaryCheckInState({
      userId: req.user._id,
      todayLocalDate,
      weekStart,
      weekEnd,
      photoCheckinsEnabled,
    }),
  ]);

  const thisWeekLogs = weightLogs.filter((l) => l.date >= weekStart && l.date <= weekEnd);
  const prevWeekLogs = weightLogs.filter((l) => l.date >= prevWeekStart && l.date <= prevWeekEnd);

  const thisWeekMeasurement = measurements.find((m) => m.weekStart === weekStart) || null;
  const prevMeasurement = measurements.find((m) => m.weekStart < weekStart) || null;

  const progress = buildWeeklyProgress({
    weekStart,
    weekEnd,
    todayLocalDate,
    targetDoc,
    thisWeekWeightLogs: thisWeekLogs,
    prevWeekWeightLogs: prevWeekLogs,
    thisWeekMeasurement,
    prevMeasurement,
    scheduledMeasurementWeekday: auxState.scheduledMeasurementWeekday,
    photoStatusSummary: auxState.photoStatusSummary,
  });

  const referenceWeight =
    progress.latestSingleWeight || profile?.currentWeight || 70;
  const guardrail = evaluateTargetGuardrail({
    weightChangeKgPerWeek: targetDoc?.weightChangeKgPerWeek ?? null,
    currentWeightKg: referenceWeight,
    fitnessGoal: profile?.fitnessGoal || "maintenance",
  });

  return sendSuccess(res, {
    enabled: weeklyTargetsEnabled,
    weekStart,
    weekEnd,
    todayLocalDate,
    target: targetDoc ? { ...targetDoc, measurementsDone: progress.measurementsDone } : null,
    targetDefaults: profile?.targetDefaults || {
      enabled: false,
      weightChangeKgPerWeek: null,
      weighInsTarget: 5,
      waistChangeCm: null,
      note: "",
    },
    progress,
    guardrail,
    featureFlags: profile?.featureFlags || {
      reminders: false,
      weeklyTargets: false,
      photoCheckins: false,
    },
    hideWeightNumbers: Boolean(profile?.hideWeightNumbers),
  });
});

// @desc Create or override weekly target for a given week (current week by default)
// @route PUT /api/targets/weekly
const upsertWeeklyTarget = asyncHandler(async (req, res) => {
  const userTimezone = req.user.timezone || "Asia/Kolkata";
  const todayLocalDate = getLocalDateString(new Date(), userTimezone);
  const {
    week,
    weightChangeKgPerWeek,
    weighInsTarget = 5,
    waistChangeCm = null,
    note = "",
    source = "manual",
    carryOver,
  } = req.body;

  const referenceDate = week && isValidDateString(week) ? week : todayLocalDate;
  const { weekStart, weekEnd } = getISOWeekDetails(referenceDate);

  let profile = await FitnessProfile.findOne({ userId: req.user._id });
  if (!profile) {
    profile = new FitnessProfile({ userId: req.user._id });
  }

  // Opt-in to weeklyTargets cleanly upon configuration
  const existingFlags = profile.featureFlags?.toObject
    ? profile.featureFlags.toObject()
    : profile.featureFlags || {};
  profile.featureFlags = {
    reminders: Boolean(existingFlags.reminders),
    weeklyTargets: true,
    photoCheckins: Boolean(existingFlags.photoCheckins),
  };
  profile.featureFlagsConfigured = true;

  if (typeof carryOver === "boolean") {
    if (carryOver) {
      profile.targetDefaults = {
        enabled: true,
        weightChangeKgPerWeek:
          weightChangeKgPerWeek !== undefined ? weightChangeKgPerWeek : null,
        weighInsTarget: weighInsTarget || 5,
        waistChangeCm: waistChangeCm !== undefined ? waistChangeCm : null,
        note: note || "",
      };
    } else {
      const existingDefaults = profile.targetDefaults?.toObject
        ? profile.targetDefaults.toObject()
        : profile.targetDefaults || {};
      profile.targetDefaults = {
        ...existingDefaults,
        enabled: false,
      };
    }
  }

  await profile.save();

  const targetDoc = await WeeklyTarget.findOneAndUpdate(
    { userId: req.user._id, weekStart },
    {
      $set: {
        weightChangeKgPerWeek:
          weightChangeKgPerWeek !== undefined ? weightChangeKgPerWeek : null,
        weighInsTarget: weighInsTarget || 5,
        waistChangeCm: waistChangeCm !== undefined ? waistChangeCm : null,
        note: note || "",
        source,
      },
    },
    { upsert: true, new: true, runValidators: true, lean: true }
  );

  // Return refreshed progress + guardrail
  const prevWeekStart = getPreviousWeekStart(weekStart, 1);
  const { weekEnd: prevWeekEnd } = getISOWeekDetails(prevWeekStart);

  const [weightLogs, measurements, auxState] = await Promise.all([
    WeightLog.find({
      userId: req.user._id,
      date: { $gte: prevWeekStart, $lte: weekEnd },
    })
      .sort({ date: 1 })
      .lean(),
    BodyMeasurement.find({
      userId: req.user._id,
      weekStart: { $lte: weekStart },
    })
      .sort({ weekStart: -1 })
      .limit(2)
      .lean(),
    resolveAuxiliaryCheckInState({
      userId: req.user._id,
      todayLocalDate,
      weekStart,
      weekEnd,
      photoCheckinsEnabled: Boolean(profile.featureFlags?.photoCheckins),
    }),
  ]);

  const thisWeekLogs = weightLogs.filter((l) => l.date >= weekStart && l.date <= weekEnd);
  const prevWeekLogs = weightLogs.filter((l) => l.date >= prevWeekStart && l.date <= prevWeekEnd);
  const thisWeekMeasurement = measurements.find((m) => m.weekStart === weekStart) || null;
  const prevMeasurement = measurements.find((m) => m.weekStart < weekStart) || null;

  const progress = buildWeeklyProgress({
    weekStart,
    weekEnd,
    todayLocalDate,
    targetDoc,
    thisWeekWeightLogs: thisWeekLogs,
    prevWeekWeightLogs: prevWeekLogs,
    thisWeekMeasurement,
    prevMeasurement,
    scheduledMeasurementWeekday: auxState.scheduledMeasurementWeekday,
    photoStatusSummary: auxState.photoStatusSummary,
  });

  const referenceWeight =
    progress.latestSingleWeight || profile.currentWeight || 70;
  const guardrail = evaluateTargetGuardrail({
    weightChangeKgPerWeek: targetDoc.weightChangeKgPerWeek,
    currentWeightKg: referenceWeight,
    fitnessGoal: profile.fitnessGoal,
  });

  return sendSuccess(
    res,
    {
      enabled: true,
      weekStart,
      weekEnd,
      target: { ...targetDoc, measurementsDone: progress.measurementsDone },
      targetDefaults: profile.targetDefaults,
      progress,
      guardrail,
      featureFlags: profile.featureFlags,
    },
    "Weekly target saved successfully"
  );
});

// @desc Set default weekly target that automatically carries over each Monday
// @route PUT /api/targets/defaults
const updateTargetDefaults = asyncHandler(async (req, res) => {
  const userTimezone = req.user.timezone || "Asia/Kolkata";
  const todayLocalDate = getLocalDateString(new Date(), userTimezone);
  const { weekStart } = getISOWeekDetails(todayLocalDate);

  const {
    enabled = true,
    weightChangeKgPerWeek,
    weighInsTarget = 5,
    waistChangeCm = null,
    note = "",
    applyToCurrentWeek = true,
  } = req.body;

  let profile = await FitnessProfile.findOne({ userId: req.user._id });
  if (!profile) {
    profile = new FitnessProfile({ userId: req.user._id });
  }

  const existingFlags = profile.featureFlags?.toObject
    ? profile.featureFlags.toObject()
    : profile.featureFlags || {};
  profile.featureFlags = {
    reminders: Boolean(existingFlags.reminders),
    weeklyTargets: true,
    photoCheckins: Boolean(existingFlags.photoCheckins),
  };
  profile.featureFlagsConfigured = true;

  profile.targetDefaults = {
    enabled: Boolean(enabled),
    weightChangeKgPerWeek:
      weightChangeKgPerWeek !== undefined ? weightChangeKgPerWeek : null,
    weighInsTarget: weighInsTarget || 5,
    waistChangeCm: waistChangeCm !== undefined ? waistChangeCm : null,
    note: note || "",
  };

  await profile.save();

  let currentWeekTarget = await WeeklyTarget.findOne({
    userId: req.user._id,
    weekStart,
  }).lean();

  if (enabled && applyToCurrentWeek) {
    if (!currentWeekTarget || currentWeekTarget.source === "carried_over") {
      currentWeekTarget = await WeeklyTarget.findOneAndUpdate(
        { userId: req.user._id, weekStart },
        {
          $set: {
            weightChangeKgPerWeek: profile.targetDefaults.weightChangeKgPerWeek,
            weighInsTarget: profile.targetDefaults.weighInsTarget,
            waistChangeCm: profile.targetDefaults.waistChangeCm,
            note: profile.targetDefaults.note,
            source: "carried_over",
          },
        },
        { upsert: true, new: true, runValidators: true, lean: true }
      );
    }
  }

  const guardrail = evaluateTargetGuardrail({
    weightChangeKgPerWeek: profile.targetDefaults.weightChangeKgPerWeek,
    currentWeightKg: profile.currentWeight || 70,
    fitnessGoal: profile.fitnessGoal,
  });

  return sendSuccess(
    res,
    {
      targetDefaults: profile.targetDefaults,
      currentWeekTarget,
      guardrail,
      featureFlags: profile.featureFlags,
    },
    "Default weekly target preferences saved"
  );
});

// @desc Get past N weeks of target vs actual weekly averages
// @route GET /api/targets/history?weeks=12
const getWeeklyHistory = asyncHandler(async (req, res) => {
  const weeksCount = Math.min(52, Math.max(1, parseInt(req.query.weeks, 10) || 12));
  const userTimezone = req.user.timezone || "Asia/Kolkata";
  const todayLocalDate = getLocalDateString(new Date(), userTimezone);
  const { weekStart: currentWeekStart } = getISOWeekDetails(todayLocalDate);

  // Earliest week needed is (weeksCount - 1) weeks ago, PLUS 1 extra prior week for week-over-week delta
  const firstWeekStart = getPreviousWeekStart(currentWeekStart, weeksCount - 1);
  const baselinePrevWeekStart = getPreviousWeekStart(firstWeekStart, 1);
  const { weekEnd: currentWeekEnd } = getISOWeekDetails(currentWeekStart);

  const [profile, targetDocs, weightLogs, measurementDocs] = await Promise.all([
    FitnessProfile.findOne({ userId: req.user._id }).lean(),
    WeeklyTarget.find({
      userId: req.user._id,
      weekStart: { $gte: firstWeekStart, $lte: currentWeekStart },
    }).lean(),
    WeightLog.find({
      userId: req.user._id,
      date: { $gte: baselinePrevWeekStart, $lte: currentWeekEnd },
    })
      .sort({ date: 1 })
      .lean(),
    BodyMeasurement.find({
      userId: req.user._id,
      weekStart: { $gte: baselinePrevWeekStart, $lte: currentWeekStart },
    })
      .sort({ weekStart: 1 })
      .lean(),
  ]);

  const targetByWeek = new Map(targetDocs.map((t) => [t.weekStart, t]));
  const measureByWeek = new Map(measurementDocs.map((m) => [m.weekStart, m]));

  // Bucket weight logs by ISO weekStart
  const weightByWeek = new Map();
  for (const log of weightLogs) {
    const { weekStart } = getISOWeekDetails(log.date);
    if (!weightByWeek.has(weekStart)) weightByWeek.set(weekStart, []);
    weightByWeek.get(weekStart).push(log);
  }

  const weeks = [];
  for (let i = weeksCount - 1; i >= 0; i--) {
    const wStart = getPreviousWeekStart(currentWeekStart, i);
    const { weekEnd: wEnd } = getISOWeekDetails(wStart);
    const prevStart = getPreviousWeekStart(wStart, 1);

    const targetDoc = targetByWeek.get(wStart) || null;
    const thisLogs = weightByWeek.get(wStart) || [];
    const prevLogs = weightByWeek.get(prevStart) || [];
    const thisMeasurement = measureByWeek.get(wStart) || null;
    const prevMeasurement = measureByWeek.get(prevStart) || null;

    const progress = buildWeeklyProgress({
      weekStart: wStart,
      weekEnd: wEnd,
      todayLocalDate,
      targetDoc,
      thisWeekWeightLogs: thisLogs,
      prevWeekWeightLogs: prevLogs,
      thisWeekMeasurement: thisMeasurement,
      prevMeasurement,
      scheduledMeasurementWeekday: 0,
      photoStatusSummary: { status: "disabled", completedCount: 0, requiredCount: 3 },
    });

    weeks.push({
      weekStart: wStart,
      weekEnd: wEnd,
      label: wStart.slice(5), // MM-DD
      isCurrentWeek: wStart === currentWeekStart,
      targetChangeKg: progress.targetChangeKg,
      actualChangeKg: progress.actualChangeKg,
      avgWeightKg: progress.thisWeekAvgWeight,
      prevWeekAvgKg: progress.prevWeekAvgWeight,
      weighInsLogged: progress.weighInsLogged,
      weighInsTarget: progress.weighInsTarget,
      status: progress.status,
      deltaFromTargetKg: progress.deltaFromTargetKg,
      measurementsDone: progress.measurementsDone,
      measurementsStatus: progress.measurementsStatus,
      waistActualChangeCm: progress.waistActualChangeCm,
      waistTargetCm: progress.waistTargetCm,
      source: targetDoc?.source || null,
      note: targetDoc?.note || "",
    });
  }

  const judgedWeeks = weeks.filter((w) => w.status !== "not_enough_data");
  const onTrackOrAheadCount = judgedWeeks.filter(
    (w) => w.status === "on_track" || w.status === "ahead"
  ).length;

  return sendSuccess(res, {
    enabled: Boolean(profile?.featureFlags?.weeklyTargets),
    hideWeightNumbers: Boolean(profile?.hideWeightNumbers),
    weeksCount,
    weeks,
    summary: {
      totalWeeks: weeks.length,
      weeksWithData: weeks.filter((w) => w.weighInsLogged > 0).length,
      judgedWeeksCount: judgedWeeks.length,
      onTrackOrAheadCount,
      measurementCheckInsCount: weeks.filter((w) => w.measurementsDone).length,
    },
  });
});

// @desc Return conservative direction-aware suggested pace when user taps "Suggest one"
// @route GET /api/targets/suggest
const getSuggestedWeeklyTarget = asyncHandler(async (req, res) => {
  const profile = await FitnessProfile.findOne({ userId: req.user._id }).lean();
  const latestWeight = await WeightLog.findOne({ userId: req.user._id })
    .sort({ date: -1 })
    .lean();

  const currentWeightKg = latestWeight?.weightKg || profile?.currentWeight || 70;
  const suggestion = suggestWeeklyTarget({
    fitnessGoal: profile?.fitnessGoal || "maintenance",
    currentWeightKg,
    targetWeightKg: profile?.targetWeight,
  });

  const guardrail = evaluateTargetGuardrail({
    weightChangeKgPerWeek: suggestion.weightChangeKgPerWeek,
    currentWeightKg,
    fitnessGoal: profile?.fitnessGoal || "maintenance",
  });

  return sendSuccess(res, { suggestion, guardrail });
});

module.exports = {
  getWeeklyTarget,
  upsertWeeklyTarget,
  updateTargetDefaults,
  getWeeklyHistory,
  getSuggestedWeeklyTarget,
};
