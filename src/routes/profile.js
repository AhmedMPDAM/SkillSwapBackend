const express = require("express");
const multer = require("multer");
const path = require("path");
const ProfileController = require("../controller/Profile");
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

// Get user profile
router.get("/", authenticateToken, ProfileController.getProfile);

// Update user profile
router.put("/", authenticateToken, upload.single("profileImage"), ProfileController.updateProfile);

// Add certificate
router.post("/certificates", authenticateToken, upload.single("document"), ProfileController.addCertificate);

// Update certificate
router.put("/certificates/:certificateId", authenticateToken, upload.single("document"), ProfileController.updateCertificate);

// Delete certificate
router.delete("/certificates/:certificateId", authenticateToken, ProfileController.deleteCertificate);

module.exports = router;
