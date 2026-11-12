const express = require("express");
const router = express.Router();
const groupController = require("../Controllers/groupController");
const leaderboardController = require("../Controllers/leaderboardController");
const challengeController = require("../Controllers/challengeController");
const photoSetController = require("../Controllers/photoSetController");
const feedController = require("../Controllers/feedController");
const nudgeController = require("../Controllers/nudgeController");
const protect = require("../Middleware/auth");
const { checkGroupMember } = require("../Middleware/groupAuth");
const validate = require("../Middleware/validate");
const { z } = require("zod");

// Public invite code preview (no sensitive logs or member PII)
router.get("/invite/:code", groupController.getInvitePreview);

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
  validate({
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      description: z.string().max(300).optional(),
      maxMembers: z.number().min(2).max(50).optional(),
      weeklyStakes: z
        .object({
          enabled: z.boolean().optional(),
          forfeitText: z.string().max(140).optional(),
        })
        .optional(),
      challengeSettings: z
        .object({
          autoRotate: z.boolean().optional(),
          preferredTemplate: z.string().optional(),
        })
        .optional(),
    }),
  }),
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

// Social Engagement: Feed, Member Status Strip & Nudges
router.get("/:id/feed", checkGroupMember(), feedController.getGroupFeed);
router.get("/:id/today-status", checkGroupMember(), nudgeController.getSquadTodayStatus);
router.post(
  "/:id/nudge",
  checkGroupMember(),
  validate({
    body: z.object({
      targetUserId: z.string().min(1),
      message: z.string().max(140).optional(),
    }),
  }),
  nudgeController.nudgeMember
);

// Challenges within group + weekly templates
router.get("/:id/challenges/templates", checkGroupMember(), challengeController.getChallengeTemplates);
router.post(
  "/:id/challenges/weekly",
  checkGroupMember({ requireAdmin: true }),
  validate({
    body: z.object({
      templateKey: z.enum([
        "water_5_days",
        "most_days_logged",
        "most_meals_ticked",
        "full_diet_completion",
      ]).optional(),
    }),
  }),
  challengeController.selectWeeklyChallengeTemplate
);
router.post("/:id/challenges", checkGroupMember(), challengeController.createChallenge);
router.get("/:id/challenges", checkGroupMember(), challengeController.getGroupChallenges);

module.exports = router;
