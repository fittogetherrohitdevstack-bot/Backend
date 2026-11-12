const express = require("express");
const router = express.Router();
const { z } = require("zod");
const pushController = require("../Controllers/pushController");
const protect = require("../Middleware/auth");
const validate = require("../Middleware/validate");

const subscribeSchema = {
  body: z.object({
    subscription: z
      .object({
        endpoint: z.string().url(),
        expirationTime: z.number().nullable().optional(),
        keys: z.object({
          p256dh: z.string().min(1),
          auth: z.string().min(1),
        }),
      })
      .optional(),
    endpoint: z.string().url().optional(),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      })
      .optional(),
    userAgent: z.string().max(300).optional(),
  }),
};

router.use(protect);

router.get("/vapid-key", pushController.getVapidPublicKey);
router.post("/subscribe", validate(subscribeSchema), pushController.subscribePush);
router.post("/unsubscribe", pushController.unsubscribePush);
router.post("/test", pushController.sendTestPush);

module.exports = router;
