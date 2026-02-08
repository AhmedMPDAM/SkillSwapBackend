const Category = require("../models/category");

class CategoryController {
    async getAll(req, res, next) {
        try {
            const categories = await Category.find();
            res.status(200).json(categories);
        } catch (error) {
            next(error);
        }
    }

    async create(req, res, next) {
        try {
            const { name, subcategories } = req.body;
            const category = await Category.create({ name, subcategories });
            res.status(201).json(category);
        } catch (error) {
            next(error);
        }
    }

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            await Category.findByIdAndDelete(id);
            res.status(200).json({ message: "Category deleted" });
        } catch (error) {
            next(error);
        }
    }

    async addSubcategory(req, res, next) {
        try {
            const { id } = req.params;
            const { subcategory } = req.body;
            const category = await Category.findByIdAndUpdate(
                id,
                { $addToSet: { subcategories: subcategory } },
                { new: true }
            );
            res.status(200).json(category);
        } catch (error) {
            next(error);
        }
    }

    async removeSubcategory(req, res, next) {
        try {
            const { id } = req.params;
            const { subcategory } = req.body;
            const category = await Category.findByIdAndUpdate(
                id,
                { $pull: { subcategories: subcategory } },
                { new: true }
            );
            res.status(200).json(category);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new CategoryController();
