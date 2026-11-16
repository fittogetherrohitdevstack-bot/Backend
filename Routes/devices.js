const express = require("express");
const router = express.Router();
const deviceController = require("../Controllers/deviceController");
const protect = require("../Middleware/auth");

router.use(protect);

router.post("/register", deviceController.registerDevice);
router.post("/unregister", deviceController.unregisterDevice);
router.post("/test", deviceController.sendTestNativeNotification);

module.exports = router;
