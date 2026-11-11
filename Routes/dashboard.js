const express = require("express");
const router = express.Router();
const mealController = require("../Controllers/mealController");
const protect = require("../Middleware/auth");

router.use(protect);

router.get("/me", mealController.getMyDashboardSummary);

module.exports = router;
