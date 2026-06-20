const express = require("express");

const {
  registerUser,
  loginUser,
  refreshTokenUser,
  verifyRegisterOtp,
  verifyLoginOtp,
  resendRegisterOtp,
  resendLoginOtp,
  logoutUser,
  logoutAllDevices,
  initiateInAppChallenge,
  verifyInAppChallenge,
  changePassword,
  resetPassword,
} = require("../controllers/auth-controller");

const authenticateRequest = require("../middleware/auth-middleware");

const router = express.Router();

// AUTH FLOW
router.post("/register", registerUser);
router.post("/login", loginUser);

// OTP VERIFICATION
router.post("/register/verify-otp", verifyRegisterOtp);
router.post("/login/verify-otp", verifyLoginOtp);
router.post("/register/resend-otp", resendRegisterOtp);
router.post("/login/resend-otp", resendLoginOtp);

// IN-APP SECURITY CHALLENGE 
router.get("/initiate-challenge", authenticateRequest, initiateInAppChallenge);
router.post("/verify-challenge", authenticateRequest, verifyInAppChallenge);

// PASSWORD MODIFICATION WAYS
router.post("/change-password", authenticateRequest, changePassword);
router.post("/reset-password", resetPassword); 

// TOKEN
router.post("/refresh-token", refreshTokenUser);

// LOGOUT
router.post("/logout", authenticateRequest, logoutUser);
router.post("/logout-all", authenticateRequest, logoutAllDevices);

module.exports = router;