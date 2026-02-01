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
    console.log('🔍 FileFilter - Processing file:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        encoding: file.encoding,
    });

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
        console.log('✅ FileFilter - File type allowed');
        cb(null, true);
    } else {
        console.log('❌ FileFilter - File type NOT allowed:', file.mimetype);
        cb(new Error("Invalid file type. Only images and documents are allowed."));
    }
};

const upload = multer({ storage, fileFilter });

// Debug middleware to log incoming requests
router.use((req, res, next) => {
    if (req.method === 'PUT' || req.method === 'POST') {
        console.log('\n📨 INCOMING REQUEST:', {
            method: req.method,
            path: req.path,
            contentType: req.get('content-type'),
        });
    }
    next();
});

// Get user profile
router.get("/", authenticateToken, ProfileController.getProfile);

// Update user profile with debug logging
router.put("/", authenticateToken, (req, res, next) => {
    console.log('\n🔧 DEBUG: Before multer.single()');
    console.log('Content-Type:', req.get('content-type'));
    console.log('Content-Length:', req.get('content-length'));
    console.log('Request method:', req.method);
    console.log('Request path:', req.path);
    next();
}, upload.single("profileImage"), (req, res, next) => {
    console.log('\n✅ DEBUG: After multer.single()');
    console.log('req.file exists:', !!req.file);
    if (req.file) {
        console.log('✓ File received');
        console.log('File details:', {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            encoding: req.file.encoding,
            size: req.file.size,
            path: req.file.path,
        });
    } else {
        console.log('✗ NO FILE RECEIVED - Checking body...');
        console.log('req.body:', JSON.stringify(req.body, null, 2));
    }
    console.log('req.body fields:', Object.keys(req.body));
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

module.exports = router;
