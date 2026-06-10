const express = require("express");
const {
  createWallet,
  getWallet,
  getWalletBalance,
  getWalletByAccount,
  autocompleteSearch,
  createPin,
  updatePin,
  toggleWalletFreeze,
  verifyInternalPin
} = require("../controllers/wallet-controller");
const { authenticateRequest } = require("../middleware/auth-middleware");

const router = express.Router();

router.post("/create", authenticateRequest, createWallet);
router.get("/me", authenticateRequest, getWallet);
router.get("/me/balance", authenticateRequest, getWalletBalance);

router.get("/account/:accountNumber", authenticateRequest, getWalletByAccount);

//auto complete for other users
router.get("/search", authenticateRequest, autocompleteSearch);

router.post("/pin", authenticateRequest, createPin);
router.put("/pin", authenticateRequest, updatePin);
router.post("/verify-pin", authenticateRequest, verifyInternalPin);
router.post("/freeze", authenticateRequest, toggleWalletFreeze);

module.exports = router;
