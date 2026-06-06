const express = require("express");

const {
  createFundingAccount,
  verifyAccount,
  withdrawFunds,
  getBanks,
} = require("../controllers/funding-controller");

const { authenticateRequest } = require("../middleware/auth-middleware");

const router = express.Router();

router.use(authenticateRequest);

router.post("/funding-account", createFundingAccount);

router.post("/verify-account", verifyAccount);

router.get("/banks", getBanks);

module.exports = router;
