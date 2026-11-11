const express = require("express");
const router = express.Router();
const workoutController = require("../Controllers/workoutController");
const protect = require("../Middleware/auth");

router.use(protect);

router.post("/", workoutController.createWorkoutPlan);
router.get("/my-plans", workoutController.getMyWorkoutPlans);
router.get("/today", workoutController.getTodayWorkout);
router.put("/:id", workoutController.updateWorkoutPlan);
router.delete("/:id", workoutController.deleteWorkoutPlan);

router.post("/sessions", workoutController.saveWorkoutSession);
router.patch("/sessions/:id", workoutController.updateWorkoutSession);
router.get("/sessions/history", workoutController.getWorkoutHistory);
router.get("/records", workoutController.getPersonalRecords);
router.post("/attendance", workoutController.markAttendance);

module.exports = router;
