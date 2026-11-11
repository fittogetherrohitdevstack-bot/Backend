const BodyMetric = require("../Modals/BodyMetric");
const FitnessProfile = require("../Modals/FitnessProfile");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString } = require("../Utils/date");

// @desc Save body measurements and weight
// @route POST /api/progress/metrics
const saveMetrics = asyncHandler(async (req, res) => {
  const { weight, measurements, notes, date } = req.body;
  const entryDate = date || getLocalDateString(new Date(), req.user.timezone);

  let metric = await BodyMetric.findOne({
    userId: req.user._id,
    date: entryDate,
  });

  if (metric) {
    if (weight !== undefined) metric.weight = weight;
    if (measurements) metric.measurements = { ...metric.measurements, ...measurements };
    if (notes !== undefined) metric.notes = notes;
    await metric.save();
  } else {
    metric = await BodyMetric.create({
      userId: req.user._id,
      date: entryDate,
      weight,
      measurements: measurements || {},
      notes: notes || "",
    });
  }

  // Update current weight in fitness profile
  if (weight) {
    await FitnessProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { currentWeight: weight } }
    );
  }

  return sendSuccess(res, { metric }, "Metrics saved successfully");
});

// @desc Save progress photo
// @route POST /api/progress/photo
const uploadProgressPhoto = asyncHandler(async (req, res) => {
  const { photoUrl, date, notes } = req.body;
  const entryDate = date || getLocalDateString(new Date(), req.user.timezone);

  if (!photoUrl) {
    return sendError(res, "Photo URL is required", 400);
  }

  let metric = await BodyMetric.findOne({
    userId: req.user._id,
    date: entryDate,
  });

  if (metric) {
    metric.progressImage = photoUrl;
    if (notes) metric.notes = notes;
    await metric.save();
  } else {
    metric = await BodyMetric.create({
      userId: req.user._id,
      date: entryDate,
      progressImage: photoUrl,
      notes: notes || "",
    });
  }

  return sendSuccess(res, { metric }, "Progress photo saved");
});

// @desc Get progress history for charts
// @route GET /api/progress/history
const getProgressHistory = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;
  const limit = period === "year" ? 365 : period === "all" ? 1000 : 30;

  const history = await BodyMetric.find({ userId: req.user._id })
    .sort({ date: 1 })
    .limit(limit);

  return sendSuccess(res, { history });
});

module.exports = {
  saveMetrics,
  uploadProgressPhoto,
  getProgressHistory,
};
