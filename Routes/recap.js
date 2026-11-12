const express = require("express");
const router = express.Router();
const recapController = require("../Controllers/recapController");
const protect = require("../Middleware/auth");

router.use(protect);

router.get("/weekly", recapController.getWeeklyRecap);

module.exports = router;
