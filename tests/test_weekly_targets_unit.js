const assert = require("assert");
const {
  getLocalDateString,
  getISOWeekDetails,
  getLocalClockDetails,
  isTimeInQuietHours,
  getPhotoCycleDetails,
  getPreviousWeekStart,
  addDaysToDateString,
} = require("../Utils/date");
const {
  computeAverageWeight,
  evaluateTargetGuardrail,
  suggestWeeklyTarget,
  evaluateWeeklyPaceStatus,
  evaluateMeasurementCheckInStatus,
  buildWeeklyProgress,
} = require("../Utils/weeklyTargets");

const runTests = () => {
  console.log("🧪 Running Weekly Targets, Timezone & Guardrail Unit Tests...\n");

  // 1. Timezone & Week-boundary edge cases (12:30 AM IST Monday rollover)
  // Sunday 2026-11-08 19:00 UTC = Monday 2026-11-09 00:30 AM Asia/Kolkata
  const mondayMidnightIst = new Date("2026-11-08T19:00:00Z");
  const clockIst = getLocalClockDetails(mondayMidnightIst, "Asia/Kolkata");
  assert.strictEqual(clockIst.dateString, "2026-11-09");
  assert.strictEqual(clockIst.hhmm, "00:30");
  assert.strictEqual(clockIst.weekday, 1); // Monday
  const weekFromIst = getISOWeekDetails(clockIst.dateString);
  assert.strictEqual(weekFromIst.weekStart, "2026-11-09");
  assert.strictEqual(weekFromIst.weekEnd, "2026-11-15");
  assert.strictEqual(getPreviousWeekStart("2026-11-09", 1), "2026-11-02");
  console.log("  ✓ 12:30 AM IST Monday rollover & Monday-Sunday ISO boundaries: PASSED");

  // Generic timezone check (America/New_York during winter UTC-5)
  const nyEvening = new Date("2026-11-09T04:30:00Z"); // Nov 8 23:30 EST (Sunday)
  const clockNy = getLocalClockDetails(nyEvening, "America/New_York");
  assert.strictEqual(clockNy.dateString, "2026-11-08");
  assert.strictEqual(clockNy.hhmm, "23:30");
  assert.strictEqual(clockNy.weekday, 0);
  const nyWeek = getISOWeekDetails(clockNy.dateString);
  assert.strictEqual(nyWeek.weekStart, "2026-11-02");
  console.log("  ✓ Generic timezone boundary handling (America/New_York): PASSED");

  // 2. Quiet-hours overnight & same-day checks
  const overnightQuiet = { enabled: true, from: "22:00", to: "06:00" };
  assert.strictEqual(isTimeInQuietHours("23:15", overnightQuiet), true);
  assert.strictEqual(isTimeInQuietHours("00:30", overnightQuiet), true);
  assert.strictEqual(isTimeInQuietHours("06:00", overnightQuiet), false);
  assert.strictEqual(isTimeInQuietHours("14:00", overnightQuiet), false);
  const sameDayQuiet = { enabled: true, from: "13:00", to: "15:00" };
  assert.strictEqual(isTimeInQuietHours("13:45", sameDayQuiet), true);
  assert.strictEqual(isTimeInQuietHours("16:00", sameDayQuiet), false);
  assert.strictEqual(isTimeInQuietHours("23:15", { enabled: false, from: "22:00", to: "06:00" }), false);
  console.log("  ✓ Quiet-hours overnight & same-day logic: PASSED");

  // 3. Cycle & due-date calculations (14-day bi-weekly cadence + 3-day window)
  const anchor = "2026-11-01";
  const c1Due = getPhotoCycleDetails(anchor, "2026-11-01", 0);
  assert.strictEqual(c1Due.cycleNumber, 1);
  assert.strictEqual(c1Due.dueDate, "2026-11-01");
  assert.strictEqual(c1Due.nextDueDate, "2026-11-15");
  assert.strictEqual(c1Due.status, "due");

  const c1WithinGrace = getPhotoCycleDetails(anchor, "2026-11-04", 1); // partial 1/3 within 3 days
  assert.strictEqual(c1WithinGrace.cycleNumber, 1);
  assert.strictEqual(c1WithinGrace.status, "due");

  const c1Overdue = getPhotoCycleDetails(anchor, "2026-11-05", 2); // day +4 without 3/3
  assert.strictEqual(c1Overdue.status, "overdue");

  const c1Done = getPhotoCycleDetails(anchor, "2026-11-06", 3);
  assert.strictEqual(c1Done.status, "completed");

  const c2Due = getPhotoCycleDetails(anchor, "2026-11-15", 0);
  assert.strictEqual(c2Due.cycleNumber, 2);
  assert.strictEqual(c2Due.dueDate, "2026-11-15");
  assert.strictEqual(c2Due.status, "due");
  console.log("  ✓ Bi-weekly photo cycle due-date & grace-window math: PASSED");

  // 4. Weekly average weight (logged days only, missing days never 0)
  assert.strictEqual(computeAverageWeight([]), null);
  assert.strictEqual(
    computeAverageWeight([{ weightKg: 70.2 }, { weightKg: 70.6 }, { weightKg: 70.1 }]),
    70.3
  );
  console.log("  ✓ Weekly average weight ignores missing days & never treats empty as 0: PASSED");

  // 5. Status comparison with +/- 0.15 kg band and >= 3 weigh-ins rule
  const notEnough = evaluateWeeklyPaceStatus({
    targetChangeKg: -0.5,
    actualChangeKg: -0.5,
    thisWeekCount: 2,
    prevWeekCount: 5,
  });
  assert.strictEqual(notEnough.status, "not_enough_data");

  const singlePrevDay = evaluateWeeklyPaceStatus({
    targetChangeKg: -0.5,
    actualChangeKg: -0.5,
    thisWeekCount: 4,
    prevWeekCount: 1,
  });
  assert.strictEqual(singlePrevDay.status, "not_enough_data");

  // Fat loss (-0.5 kg/wk)
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: -0.5, actualChangeKg: -0.4, thisWeekCount: 4, prevWeekCount: 4 }).status,
    "on_track"
  );
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: -0.5, actualChangeKg: -0.65, thisWeekCount: 4, prevWeekCount: 4 }).status,
    "on_track"
  );
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: -0.5, actualChangeKg: -0.8, thisWeekCount: 4, prevWeekCount: 4 }).status,
    "ahead"
  );
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: -0.5, actualChangeKg: -0.2, thisWeekCount: 4, prevWeekCount: 4 }).status,
    "behind"
  );

  // Muscle gain (+0.3 kg/wk)
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: 0.3, actualChangeKg: 0.2, thisWeekCount: 5, prevWeekCount: 5 }).status,
    "on_track"
  );
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: 0.3, actualChangeKg: 0.6, thisWeekCount: 5, prevWeekCount: 5 }).status,
    "ahead"
  );
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: 0.3, actualChangeKg: 0.0, thisWeekCount: 5, prevWeekCount: 5 }).status,
    "behind"
  );

  // Maintenance (0 kg/wk)
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: 0, actualChangeKg: 0.1, thisWeekCount: 3, prevWeekCount: 3 }).status,
    "on_track"
  );
  assert.strictEqual(
    evaluateWeeklyPaceStatus({ targetChangeKg: 0, actualChangeKg: 0.4, thisWeekCount: 3, prevWeekCount: 3 }).status,
    "behind"
  );
  console.log("  ✓ Direction-aware weekly status & tolerance band (±0.15 kg): PASSED");

  // 6. Guardrail thresholds & conservative suggestions
  const gLossOk = evaluateTargetGuardrail({ weightChangeKgPerWeek: -0.7, currentWeightKg: 70 });
  assert.strictEqual(gLossOk.isAggressive, false);

  const gLossHigh = evaluateTargetGuardrail({ weightChangeKgPerWeek: -0.8, currentWeightKg: 70 });
  assert.strictEqual(gLossHigh.isAggressive, true);
  assert.ok(gLossHigh.message.includes("not medical advice"));

  const gGainOk = evaluateTargetGuardrail({ weightChangeKgPerWeek: 0.5, currentWeightKg: 70 });
  assert.strictEqual(gGainOk.isAggressive, false);

  const gGainHigh = evaluateTargetGuardrail({ weightChangeKgPerWeek: 0.6, currentWeightKg: 70 });
  assert.strictEqual(gGainHigh.isAggressive, true);

  const sFatLoss = suggestWeeklyTarget({ fitnessGoal: "fat_loss", currentWeightKg: 80, targetWeightKg: 72 });
  assert.ok(sFatLoss.weightChangeKgPerWeek < 0 && sFatLoss.weightChangeKgPerWeek >= -0.5);
  assert.strictEqual(sFatLoss.isEstimate, true);
  assert.strictEqual(
    evaluateTargetGuardrail({ weightChangeKgPerWeek: sFatLoss.weightChangeKgPerWeek, currentWeightKg: 80 }).isAggressive,
    false
  );
  console.log("  ✓ Healthy guardrail thresholds & conservative estimates: PASSED");

  // 7. Measurement check-in & full buildWeeklyProgress integration check
  const mDone = evaluateMeasurementCheckInStatus({
    measurementDocForWeek: { weekStart: "2026-11-09" },
    weekStart: "2026-11-09",
    weekEnd: "2026-11-15",
    todayLocalDate: "2026-11-11",
    scheduledWeekday: 0,
  });
  assert.strictEqual(mDone.status, "done");

  const mDue = evaluateMeasurementCheckInStatus({
    measurementDocForWeek: null,
    weekStart: "2026-11-09",
    weekEnd: "2026-11-15",
    todayLocalDate: "2026-11-11",
    scheduledWeekday: 0,
  });
  assert.strictEqual(mDue.status, "due");

  const mOverdue = evaluateMeasurementCheckInStatus({
    measurementDocForWeek: null,
    weekStart: "2026-11-09",
    weekEnd: "2026-11-15",
    todayLocalDate: "2026-11-16",
    scheduledWeekday: 0,
  });
  assert.strictEqual(mOverdue.status, "overdue");

  const progress = buildWeeklyProgress({
    weekStart: "2026-11-09",
    weekEnd: "2026-11-15",
    todayLocalDate: "2026-11-12",
    targetDoc: { weightChangeKgPerWeek: -0.5, weighInsTarget: 5, waistChangeCm: -0.5 },
    thisWeekWeightLogs: [
      { date: "2026-11-09", weightKg: 74.6 },
      { date: "2026-11-10", weightKg: 74.4 },
      { date: "2026-11-11", weightKg: 74.3 },
      { date: "2026-11-12", weightKg: 74.5 },
    ],
    prevWeekWeightLogs: [
      { date: "2026-11-02", weightKg: 75.0 },
      { date: "2026-11-04", weightKg: 74.8 },
      { date: "2026-11-06", weightKg: 74.9 },
    ],
    thisWeekMeasurement: { weekStart: "2026-11-09", measurementsCm: { waist: 81.5 } },
    prevMeasurement: { weekStart: "2026-11-02", measurementsCm: { waist: 82.0 } },
    photoStatusSummary: { status: "due", completedCount: 1, requiredCount: 3, dueDate: "2026-11-15" },
  });
  assert.strictEqual(progress.thisWeekAvgWeight, 74.45);
  assert.strictEqual(progress.prevWeekAvgWeight, 74.9);
  assert.strictEqual(progress.actualChangeKg, -0.45);
  assert.strictEqual(progress.status, "on_track");
  assert.strictEqual(progress.weighInsLogged, 4);
  assert.strictEqual(progress.measurementsDone, true);
  assert.strictEqual(progress.waistActualChangeCm, -0.5);
  assert.strictEqual(progress.photoCompletedCount, 1);
  assert.strictEqual(addDaysToDateString("2026-11-09", 6), "2026-11-15");
  console.log("  ✓ Measurement status & buildWeeklyProgress aggregation: PASSED\n");

  console.log("🎉 ALL STEP 1 & 2 UNIT TESTS PASSED (100% green)!");
};

runTests();
