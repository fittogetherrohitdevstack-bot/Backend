const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const router = express.Router();
const photoSetController = require("../Controllers/photoSetController");
const validate = require("../Middleware/validate");
const { sendError } = require("../Utils/apiResponse");
const { MAX_PHOTO_BYTES } = require("../Utils/cloudinary");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
});

const handleMulterUpload = (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendError(res, "Photo exceeds the 8 MB maximum upload size.", 400);
      }
      return sendError(res, err.message, 400);
    }
    if (err) {
      return sendError(res, err.message || "File upload error.", 400);
    }
    return next();
  });
};

const dateQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional(),
});

router.get(
  "/",
  validate({ query: dateQuerySchema }),
  photoSetController.listPhotoSets
);

router.get("/current", photoSetController.getCurrentPhotoCycle);

router.put(
  "/anchor",
  validate({
    body: z.object({
      anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
    }),
  }),
  photoSetController.updatePhotoCycleAnchor
);

router.put(
  "/current/photo",
  handleMulterUpload,
  validate({
    body: z.object({
      pose: z.enum(["front_relaxed", "side_relaxed", "back_relaxed"]),
      note: z.string().max(500).optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      cycleNumber: z.coerce.number().int().min(1).max(999).optional(),
    }),
  }),
  photoSetController.uploadCurrentCyclePose
);

router.put(
  "/:id/visibility",
  validate({
    body: z.object({
      visibility: z.enum(["private", "group"]),
    }),
  }),
  photoSetController.updatePhotoSetVisibility
);

router.delete("/:id/photo/:pose", photoSetController.deleteSinglePosePhoto);
router.delete("/:id", photoSetController.deletePhotoSet);

module.exports = router;
