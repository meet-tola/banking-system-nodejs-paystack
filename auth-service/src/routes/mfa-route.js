const express = require("express");

const {
  verifyMfaLogin,
  enableMfa,
  disableMfa,
} = require("../controllers/mfa-controller");

const authenticateRequest = require("../middleware/auth-middleware");

const router = express.Router();

// MFA MANAGEMENT
router.post("/enable", authenticateRequest, enableMfa);
router.post("/disable", authenticateRequest, disableMfa);

// MFA LOGIN VERIFY
router.post("/verify", authenticateRequest, verifyMfaLogin);

module.exports = router;