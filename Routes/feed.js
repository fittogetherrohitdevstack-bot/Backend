const express = require("express");
const router = express.Router();
const { z } = require("zod");
const feedController = require("../Controllers/feedController");
const protect = require("../Middleware/auth");
const validate = require("../Middleware/validate");

const reactSchema = {
  body: z.object({
    emoji: z.enum(["👏", "💪", "🔥", "❤️"]),
  }),
};

router.use(protect);

router.post("/:eventId/react", validate(reactSchema), feedController.reactToFeedEvent);

module.exports = router;
