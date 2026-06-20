const express = require("express");
const router = express.Router();
const {
  getRiskLogs,
  getUserFraudProfile,
  resolveTriggerAlertOverride,
  riskEvaluate,
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
router.get("/risk/evaluate", authenticateRequest, riskEvaluate);

module.exports = router;
