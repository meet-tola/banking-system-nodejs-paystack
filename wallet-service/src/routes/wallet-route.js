const express = require("express");
const {
  createWallet,
  getWallet,
  getWalletBalance
} = require("../controllers/wallet-controller");
const { authenticateRequest } = require("../middleware/auth-middleware");

const router = express.Router();

router.post("/create", authenticateRequest, createWallet);
router.get("/:id", getWallet);
router.get("/:id/balance", getWalletBalance);

module.exports = router;
