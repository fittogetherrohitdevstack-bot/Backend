const express = require("express");
const router = express.Router();
const dietController = require("../Controllers/dietController");
const protect = require("../Middleware/auth");

router.use(protect);

// Templates (must be before :id routes)
router.get("/templates", dietController.getDietTemplates);
router.post("/templates", dietController.createOrUpdateDietTemplate);
router.delete("/templates/:id", dietController.deleteDietTemplate);

// Plans
router.post("/", dietController.createDietPlan);
router.get("/my-plans", dietController.getMyPlans);
router.get("/today", dietController.getTodayPlannedMeals);
router.get("/:id", dietController.getDietPlanById);
router.put("/:id", dietController.updateDietPlan);
router.delete("/:id", dietController.deleteDietPlan);
router.post("/:id/activate", dietController.activateDietPlan);
router.post("/:id/duplicate-day", dietController.duplicateDay);

module.exports = router;
