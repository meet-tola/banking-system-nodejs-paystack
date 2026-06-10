const express = require("express");
const { getUserInfo, getUsersByIds, searchUsers } = require("../controllers/user-controller");

const authenticateRequest = require("../middleware/auth-middleware");

const router = express.Router();


router.get("/me", authenticateRequest, getUserInfo);
router.get("/search-users", authenticateRequest, searchUsers);
router.post("/get-users-by-ids", authenticateRequest, getUsersByIds);

module.exports = router;
