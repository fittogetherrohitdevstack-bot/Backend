const WeightLog = require("../Modals/WeightLog");
const FitnessProfile = require("../Modals/FitnessProfile");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { POINTS_RULES } = require("../Utils/gamification");
const { awardConsistencyPoints } = require("../Utils/consistencyPoints");
const {
  getLocalDateString,
  getISOWeekDetails,
  getCalendarMonth,
  getDaysDiff,
} = require("../Utils/date");

// @desc Upsert weight for a specific date
// @route PUT /api/progress/weight
const upsertWeight = asyncHandler(async (req, res) => {
  const { date, weightKg, note = "", timeOfDay = "morning" } = req.body;
  const userTimezone = req.user.timezone || "Asia/Kolkata";
  const entryDate = date || getLocalDateString(new Date(), userTimezone);

  const numWeight = Number(weightKg);
  if (isNaN(numWeight) || numWeight < 20 || numWeight > 400) {
    return sendError(
      res,
      "Weight must be a valid number between 20 kg and 400 kg (44 - 880 lbs)",
      400
    );
  }

  const validTimeOfDay = ["morning", "evening", "other"].includes(timeOfDay)
    ? timeOfDay
    : "morning";

  const weightLog = await WeightLog.findOneAndUpdate(
    { userId: req.user._id, date: entryDate },
    {
      $set: {
        weightKg: Math.round(numWeight * 10) / 10,
        note: note ? String(note).slice(0, 500) : "",
        timeOfDay: validTimeOfDay,
      },
    },
    { returnDocument: "after", upsert: true, runValidators: true }
  );

  // Check if this is the user's latest logged date
  const latestLog = await WeightLog.findOne({ userId: req.user._id }).sort({ date: -1 });
  if (latestLog && latestLog.date <= entryDate) {
    await FitnessProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { currentWeight: weightLog.weightKg } }
    );
  }

  await awardConsistencyPoints({
    userId: req.user._id,
    date: entryDate,
    periodKey: entryDate,
    type: "weigh_in",
    points: POINTS_RULES.WEIGH_IN_LOGGED,
    meta: { logged: true },
  });

  return sendSuccess(res, { weightLog }, "Weight logged successfully");
});

// @desc Get daily weight logs within an optional date range
// @route GET /api/progress/weight
const getWeightLogs = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const query = { userId: req.user._id };

  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const logs = await WeightLog.find(query).sort({ date: -1 });
  return sendSuccess(res, { logs });
});

// @desc Delete a weight entry
// @route DELETE /api/progress/weight/:id
const deleteWeightLog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await WeightLog.findOneAndDelete({
    _id: id,
    userId: req.user._id,
  });

  if (!deleted) {
    return sendError(res, "Weight entry not found or unauthorized", 404);
  }

  // If deleted entry was current weight, update profile to the new latest entry
  const latestLog = await WeightLog.findOne({ userId: req.user._id }).sort({ date: -1 });
  if (latestLog) {
    await FitnessProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { currentWeight: latestLog.weightKg } }
    );
  }

  return sendSuccess(res, { deletedId: id }, "Weight entry deleted");
});

// @desc Get weight analytics and averages (Daily, Weekly, Monthly, 7d Moving Avg)
// @route GET /api/progress/weight/summary
const getWeightSummary = asyncHandler(async (req, res) => {
  const { range = "30d" } = req.query;
  const userTimezone = req.user.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), userTimezone);

  // Determine date boundary
  let fromStr = null;
  const now = new Date();
  if (range === "7d") {
    fromStr = getLocalDateString(new Date(now.getTime() - 6 * 86400000), userTimezone);
  } else if (range === "30d") {
    fromStr = getLocalDateString(new Date(now.getTime() - 29 * 86400000), userTimezone);
  } else if (range === "90d") {
    fromStr = getLocalDateString(new Date(now.getTime() - 89 * 86400000), userTimezone);
  }

  // Fetch all user logs sorted chronologically to correctly compute moving averages and diffs
  const allLogs = await WeightLog.find({ userId: req.user._id }).sort({ date: 1 });
  const profile = await FitnessProfile.findOne({ userId: req.user._id });

  if (allLogs.length === 0) {
    return sendSuccess(res, {
      range,
      todayLogged: false,
      todayEntry: null,
      currentWeight: profile?.currentWeight || null,
      targetWeight: profile?.targetWeight || null,
      stats: {
        current: profile?.currentWeight || null,
        starting: null,
        lowest: null,
        highest: null,
        totalChange: 0,
        changeThisWeek: 0,
        changeThisMonth: 0,
        movingAvg7d: null,
        remainingToTarget: null,
        progressPercent: 0,
        weeklyRate: 0,
        consistencyPercent: 0,
        currentStreak: 0,
      },
      daily: [],
      chartData: [],
      weekly: [],
      monthly: [],
      heatStrip30Days: [],
    });
  }

  // Map each log with 7-day moving average and delta vs previous entry
  const enrichedAll = allLogs.map((entry, idx) => {
    const prev = idx > 0 ? allLogs[idx - 1] : null;
    const changeVsPrevious = prev ? +(entry.weightKg - prev.weightKg).toFixed(2) : 0;

    // 7-day moving average: all logs between (entry.date - 6 days) and entry.date
    const entryDateObj = new Date(entry.date + "T00:00:00Z");
    const windowStartObj = new Date(entryDateObj.getTime() - 6 * 86400000);
    const windowStartStr = windowStartObj.toISOString().split("T")[0];

    const windowEntries = allLogs.filter(
      (l) => l.date >= windowStartStr && l.date <= entry.date
    );
    const sum = windowEntries.reduce((acc, l) => acc + l.weightKg, 0);
    const movingAverage7d =
      windowEntries.length > 0
        ? +(sum / windowEntries.length).toFixed(2)
        : entry.weightKg;

    return {
      _id: entry._id,
      date: entry.date,
      weightKg: entry.weightKg,
      timeOfDay: entry.timeOfDay,
      note: entry.note || "",
      changeVsPrevious,
      movingAverage7d,
    };
  });

  // Filter for the requested range
  const inRangeLogs = fromStr
    ? enrichedAll.filter((l) => l.date >= fromStr && l.date <= todayStr)
    : enrichedAll;

  // Today entry if exists
  const todayEntry = enrichedAll.find((l) => l.date === todayStr) || null;

  // 1. Weekly Averages
  const weeklyMap = new Map();
  for (const item of inRangeLogs) {
    const { weekStart, weekEnd } = getISOWeekDetails(item.date);
    if (!weeklyMap.has(weekStart)) {
      weeklyMap.set(weekStart, {
        weekStart,
        weekEnd,
        weights: [],
        dates: [],
      });
    }
    weeklyMap.get(weekStart).weights.push(item.weightKg);
    weeklyMap.get(weekStart).dates.push(item.date);
  }

  const weeklyArray = Array.from(weeklyMap.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w, idx, arr) => {
      const sum = w.weights.reduce((a, b) => a + b, 0);
      const avg = +(sum / w.weights.length).toFixed(2);
      const prevAvg =
        idx > 0
          ? +(
              arr[idx - 1].weights.reduce((a, b) => a + b, 0) /
              arr[idx - 1].weights.length
            ).toFixed(2)
          : null;
      const changeVsPreviousWeek =
        prevAvg !== null ? +(avg - prevAvg).toFixed(2) : 0;

      return {
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        avgWeightKg: avg,
        entriesCount: w.weights.length,
        minWeightKg: Math.min(...w.weights),
        maxWeightKg: Math.max(...w.weights),
        changeVsPreviousWeek,
      };
    });

  // 2. Monthly Averages
  const monthlyMap = new Map();
  for (const item of inRangeLogs) {
    const monthKey = getCalendarMonth(item.date);
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        month: monthKey,
        weights: [],
      });
    }
    monthlyMap.get(monthKey).weights.push(item.weightKg);
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const monthlyArray = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m, idx, arr) => {
      const sum = m.weights.reduce((a, b) => a + b, 0);
      const avg = +(sum / m.weights.length).toFixed(2);
      const prevAvg =
        idx > 0
          ? +(
              arr[idx - 1].weights.reduce((a, b) => a + b, 0) /
              arr[idx - 1].weights.length
            ).toFixed(2)
          : null;
      const changeVsPreviousMonth =
        prevAvg !== null ? +(avg - prevAvg).toFixed(2) : 0;

      const [yearStr, monthNum] = m.month.split("-");
      const label = `${monthNames[parseInt(monthNum, 10) - 1]} ${yearStr}`;

      return {
        month: m.month,
        label,
        avgWeightKg: avg,
        minWeightKg: Math.min(...m.weights),
        maxWeightKg: Math.max(...m.weights),
        entriesCount: m.weights.length,
        changeVsPreviousMonth,
      };
    });

  // 3. Stats & Targets Calculations
  const latestItem = enrichedAll[enrichedAll.length - 1];
  const startingItem = enrichedAll[0];
  const currentWeight = latestItem.weightKg;
  const startingWeight = startingItem.weightKg;

  const weightsInRange = inRangeLogs.map((l) => l.weightKg);
  const lowest = weightsInRange.length > 0 ? Math.min(...weightsInRange) : currentWeight;
  const highest = weightsInRange.length > 0 ? Math.max(...weightsInRange) : currentWeight;
  const totalChange = +(currentWeight - startingWeight).toFixed(2);

  // Change this week & month
  const latestWeek = weeklyArray[weeklyArray.length - 1];
  const changeThisWeek = latestWeek ? latestWeek.changeVsPreviousWeek : 0;

  const latestMonth = monthlyArray[monthlyArray.length - 1];
  const changeThisMonth = latestMonth ? latestMonth.changeVsPreviousMonth : 0;

  // Progress to Target
  const targetWeight = profile?.targetWeight || null;
  let remainingToTarget = null;
  let progressPercent = 0;
  let targetDirection = "maintenance";

  if (targetWeight) {
    if (targetWeight < startingWeight) {
      targetDirection = "loss";
      const totalToLose = startingWeight - targetWeight;
      const lostSoFar = startingWeight - currentWeight;
      remainingToTarget = +(currentWeight - targetWeight).toFixed(2);
      progressPercent =
        totalToLose > 0
          ? Math.min(100, Math.max(0, Math.round((lostSoFar / totalToLose) * 100)))
          : 100;
    } else if (targetWeight > startingWeight) {
      targetDirection = "gain";
      const totalToGain = targetWeight - startingWeight;
      const gainedSoFar = currentWeight - startingWeight;
      remainingToTarget = +(targetWeight - currentWeight).toFixed(2);
      progressPercent =
        totalToGain > 0
          ? Math.min(100, Math.max(0, Math.round((gainedSoFar / totalToGain) * 100)))
          : 100;
    } else {
      targetDirection = "maintenance";
      remainingToTarget = +(Math.abs(currentWeight - targetWeight)).toFixed(2);
      progressPercent = remainingToTarget <= 0.5 ? 100 : 80;
    }
  }

  // Average weekly rate of change
  let weeklyRate = 0;
  if (inRangeLogs.length >= 2) {
    const firstDate = new Date(inRangeLogs[0].date);
    const lastDate = new Date(inRangeLogs[inRangeLogs.length - 1].date);
    const daysSpan = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
    const rangeWeightDiff =
      inRangeLogs[inRangeLogs.length - 1].weightKg - inRangeLogs[0].weightKg;
    weeklyRate = +((rangeWeightDiff / daysSpan) * 7).toFixed(2);
  }

  // Consistency & Streak
  const totalDaysInRange = fromStr
    ? getDaysDiff(fromStr, todayStr) + 1
    : getDaysDiff(allLogs[0].date, todayStr) + 1;
  const daysLogged = inRangeLogs.length;
  const consistencyPercent = Math.min(
    100,
    Math.round((daysLogged / Math.max(1, totalDaysInRange)) * 100)
  );

  // Calculate current weigh-in streak
  let currentStreak = 0;
  let checkDate = new Date(todayStr + "T00:00:00Z");
  // Check if today is logged, else start check from yesterday
  const hasToday = allLogs.some((l) => l.date === todayStr);
  if (!hasToday) {
    checkDate = new Date(checkDate.getTime() - 86400000);
  }

  while (true) {
    const dStr = checkDate.toISOString().split("T")[0];
    const exists = allLogs.some((l) => l.date === dStr);
    if (exists) {
      currentStreak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    } else {
      break;
    }
  }

  // 4. Calendar Heat-Strip for last 30 days
  const heatStrip30Days = [];
  const logDateMap = new Map(allLogs.map((l) => [l.date, l.weightKg]));
  for (let i = 29; i >= 0; i--) {
    const dObj = new Date(now.getTime() - i * 86400000);
    const dStr = getLocalDateString(dObj, userTimezone);
    const isLogged = logDateMap.has(dStr);
    heatStrip30Days.push({
      date: dStr,
      dayOfMonth: parseInt(dStr.slice(8), 10),
      isLogged,
      weightKg: isLogged ? logDateMap.get(dStr) : null,
      isToday: dStr === todayStr,
    });
  }

  return sendSuccess(res, {
    range,
    todayLogged: !!todayEntry,
    todayEntry,
    targetWeight,
    stats: {
      current: currentWeight,
      starting: startingWeight,
      lowest,
      highest,
      totalChange,
      changeThisWeek,
      changeThisMonth,
      movingAvg7d: latestItem.movingAverage7d,
      remainingToTarget,
      progressPercent,
      targetDirection,
      weeklyRate,
      consistencyPercent,
      currentStreak,
      daysLogged,
      totalDaysInRange,
    },
    daily: inRangeLogs.slice().reverse(), // descending for table
    chartData: inRangeLogs, // chronological for charts
    weekly: weeklyArray.slice().reverse(),
    monthly: monthlyArray.slice().reverse(),
    heatStrip30Days,
  });
});

module.exports = {
  upsertWeight,
  getWeightLogs,
  deleteWeightLog,
  getWeightSummary,
};
