const express = require("express");
const multer = require("multer");
const router = express.Router();
const { z } = require("zod");
const authController = require("../Controllers/authController");
const badgeController = require("../Controllers/badgeController");
const mealController = require("../Controllers/mealController");
const protect = require("../Middleware/auth");
const validate = require("../Middleware/validate");
const { sendError } = require("../Utils/apiResponse");
const { MAX_PHOTO_BYTES } = require("../Utils/cloudinary");

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
});

const handleAvatarUpload = (req, res, next) => {
  avatarUpload.fields([
    { name: "photo", maxCount: 1 },
    { name: "avatar", maxCount: 1 },
  ])(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendError(res, "Profile photo exceeds the 8 MB limit.", 400);
      }
      return sendError(res, err.message, 400);
    }
    if (err) {
      return sendError(res, err.message || "File upload error.", 400);
    }
    return next();
  });
};

const updateFeaturesSchema = {
  body: z.object({
    reminders: z.boolean().optional(),
    weeklyTargets: z.boolean().optional(),
    photoCheckins: z.boolean().optional(),
    hideWeightNumbers: z.boolean().optional(),
  }),
};

router.use(protect);

router.get("/me", authController.getMe);
router.put("/profile", authController.updateProfile);
router.put("/features", validate(updateFeaturesSchema), authController.updateFeatureSettings);
router.post("/avatar", handleAvatarUpload, authController.uploadAvatar);
router.delete("/avatar", authController.removeAvatar);
router.get("/me/badges", badgeController.getMyBadges);
router.get("/me/streaks", async (req, res, next) => {
  // Delegate streak logic to dashboard summary helper
  const summary = await mealController.getMyDashboardSummary(req, res, next);
});

module.exports = router;
