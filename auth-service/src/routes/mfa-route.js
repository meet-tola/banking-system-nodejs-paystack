const express = require("express");

const {
  verifyMfaLogin,
  enableMfa,
  disableMfa,
  setupSecurityQuestions, 
} = require("../controllers/mfa-controller");

const authenticateRequest = require("../middleware/auth-middleware");

const router = express.Router();

// SECURITY QUESTION
router.post("/setup-questions", authenticateRequest, setupSecurityQuestions);

// MFA MANAGEMENT (TOTP App Link)
router.post("/enable", authenticateRequest, enableMfa);
router.post("/disable", authenticateRequest, disableMfa);

// MFA LOGIN VERIFY
router.post("/verify", authenticateRequest, verifyMfaLogin);

module.exports = router;