const express = require("express");
const router = express.Router();
const { z } = require("zod");
const targetController = require("../Controllers/targetController");
const protect = require("../Middleware/auth");
const validate = require("../Middleware/validate");
const { isValidDateString } = require("../Utils/date");

const optionalDateStr = z
  .string()
  .refine((val) => val === "" || isValidDateString(val), {
    message: "Date must be valid YYYY-MM-DD",
  })
  .optional();

const getWeeklySchema = {
  query: z.object({
    week: optionalDateStr,
  }),
};

const upsertWeeklySchema = {
  body: z.object({
    week: optionalDateStr,
    weightChangeKgPerWeek: z
      .number({ invalid_type_error: "Weekly weight target must be a number" })
      .min(-3.0, "Cannot target faster than -3.0 kg/week")
      .max(3.0, "Cannot target faster than +3.0 kg/week")
      .nullable()
      .optional(),
    weighInsTarget: z.number().int().min(1).max(7).optional(),
    waistChangeCm: z.number().min(-5).max(5).nullable().optional(),
    note: z.string().max(300).optional(),
    source: z.enum(["manual", "carried_over", "suggested"]).optional(),
    carryOver: z.boolean().optional(),
  }),
};

const updateDefaultsSchema = {
  body: z.object({
    enabled: z.boolean().optional(),
    weightChangeKgPerWeek: z
      .number({ invalid_type_error: "Default weight target must be a number" })
      .min(-3.0)
      .max(3.0)
      .nullable()
      .optional(),
    weighInsTarget: z.number().int().min(1).max(7).optional(),
    waistChangeCm: z.number().min(-5).max(5).nullable().optional(),
    note: z.string().max(300).optional(),
    applyToCurrentWeek: z.boolean().optional(),
  }),
};

const getHistorySchema = {
  query: z.object({
    weeks: z.coerce.number().int().min(1).max(52).optional(),
  }),
};

router.use(protect);

router.get("/weekly", validate(getWeeklySchema), targetController.getWeeklyTarget);
router.put("/weekly", validate(upsertWeeklySchema), targetController.upsertWeeklyTarget);
router.put("/defaults", validate(updateDefaultsSchema), targetController.updateTargetDefaults);
router.get("/history", validate(getHistorySchema), targetController.getWeeklyHistory);
router.get("/suggest", targetController.getSuggestedWeeklyTarget);

module.exports = router;
