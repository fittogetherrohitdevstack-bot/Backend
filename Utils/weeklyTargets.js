const { addDaysToDateString, getDayOfWeek } = require("./date");

const TOLERANCE_KG = 0.15;
const MIN_WEIGHINS_FOR_STATUS = 3;
const MIN_PREV_WEIGHINS_FOR_STATUS = 2;

const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Computes mean weight across logged entries only.
 * Never treats missing days as 0; returns null when there are no logs.
 */
const computeAverageWeight = (logs = []) => {
  const valid = (logs || []).filter(
    (l) => l && typeof l.weightKg === "number" && Number.isFinite(l.weightKg) && l.weightKg >= 20
  );
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, item) => acc + item.weightKg, 0);
  return round2(sum / valid.length);
};

/**
 * Healthy informational guardrail (non-blocking, not medical advice).
 * Loss guideline: > ~1% of body weight per week is flagged as aggressive.
 * Gain guideline: > ~0.5 kg per week is flagged as aggressive.
 */
const evaluateTargetGuardrail = ({
  weightChangeKgPerWeek,
  currentWeightKg,
  fitnessGoal = "maintenance",
}) => {
  const refWeight =
    typeof currentWeightKg === "number" && currentWeightKg >= 20 ? currentWeightKg : 70;
  const comfortableMaxLossKg = round2(refWeight * 0.01);
  const comfortableMaxGainKg = 0.5;

  if (weightChangeKgPerWeek === null || weightChangeKgPerWeek === undefined) {
    return {
      isAggressive: false,
      level: "none",
      direction: fitnessGoal === "muscle_gain" ? "gain" : fitnessGoal === "fat_loss" ? "loss" : "maintain",
      comfortableMaxLossKg: -comfortableMaxLossKg,
      comfortableMaxGainKg,
      message: null,
    };
  }

  const rate = Number(weightChangeKgPerWeek);
  const direction = rate < 0 ? "loss" : rate > 0 ? "gain" : "maintain";

  if (rate < 0 && Math.abs(rate) > comfortableMaxLossKg + 0.001) {
    return {
      isAggressive: true,
      level: "caution",
      direction,
      comfortableMaxLossKg: -comfortableMaxLossKg,
      comfortableMaxGainKg,
      message: `A target faster than ~1% of body weight per week (~${comfortableMaxLossKg} kg/week) is aggressive and can be harder to sustain. Informational pace guidance only, not medical advice.`,
    };
  }

  if (rate > comfortableMaxGainKg + 0.001) {
    return {
      isAggressive: true,
      level: "caution",
      direction,
      comfortableMaxLossKg: -comfortableMaxLossKg,
      comfortableMaxGainKg,
      message: `Gaining more than ~${comfortableMaxGainKg} kg/week is faster than typical lean pacing. Consider a gentler pace if preferred. Informational guidance only, not medical advice.`,
    };
  }

  return {
    isAggressive: false,
    level: "sustainable",
    direction,
    comfortableMaxLossKg: -comfortableMaxLossKg,
    comfortableMaxGainKg,
    message: null,
  };
};

/**
 * Conservative, direction-aware weekly estimate offered ONLY when user explicitly taps "Suggest one".
 */
const suggestWeeklyTarget = ({ fitnessGoal = "maintenance", currentWeightKg = 70, targetWeightKg }) => {
  const refWeight =
    typeof currentWeightKg === "number" && currentWeightKg >= 20 ? currentWeightKg : 70;

  let weightChangeKgPerWeek = 0;

  if (
    fitnessGoal === "fat_loss" ||
    (fitnessGoal !== "muscle_gain" &&
      typeof targetWeightKg === "number" &&
      targetWeightKg < refWeight - 0.5)
  ) {
    // ~0.5% body weight per week, conservatively capped between -0.25 and -0.5 kg/week
    const halfPercent = round1(refWeight * 0.005);
    weightChangeKgPerWeek = -Math.min(0.5, Math.max(0.2, halfPercent));
  } else if (
    fitnessGoal === "muscle_gain" ||
    (typeof targetWeightKg === "number" && targetWeightKg > refWeight + 0.5)
  ) {
    // Conservative lean gain estimate
    weightChangeKgPerWeek = 0.25;
  } else {
    weightChangeKgPerWeek = 0;
  }

  return {
    weightChangeKgPerWeek,
    weighInsTarget: 5,
    source: "suggested",
    isEstimate: true,
    disclaimer:
      "Estimated conservative weekly pace based on your goal (not medical advice). Customize anytime.",
  };
};

/**
 * Direction-aware status comparison between weekly averages using +/- 0.15 kg tolerance.
 * Requires >= 3 weigh-ins this week and >= 2 weigh-ins previous week so noisy single days never judge progress.
 */
const evaluateWeeklyPaceStatus = ({
  targetChangeKg,
  actualChangeKg,
  thisWeekCount = 0,
  prevWeekCount = 0,
  toleranceKg = TOLERANCE_KG,
}) => {
  if (
    thisWeekCount < MIN_WEIGHINS_FOR_STATUS ||
    prevWeekCount < MIN_PREV_WEIGHINS_FOR_STATUS ||
    actualChangeKg === null ||
    actualChangeKg === undefined ||
    targetChangeKg === null ||
    targetChangeKg === undefined
  ) {
    let reason = "Log at least 3 weigh-ins this week to establish a reliable weekly average.";
    if (targetChangeKg === null || targetChangeKg === undefined) {
      reason = "Set a weekly pace target to track progress against your goal.";
    } else if (thisWeekCount >= MIN_WEIGHINS_FOR_STATUS && prevWeekCount < MIN_PREV_WEIGHINS_FOR_STATUS) {
      reason = "Building baseline from last week — keep logging steadily to see your week-to-week pace.";
    }
    return {
      status: "not_enough_data",
      deltaFromTargetKg: null,
      encouragingMessage: reason,
    };
  }

  const diff = round2(actualChangeKg - targetChangeKg);
  const absDiff = Math.abs(diff);

  if (targetChangeKg < 0) {
    // Fat loss / downward target: more negative = ahead
    if (absDiff <= toleranceKg) {
      return {
        status: "on_track",
        deltaFromTargetKg: diff,
        encouragingMessage: "Right in your target zone based on weekly averages.",
      };
    }
    if (actualChangeKg < targetChangeKg - toleranceKg) {
      return {
        status: "ahead",
        deltaFromTargetKg: diff,
        encouragingMessage:
          "Moving faster than your weekly target — remember steady, nourished pacing lasts longest.",
      };
    }
    return {
      status: "behind",
      deltaFromTargetKg: diff,
      encouragingMessage:
        "Slightly steadier than planned this week. Focus on daily habits — water and sodium shift day-to-day weight.",
    };
  }

  if (targetChangeKg > 0) {
    // Lean gain / upward target: more positive = ahead
    if (absDiff <= toleranceKg) {
      return {
        status: "on_track",
        deltaFromTargetKg: diff,
        encouragingMessage: "Steady upward trend right alongside your target.",
      };
    }
    if (actualChangeKg > targetChangeKg + toleranceKg) {
      return {
        status: "ahead",
        deltaFromTargetKg: diff,
        encouragingMessage:
          "Slightly ahead of your weekly gain target — keep training quality and protein consistent.",
      };
    }
    return {
      status: "behind",
      deltaFromTargetKg: diff,
      encouragingMessage:
        "Pace is slightly gentler than planned this week. Staying consistent with meals helps steady progress.",
    };
  }

  // Maintenance target (0 kg/week)
  if (absDiff <= toleranceKg) {
    return {
      status: "on_track",
      deltaFromTargetKg: diff,
      encouragingMessage: "Weekly average is holding steady right around maintenance.",
    };
  }

  return {
    status: "behind",
    deltaFromTargetKg: diff,
    encouragingMessage:
      "Weekly average shifted slightly outside ±0.15 kg of maintenance. Keep tracking calmly across the week.",
  };
};

/**
 * Evaluates weekly tape check-in status (done / due / overdue / upcoming).
 * Weeks are Monday..Sunday; scheduledWeekday follows JS Date getDay (0=Sun..6=Sat).
 */
const evaluateMeasurementCheckInStatus = ({
  measurementDocForWeek,
  weekStart,
  weekEnd,
  todayLocalDate,
  scheduledWeekday = 0, // default Sunday
}) => {
  if (measurementDocForWeek) {
    return {
      status: "done",
      measurementsDone: true,
      dueDate: weekStart ? addDaysToDateString(weekStart, (scheduledWeekday + 6) % 7) : null,
    };
  }

  // Convert JS weekday (0=Sun..6=Sat) to offset from Monday (0=Mon..6=Sun)
  const mondayOffset = (scheduledWeekday + 6) % 7;
  const dueDate = addDaysToDateString(weekStart, mondayOffset);

  if (weekEnd < todayLocalDate) {
    return { status: "overdue", measurementsDone: false, dueDate };
  }
  if (weekStart > todayLocalDate) {
    return { status: "upcoming", measurementsDone: false, dueDate };
  }
  if (todayLocalDate > dueDate) {
    return { status: "overdue", measurementsDone: false, dueDate };
  }
  return { status: "due", measurementsDone: false, dueDate };
};

/**
 * Builds complete weekly progress summary for a single ISO week (Monday-Sunday).
 */
const buildWeeklyProgress = ({
  weekStart,
  weekEnd,
  todayLocalDate,
  targetDoc = null,
  thisWeekWeightLogs = [],
  prevWeekWeightLogs = [],
  thisWeekMeasurement = null,
  prevMeasurement = null,
  scheduledMeasurementWeekday = 0,
  photoStatusSummary = { status: "disabled", completedCount: 0, requiredCount: 3, dueDate: null },
  toleranceKg = TOLERANCE_KG,
}) => {
  const thisWeekAvgWeight = computeAverageWeight(thisWeekWeightLogs);
  const prevWeekAvgWeight = computeAverageWeight(prevWeekWeightLogs);
  const actualChangeKg =
    thisWeekAvgWeight !== null && prevWeekAvgWeight !== null
      ? round2(thisWeekAvgWeight - prevWeekAvgWeight)
      : null;

  const sortedThisWeek = [...(thisWeekWeightLogs || [])].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const latestEntry =
    sortedThisWeek.length > 0 ? sortedThisWeek[sortedThisWeek.length - 1] : null;
  const todayEntry = sortedThisWeek.find((l) => l.date === todayLocalDate) || null;

  const weighInsTarget = targetDoc?.weighInsTarget || 5;
  const targetChangeKg =
    targetDoc?.weightChangeKgPerWeek !== undefined ? targetDoc.weightChangeKgPerWeek : null;

  const pace = evaluateWeeklyPaceStatus({
    targetChangeKg,
    actualChangeKg,
    thisWeekCount: sortedThisWeek.length,
    prevWeekCount: (prevWeekWeightLogs || []).length,
    toleranceKg,
  });

  const measurementCheckIn = evaluateMeasurementCheckInStatus({
    measurementDocForWeek: thisWeekMeasurement,
    weekStart,
    weekEnd,
    todayLocalDate,
    scheduledWeekday: scheduledMeasurementWeekday,
  });

  const currentWaistCm = thisWeekMeasurement?.measurementsCm?.waist ?? null;
  const prevWaistCm = prevMeasurement?.measurementsCm?.waist ?? null;
  const waistActualChangeCm =
    currentWaistCm !== null && prevWaistCm !== null
      ? round1(currentWaistCm - prevWaistCm)
      : null;

  return {
    weekStart,
    weekEnd,
    thisWeekAvgWeight,
    prevWeekAvgWeight,
    actualChangeKg,
    targetChangeKg,
    latestSingleWeight: latestEntry ? latestEntry.weightKg : null,
    latestSingleDate: latestEntry ? latestEntry.date : null,
    todayLogged: Boolean(todayEntry),
    todayWeightKg: todayEntry ? todayEntry.weightKg : null,
    weighInsLogged: sortedThisWeek.length,
    weighInsTarget,
    weighInConsistencyPercent: Math.min(
      100,
      Math.round((sortedThisWeek.length / Math.max(1, weighInsTarget)) * 100)
    ),
    loggedDates: sortedThisWeek.map((l) => l.date),
    status: pace.status,
    deltaFromTargetKg: pace.deltaFromTargetKg,
    encouragingMessage: pace.encouragingMessage,
    measurementsDone: measurementCheckIn.measurementsDone,
    measurementsStatus: measurementCheckIn.status,
    measurementDueDate: measurementCheckIn.dueDate,
    currentWaistCm,
    waistActualChangeCm,
    waistTargetCm: targetDoc?.waistChangeCm ?? null,
    photoStatus: photoStatusSummary.status,
    photoCompletedCount: photoStatusSummary.completedCount ?? 0,
    photoRequiredCount: photoStatusSummary.requiredCount ?? 3,
    photoDueDate: photoStatusSummary.dueDate || null,
  };
};

module.exports = {
  TOLERANCE_KG,
  MIN_WEIGHINS_FOR_STATUS,
  MIN_PREV_WEIGHINS_FOR_STATUS,
  computeAverageWeight,
  evaluateTargetGuardrail,
  suggestWeeklyTarget,
  evaluateWeeklyPaceStatus,
  evaluateMeasurementCheckInStatus,
  buildWeeklyProgress,
};
