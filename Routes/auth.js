const express = require("express");
const router = express.Router();
const authController = require("../Controllers/authController");
const validate = require("../Middleware/validate");
const { z } = require("zod");

const registerSchema = {
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
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
  }),
};

const loginSchema = {
  body: z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
  }),
};

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);

module.exports = router;
