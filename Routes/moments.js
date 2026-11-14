const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const router = express.Router({ mergeParams: true });
const momentController = require("../Controllers/momentController");
const protect = require("../Middleware/auth");
const { checkGroupMember } = require("../Middleware/groupAuth");
const validate = require("../Middleware/validate");
const { sendError } = require("../Utils/apiResponse");
const { MAX_PHOTO_BYTES } = require("../Utils/cloudinary");
const { MOMENT_CATEGORIES, MOMENT_REACTION_EMOJIS } = require("../Modals/SquadMoment");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
});

const handlePhotosUpload = (req, res, next) => {
  upload.array("photos", 6)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendError(res, "One of the photos exceeds the 8 MB maximum size limit.", 400);
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return sendError(res, "Too many photos uploaded (maximum 6 photos per moment).", 400);
      }
      return sendError(res, err.message, 400);
    }
    if (err) {
      return sendError(res, err.message || "File upload error.", 400);
    }
    return next();
  });
};

const updateMomentSchema = {
  body: z.object({
    caption: z.string().max(1000).optional(),
    category: z.enum(MOMENT_CATEGORIES).optional(),
  }),
};

const reactMomentSchema = {
  body: z.object({
    emoji: z.enum(MOMENT_REACTION_EMOJIS, {
      errorMap: () => ({
        message: `Supported reaction emojis: ${MOMENT_REACTION_EMOJIS.join(" ")}`,
      }),
    }),
  }),
};

const commentMomentSchema = {
  body: z.object({
    text: z.string().min(1, "Comment text is required").max(500, "Comment cannot exceed 500 characters"),
  }),
};

router.use(protect);
router.use(checkGroupMember());

// Feed & Single Moment
router.get("/", momentController.getMoments);
router.get("/:momentId", momentController.getMomentById);
router.post("/", handlePhotosUpload, momentController.createMoment);
router.put("/:momentId", validate(updateMomentSchema), momentController.updateMoment);
router.delete("/:momentId", momentController.deleteMoment);

// Reactions
router.post("/:momentId/react", validate(reactMomentSchema), momentController.reactToMoment);

// Comments
router.get("/:momentId/comments", momentController.getMomentComments);
router.post("/:momentId/comments", validate(commentMomentSchema), momentController.addMomentComment);
router.delete("/:momentId/comments/:commentId", momentController.deleteMomentComment);

module.exports = router;
