const User = require("../models/user");
const ExchangeRequest = require("../models/exchangeRequest");

class AdminController {
    async getStats(req, res, next) {
        try {
            const users = await User.countDocuments();
            const credits = await User.aggregate([
                { $group: { _id: null, total: { $sum: "$credits" } } },
            ]);
            const totalCredits = credits.length > 0 ? credits[0].total : 0;

            const requests = await ExchangeRequest.countDocuments();

            res.status(200).json({
                users,
                totalCredits,
                requests,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AdminController();
