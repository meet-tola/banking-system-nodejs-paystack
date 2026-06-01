const express = require("express");
const { getUserInfo } = require("../controllers/user-controller");

const authenticateRequest = require("../middleware/auth-middleware");

const router = express.Router();


router.post("/mfa/enable", authenticateRequest, getUserInfo);

module.exports = router;
