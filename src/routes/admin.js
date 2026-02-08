const express = require("express");
const router = express.Router();
const AdminController = require("../controller/Admin");
const authMiddleware = require("../middleware/auth");
const adminMiddleware = require("../middleware/admin");

router.get("/stats", authMiddleware, adminMiddleware, AdminController.getStats);

module.exports = router;
