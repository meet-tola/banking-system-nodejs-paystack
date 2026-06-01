const express = require("express");

const {
  getBalance,
  transfer,
} = require("../controllers/ledger-controller");

const router = express.Router();

// Get wallet balance
router.get("/:walletId/balance", getBalance);

// Transfer funds
router.post("/transfer", transfer);

module.exports = router;