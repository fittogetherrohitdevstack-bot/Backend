const express = require("express");
const router = express.Router();
const progressController = require("../Controllers/progressController");
const weightController = require("../Controllers/weightController");
const measurementController = require("../Controllers/measurementController");
const protect = require("../Middleware/auth");

router.use(protect);

// Body metrics & photos (legacy & measurements)
router.post("/metrics", progressController.saveMetrics);
router.post("/photo", progressController.uploadProgressPhoto);
router.get("/history", progressController.getProgressHistory);

// Daily Weight Tracking & Analytics
router.put("/weight", weightController.upsertWeight);
router.get("/weight", weightController.getWeightLogs);
router.get("/weight/summary", weightController.getWeightSummary);
router.delete("/weight/:id", weightController.deleteWeightLog);

// Weekly Body Measurements & Analytics
router.put("/measurements", measurementController.upsertMeasurements);
router.get("/measurements", measurementController.getMeasurements);
router.get("/measurements/summary", measurementController.getMeasurementSummary);
router.delete("/measurements/:id", measurementController.deleteMeasurement);

// Bi-weekly Progress Photo Sets (Front / Side / Back relaxed)
router.use("/photo-sets", require("./photoSets"));

module.exports = router;
