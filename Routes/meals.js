const express = require("express");
const router = express.Router();
const mealController = require("../Controllers/mealController");
const protect = require("../Middleware/auth");

router.use(protect);

// Part 3 Daily Diet Chart & Tick-off Endpoints
router.get("/day", mealController.getDayChart);
router.put("/day", mealController.saveDayChart);
router.patch("/day/items", mealController.updateChartItem);
router.patch("/day/meals", mealController.updateChartMeal);
router.post("/day/items", mealController.addUnplannedItem);
router.post("/day/copy", mealController.copyDayChart);
router.get("/summary", mealController.getMealsSummary);

// Legacy and backwards-compatible routes
router.post("/log", mealController.getOrCreateDailyMealLog);
router.patch("/log/:id", mealController.updateMealStatus);
router.get("/history", mealController.getMealHistory);

module.exports = router;
