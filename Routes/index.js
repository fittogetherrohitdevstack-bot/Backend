const express = require("express");
const router = express.Router();

router.use("/auth", require("./auth"));
router.use("/users", require("./users"));
router.use("/groups", require("./groups"));
router.use("/diet", require("./diet"));
router.use("/meals", require("./meals"));
router.use("/workouts", require("./workouts"));
router.use("/water", require("./water"));
router.use("/progress", require("./progress"));
router.use("/targets", require("./targets"));
router.use("/reminders", require("./reminders"));
router.use("/jobs", require("./jobs"));
router.use("/dashboard", require("./dashboard"));
router.use("/challenges", require("./challenges"));
router.use("/notifications", require("./notifications"));

module.exports = router;
