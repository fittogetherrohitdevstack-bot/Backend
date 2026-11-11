const express = require("express");
const router = express.Router();
const challengeController = require("../Controllers/challengeController");
const protect = require("../Middleware/auth");

router.use(protect);

router.post("/:id/join", challengeController.joinChallenge);
router.get("/:id", challengeController.getChallengeDetails);

module.exports = router;
