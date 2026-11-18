const express = require("express");
const router = express.Router();
const authController = require("../Controllers/authController");
const validate = require("../Middleware/validate");
const { z } = require("zod");

const registerSchema = {
  body: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z.string().trim().toLowerCase().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    timezone: z.string().optional(),
    age: z.number().optional(),
    gender: z.enum(["male", "female", "other"]).optional(),
    height: z.number().optional(),
    currentWeight: z.number().optional(),
    targetWeight: z.number().optional(),
    fitnessGoal: z.string().optional(),
    activityLevel: z.string().optional(),
    dietPreference: z.string().optional(),
    inviteCode: z.string().optional(),
    needsOnboarding: z.boolean().optional(),
  }),
};

const loginSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
  }),
};

const forgotPasswordSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email("Invalid email format"),
  }),
};

const resetPasswordSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email("Invalid email format").optional(),
    code: z.string().trim().min(4, "Verification code must be at least 4 digits").max(10).optional(),
    token: z.string().trim().optional(),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  }).refine((data) => data.code || data.token, {
    message: "Either verification code or reset token is required",
    path: ["code"],
  }),
};

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/forgot-password", validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);
router.get("/reset-password/verify/:token", authController.verifyResetToken);

module.exports = router;
