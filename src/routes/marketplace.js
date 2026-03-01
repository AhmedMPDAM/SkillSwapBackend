const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const MarketplaceController = require("../controller/Marketplace");
const SubmissionController = require("../controller/Submission");
const authMiddleware = require("../middleware/auth");

// ── Multer config for work submissions ────────────────────────────────────────
const submissionStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../../uploads"));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "submission-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const submissionFileFilter = (req, file, cb) => {
    const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/x-rar-compressed",
        "text/plain",
        "text/csv",
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Allowed: images, documents, spreadsheets, presentations, archives, and text files."));
    }
};

const submissionUpload = multer({
    storage: submissionStorage,
    fileFilter: submissionFileFilter,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
});

// All routes require authentication
router.use(authMiddleware);

// Exchange Requests
router.post("/requests", MarketplaceController.createRequest);
router.get("/requests/feed", MarketplaceController.getFeed);
router.get("/requests/search", MarketplaceController.searchRequests);
router.get("/requests/my", MarketplaceController.getUserRequests);
router.get("/requests/:id", MarketplaceController.getRequestById);
router.put("/requests/:id", MarketplaceController.updateRequest);
router.delete("/requests/:id", MarketplaceController.deleteRequest);
router.get("/requests/:id/proposals", MarketplaceController.getRequestProposals);
router.post("/requests/:id/complete", MarketplaceController.completeExchange);

// Submissions (work submission & review)
router.post("/requests/:id/submissions", submissionUpload.single("file"), SubmissionController.submitWork);
router.get("/requests/:id/submissions", SubmissionController.getSubmissions);
router.post("/submissions/:id/request-revision", SubmissionController.requestRevision);
router.post("/submissions/:id/approve", SubmissionController.approveSubmission);

// Proposals
router.post("/proposals", MarketplaceController.createProposal);
router.get("/proposals/my", MarketplaceController.getUserProposals);
router.post("/proposals/:id/accept", MarketplaceController.acceptProposal);
router.post("/proposals/:id/reject", MarketplaceController.rejectProposal);

// Credits
router.post("/calculate-credits", MarketplaceController.calculateCredits);
router.get("/credits/history", MarketplaceController.getCreditHistory);

module.exports = router;

