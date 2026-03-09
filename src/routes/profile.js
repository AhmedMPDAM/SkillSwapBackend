const express = require("express");
const multer = require("multer");
const path = require("path");
const ProfileController = require("../controller/Profile");
const RatingController = require("../controller/Rating");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../../uploads"));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const fileFilter = (req, file, cb) => {

    const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only images and documents are allowed."));
    }
};

const upload = multer({ storage, fileFilter });

// Debug middleware to log incoming requests
router.use((req, res, next) => {
    next();
});

// Get user profile
router.get("/", authenticateToken, ProfileController.getProfile);

// Update user profile with debug logging
router.put("/", authenticateToken, (req, res, next) => {
    next();
}, upload.single("profileImage"), (req, res, next) => {
    if (req.file) {

    } else {

    }
    next();
}, (err, req, res, next) => {
    // Multer error handler
    if (err instanceof multer.MulterError) {
        console.error('❌ Multer Error:', err.message);
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large' });
        }
        return res.status(400).json({ message: err.message });
    } else if (err) {
        console.error('❌ File Upload Error:', err.message);
        return res.status(400).json({ message: err.message });
    }
    next();
}, ProfileController.updateProfile);

// Add certificate
router.post("/certificates", authenticateToken, upload.single("document"), ProfileController.addCertificate);

// Update certificate
router.put("/certificates/:certificateId", authenticateToken, upload.single("document"), ProfileController.updateCertificate);

// Delete certificate
router.delete("/certificates/:certificateId", authenticateToken, ProfileController.deleteCertificate);

// ── Stats & Reputation ──────────────────────────────────────────────────────
// Get own stats (avg rating, badges, completed exchanges)
router.get("/stats", authenticateToken, RatingController.getMyStats);

// Credit history
router.get("/credits/history", authenticateToken, RatingController.getCreditHistory);

// Ratings
router.get("/ratings/received", authenticateToken, RatingController.getReceivedRatings);
router.get("/ratings/given", authenticateToken, RatingController.getGivenRatings);
router.post("/ratings", authenticateToken, RatingController.createRating);

// Public profile (view another user's profile with stats, ratings, badges)
router.get("/:userId/public", authenticateToken, RatingController.getPublicProfile);

module.exports = router;

