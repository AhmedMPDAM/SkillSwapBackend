const express = require("express");
const router = express.Router();
const CategoryController = require("../controller/Category");
const authMiddleware = require("../middleware/auth");
const adminMiddleware = require("../middleware/admin");

router.get("/", CategoryController.getAll);
router.post("/", authMiddleware, adminMiddleware, CategoryController.create);
router.delete("/:id", authMiddleware, adminMiddleware, CategoryController.delete);
router.post("/:id/subcategory", authMiddleware, adminMiddleware, CategoryController.addSubcategory);
router.delete("/:id/subcategory", authMiddleware, adminMiddleware, CategoryController.removeSubcategory);

module.exports = router;
