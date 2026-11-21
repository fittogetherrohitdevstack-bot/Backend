const express = require("express");
const router = express.Router();
const workoutController = require("../Controllers/workoutController");
const protect = require("../Middleware/auth");

router.use(protect);

// ==========================================
// Exercise Library
// ==========================================
router.get("/exercises", workoutController.getExercises);
router.get("/exercises/filters", workoutController.getExerciseFilters);
router.post("/exercises/custom", workoutController.createCustomExercise);
router.get("/exercises/:idOrSlug", workoutController.getExerciseById);
router.post("/exercises/:id/favorite", workoutController.toggleFavoriteExercise);

// ==========================================
// Templates & Dashboard
// ==========================================
router.get("/templates", workoutController.getTemplates);
router.post("/templates/apply", workoutController.applyTemplate);
router.get("/dashboard", workoutController.getWorkoutDashboard);
router.get("/today", workoutController.getTodayWorkout);

// ==========================================
// Live Sessions & History
// ==========================================
router.get("/sessions/active", workoutController.getActiveSession);
router.post("/sessions/start", workoutController.startWorkoutSession);
router.get("/sessions/history", workoutController.getWorkoutHistory);
router.put("/sessions/:id/live-save", workoutController.updateLiveSession);
router.post("/sessions/:id/finish", workoutController.finishWorkoutSession);
router.post("/sessions/:id/cancel", workoutController.cancelWorkoutSession);
router.post("/sessions/:id/share", workoutController.shareWorkoutToFeed);
router.get("/sessions/:id", workoutController.getWorkoutSessionById);

// Legacy Session Endpoints (Preserved)
router.post("/sessions", workoutController.saveWorkoutSession);
router.patch("/sessions/:id", workoutController.updateWorkoutSession);

// ==========================================
// Analytics & Personal Records
// ==========================================
router.get("/analytics/muscle-map", workoutController.getMuscleMapData);
router.get("/analytics", workoutController.getWorkoutAnalytics);
router.get("/records", workoutController.getPersonalRecords);
router.post("/attendance", workoutController.markAttendance);

// ==========================================
// Workout Plan CRUD
// ==========================================
router.get("/my-plans", workoutController.getMyWorkoutPlans);
router.post("/", workoutController.createWorkoutPlan);
router.put("/:id", workoutController.updateWorkoutPlan);
router.delete("/:id", workoutController.deleteWorkoutPlan);
router.post("/:id/duplicate", workoutController.duplicateWorkoutPlan);
router.post("/:id/activate", workoutController.activateWorkoutPlan);

module.exports = router;
