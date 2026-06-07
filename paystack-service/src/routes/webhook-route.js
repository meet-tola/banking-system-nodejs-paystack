const express = require("express");


const { handleWebhook } = require("../controllers/webhook-controller");

const { authenticateRequest } = require("../middleware/auth-middleware");

const router = express.Router();

router.use(authenticateRequest);

router.post("/", handleWebhook);

module.exports = router;
