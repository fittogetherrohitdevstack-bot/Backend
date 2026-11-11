const express = require("express");
const router = express.Router();
const waterController = require("../Controllers/waterController");
const protect = require("../Middleware/auth");

router.use(protect);

router.post("/", waterController.addWater);
router.get("/today", waterController.getTodayWater);
router.get("/history", waterController.getWaterHistory);
router.delete("/entries/:entryId", waterController.deleteWaterEntry);

module.exports = router;
