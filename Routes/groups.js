const express = require("express");
const router = express.Router();
const groupController = require("../Controllers/groupController");
const leaderboardController = require("../Controllers/leaderboardController");
const challengeController = require("../Controllers/challengeController");
const photoSetController = require("../Controllers/photoSetController");
const protect = require("../Middleware/auth");
const { checkGroupMember } = require("../Middleware/groupAuth");
const validate = require("../Middleware/validate");
const { z } = require("zod");

router.use(protect);

router.post(
  "/",
  validate({
    body: z.object({
      name: z.string().min(2).max(60),
      description: z.string().optional(),
      maxMembers: z.number().min(2).max(50).optional(),
    }),
  }),
  groupController.createGroup
);

router.post(
  "/join",
  validate({
    body: z.object({
      inviteCode: z.string().min(4),
    }),
  }),
  groupController.joinGroup
);

router.get("/mine", groupController.getMyGroups);

// Group-specific routes requiring membership
router.get("/:id", checkGroupMember(), groupController.getGroupById);
router.put(
  "/:id",
  checkGroupMember({ requireAdmin: true }),
  groupController.updateGroup
);
router.get("/:id/members", checkGroupMember(), groupController.getGroupMembers);
router.post(
  "/:id/invite/regenerate",
  checkGroupMember({ requireAdmin: true }),
  groupController.regenerateInviteCode
);
router.post("/:id/leave", checkGroupMember(), groupController.leaveGroup);
router.delete(
  "/:id/members/:userId",
  checkGroupMember({ requireAdmin: true }),
  groupController.removeMember
);
router.get("/:id/dashboard", checkGroupMember(), groupController.getGroupDashboard);
router.get("/:id/shared-photos", checkGroupMember(), photoSetController.getGroupSharedPhotos);
router.get("/:id/leaderboard", checkGroupMember(), leaderboardController.getGroupLeaderboard);

// Challenges within group
router.post("/:id/challenges", checkGroupMember(), challengeController.createChallenge);
router.get("/:id/challenges", checkGroupMember(), challengeController.getGroupChallenges);

module.exports = router;
