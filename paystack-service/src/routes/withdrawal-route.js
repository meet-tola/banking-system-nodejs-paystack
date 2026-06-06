const express = require("express");

const { withdrawFunds } = require("../controllers/withdrawal-controller");

const { authenticateRequest } = require("../middleware/auth-middleware");

const router = express.Router();

router.use(authenticateRequest);

router.post("/handle", withdrawFunds);

module.exports = router;
