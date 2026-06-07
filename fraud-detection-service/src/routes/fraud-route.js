const express = require("express");
const router = express.Router();
const {
  getRiskLogs,
  getUserFraudProfile,
  resolveTriggerAlertOverride,
} = require("../controller/fraud-controller");
const { authenticateRequest } = require("../middleware/auth-middleware");

// Core analytical operations tracking routes
router.get("/logs", authenticateRequest, getRiskLogs);
router.get("/profiles/:userId", authenticateRequest, getUserFraudProfile);
router.post(
  "/logs/:logId/override",
  authenticateRequest,
  resolveTriggerAlertOverride,
);

module.exports = router;
