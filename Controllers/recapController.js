const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { generateWeeklyRecapForUser } = require("../Utils/recapService");
const { isValidDateString } = require("../Utils/date");

// @desc Get or generate the user's shareable Mon-Sun Weekly Recap card data
// @route GET /api/recap/weekly?weekStart=YYYY-MM-DD
const getWeeklyRecap = asyncHandler(async (req, res) => {
  const { weekStart } = req.query;
  if (weekStart && !isValidDateString(String(weekStart))) {
    return sendError(res, "weekStart must be YYYY-MM-DD", 400);
  }

  const recap = await generateWeeklyRecapForUser(req.user._id, {
    weekStartOverride: weekStart ? String(weekStart) : null,
    persist: true,
  });

  return sendSuccess(res, { recap });
});

module.exports = {
  getWeeklyRecap,
};
