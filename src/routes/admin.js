const express = require("express");
const router = express.Router();
const AdminController = require("../controller/Admin");
const authMiddleware = require("../middleware/auth");
const adminMiddleware = require("../middleware/admin");
const examinerMiddleware = require("../middleware/examiner");

// ── General admin stats (admin + examiner can see) ──────────────────────────
router.get("/stats", authMiddleware, adminMiddleware, AdminController.getStats);

// ── User management (admin only) ────────────────────────────────────────────
router.get("/users", authMiddleware, adminMiddleware, AdminController.getAllUsers);
router.get("/users/:id", authMiddleware, adminMiddleware, AdminController.getUserDetails);

// ── Exchange management (admin only) ────────────────────────────────────────
router.get("/exchanges", authMiddleware, adminMiddleware, AdminController.getAllExchanges);
router.get("/exchanges/:id", authMiddleware, adminMiddleware, AdminController.getExchangeDetails);

// ── Examiner routes ─────────────────────────────────────────────────────────
// GET  /api/admin/examiner/queue         → list all admin_processing proposals
router.get("/examiner/queue", authMiddleware, examinerMiddleware, AdminController.getExaminationQueue);

// GET  /api/admin/examiner/queue/:id     → single proposal detail
router.get("/examiner/queue/:id", authMiddleware, examinerMiddleware, AdminController.getProposalForReview);

// POST /api/admin/examiner/queue/:id/review  → approve (with optional modifications)
router.post("/examiner/queue/:id/review", authMiddleware, examinerMiddleware, AdminController.reviewProposal);

module.exports = router;
