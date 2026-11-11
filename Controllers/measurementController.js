const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const BodyMeasurement = require("../Modals/BodyMeasurement");
const FitnessProfile = require("../Modals/FitnessProfile");
const { getLocalDateString, getISOWeekDetails, getCalendarMonth } = require("../Utils/date");
const { POINTS_RULES } = require("../Utils/gamification");
const { awardConsistencyPoints } = require("../Utils/consistencyPoints");

// Available measurement keys
const MEASUREMENT_KEYS = [
  "chest",
  "waist",
  "abdomen",
  "hips",
  "leftArm",
  "rightArm",
  "leftThigh",
  "rightThigh",
  "neck",
  "shoulders",
  "calves",
];

/**
 * @desc Upsert body measurements for a week
 * @route PUT /api/progress/measurements
 * @access Private
 */
const upsertMeasurements = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const timezone = req.user.timezone || "Asia/Kolkata";
  const { date, measurementsCm, note = "", progressImage = "" } = req.body;

  const entryDate = date || getLocalDateString(new Date(), timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return res.status(400).json({ success: false, message: "Invalid date format. Expected YYYY-MM-DD." });
  }

  if (!measurementsCm || typeof measurementsCm !== "object") {
    return res.status(400).json({ success: false, message: "measurementsCm must be provided as an object." });
  }

  // Validate at least one valid measurement
  const cleanedMeasurements = {};
  let hasValid = false;

  for (const key of MEASUREMENT_KEYS) {
    if (measurementsCm[key] !== undefined && measurementsCm[key] !== null && measurementsCm[key] !== "") {
      const val = Number(measurementsCm[key]);
      if (isNaN(val) || val <= 0 || val > 300) {
        return res.status(400).json({
          success: false,
          message: `Invalid value for ${key}. Must be a positive number up to 300 cm.`,
        });
      }
      cleanedMeasurements[key] = Math.round(val * 10) / 10;
      hasValid = true;
    }
  }

  if (!hasValid) {
    return res.status(400).json({
      success: false,
      message: "At least one body measurement must be provided.",
    });
  }

  const { weekStart } = getISOWeekDetails(entryDate);

  const entry = await BodyMeasurement.findOneAndUpdate(
    { userId, weekStart },
    {
      $set: {
        date: entryDate,
        weekStart,
        measurementsCm: cleanedMeasurements,
        note: (note || "").slice(0, 500),
        progressImage: progressImage || "",
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      runValidators: true,
    }
  );

  await awardConsistencyPoints({
    userId,
    date: entryDate,
    periodKey: weekStart,
    type: "measurements",
    points: POINTS_RULES.WEEKLY_MEASUREMENTS_COMPLETED,
    meta: { weekStart },
  });

  res.status(200).json({
    success: true,
    message: "Weekly measurements saved successfully.",
    data: entry,
  });
});

/**
 * @desc Get body measurements history
 * @route GET /api/progress/measurements
 * @access Private
 */
const getMeasurements = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { from, to } = req.query;

  const query = { userId };
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const entries = await BodyMeasurement.find(query).sort({ weekStart: -1 }).lean();

  res.status(200).json({
    success: true,
    data: entries,
  });
});

/**
 * @desc Delete a measurement record
 * @route DELETE /api/progress/measurements/:id
 * @access Private
 */
const deleteMeasurement = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  const entry = await BodyMeasurement.findOneAndDelete({ _id: id, userId });
  if (!entry) {
    return res.status(404).json({ success: false, message: "Measurement entry not found." });
  }

  res.status(200).json({
    success: true,
    message: "Measurement entry deleted successfully.",
  });
});

/**
 * @desc Get comprehensive measurements summary & analytics
 * @route GET /api/progress/measurements/summary?range=4w|12w|26w|all
 * @access Private
 */
const getMeasurementSummary = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { range = "12w" } = req.query;

  // Retrieve user's fitness profile for height
  const profile = await FitnessProfile.findOne({ userId }).lean();
  const heightCm = profile?.height || 175;

  // Fetch all measurements chronologically
  const allEntries = await BodyMeasurement.find({ userId }).sort({ weekStart: 1 }).lean();

  if (allEntries.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        summaryByPart: {},
        weeklyTable: [],
        monthlyAverages: [],
        ratios: {
          waistToHip: null,
          waistToHeight: null,
          heightCm,
        },
        consistency: {
          weeksLogged: 0,
          totalWeeksInRange: 0,
          consistencyRate: 0,
        },
        lastEntry: null,
      },
    });
  }

  // Filter based on range
  let targetWeeks = 12;
  if (range === "4w") targetWeeks = 4;
  else if (range === "12w") targetWeeks = 12;
  else if (range === "26w") targetWeeks = 26;
  else if (range === "all") targetWeeks = 9999;

  const filteredEntries =
    range === "all" ? allEntries : allEntries.slice(-targetWeeks);

  const lastEntry = allEntries[allEntries.length - 1];
  const firstEntry = filteredEntries[0];

  // 1. Analytics per body part
  const summaryByPart = {};
  for (const part of MEASUREMENT_KEYS) {
    const validPartEntries = filteredEntries.filter(
      (e) => e.measurementsCm && e.measurementsCm[part] !== undefined && e.measurementsCm[part] !== null
    );

    if (validPartEntries.length > 0) {
      const currentVal = validPartEntries[validPartEntries.length - 1].measurementsCm[part];
      const startVal = validPartEntries[0].measurementsCm[part];
      const totalChange = Math.round((currentVal - startVal) * 10) / 10;

      // change vs previous recorded week
      let changeVsLastWeek = 0;
      if (validPartEntries.length >= 2) {
        const prevVal = validPartEntries[validPartEntries.length - 2].measurementsCm[part];
        changeVsLastWeek = Math.round((currentVal - prevVal) * 10) / 10;
      }

      // change vs 4 weeks ago
      let changeVs4WeeksAgo = 0;
      if (validPartEntries.length >= 5) {
        const fourWeeksVal = validPartEntries[validPartEntries.length - 5].measurementsCm[part];
        changeVs4WeeksAgo = Math.round((currentVal - fourWeeksVal) * 10) / 10;
      } else if (validPartEntries.length >= 2) {
        changeVs4WeeksAgo = Math.round((currentVal - startVal) * 10) / 10;
      }

      const values = validPartEntries.map((e) => e.measurementsCm[part]);
      const highest = Math.max(...values);
      const lowest = Math.min(...values);

      summaryByPart[part] = {
        current: currentVal,
        starting: startVal,
        changeSinceStart: totalChange,
        changeVsLastWeek,
        changeVs4WeeksAgo,
        highest,
        lowest,
        sparkline: validPartEntries.map((e) => ({
          weekStart: e.weekStart,
          date: e.date,
          value: e.measurementsCm[part],
        })),
      };
    }
  }

  // 2. Weekly details table
  const weeklyTable = filteredEntries.map((entry, idx) => {
    const prev = idx > 0 ? filteredEntries[idx - 1] : null;
    const deltas = {};
    if (prev && prev.measurementsCm) {
      for (const part of MEASUREMENT_KEYS) {
        if (entry.measurementsCm?.[part] && prev.measurementsCm?.[part]) {
          deltas[part] = Math.round((entry.measurementsCm[part] - prev.measurementsCm[part]) * 10) / 10;
        }
      }
    }
    return {
      _id: entry._id,
      weekStart: entry.weekStart,
      date: entry.date,
      measurementsCm: entry.measurementsCm,
      note: entry.note,
      progressImage: entry.progressImage,
      deltas,
    };
  });

  // 3. Monthly averages per body part
  const monthMap = {};
  for (const entry of filteredEntries) {
    const month = getCalendarMonth(entry.date);
    if (!monthMap[month]) {
      monthMap[month] = { count: 0, totals: {} };
    }
    monthMap[month].count++;
    for (const part of MEASUREMENT_KEYS) {
      if (entry.measurementsCm?.[part]) {
        monthMap[month].totals[part] = (monthMap[month].totals[part] || 0) + entry.measurementsCm[part];
        monthMap[month][`${part}_count`] = (monthMap[month][`${part}_count`] || 0) + 1;
      }
    }
  }

  const monthlyAverages = Object.keys(monthMap)
    .sort()
    .map((month) => {
      const data = monthMap[month];
      const averages = {};
      for (const part of MEASUREMENT_KEYS) {
        const count = data[`${part}_count`] || 0;
        if (count > 0) {
          averages[part] = Math.round((data.totals[part] / count) * 10) / 10;
        }
      }
      return {
        month,
        entriesCount: data.count,
        averages,
      };
    });

  // 4. Automatic Derived Ratios
  const latestWaist = lastEntry?.measurementsCm?.waist;
  const latestHips = lastEntry?.measurementsCm?.hips;

  let waistToHipRatio = null;
  if (latestWaist && latestHips && latestHips > 0) {
    waistToHipRatio = Math.round((latestWaist / latestHips) * 100) / 100;
  }

  let waistToHeightRatio = null;
  if (latestWaist && heightCm > 0) {
    waistToHeightRatio = Math.round((latestWaist / heightCm) * 100) / 100;
  }

  // 5. Consistency
  const weeksLogged = filteredEntries.length;
  const totalWeeksInRange = range === "all" ? Math.max(weeksLogged, 1) : targetWeeks;
  const consistencyRate = Math.min(100, Math.round((weeksLogged / totalWeeksInRange) * 100));

  res.status(200).json({
    success: true,
    data: {
      summaryByPart,
      weeklyTable,
      monthlyAverages,
      ratios: {
        waistToHip: waistToHipRatio,
        waistToHeight: waistToHeightRatio,
        heightCm,
      },
      consistency: {
        weeksLogged,
        totalWeeksInRange,
        consistencyRate,
      },
      lastEntry,
    },
  });
});

module.exports = {
  upsertMeasurements,
  getMeasurements,
  deleteMeasurement,
  getMeasurementSummary,
};
