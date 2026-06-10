const express = require("express");
const {
  createTransaction,
  getAllTransactions,
  getTransactionById,
} = require("../controllers/transaction-controller");
const { authenticateRequest } = require("../middleware/auth-middleware");

const router = express.Router();

// auth middleware
router.use(authenticateRequest);

router.post("/create", createTransaction);
router.get("/all", getAllTransactions);
router.get("/:id", getTransactionById);


module.exports = router;
