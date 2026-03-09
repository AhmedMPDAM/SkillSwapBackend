const RatingService = require("../services/Rating");
const CreditService = require("../services/Credit");

class RatingController {
    /**
     * Submit a rating for a completed exchange
     * POST /api/profile/ratings
     */
    async createRating(req, res, next) {
        try {
            const { ratedUserId, proposalId, exchangeRequestId, stars, comment } = req.body;

            if (!ratedUserId || !proposalId || !exchangeRequestId || !stars) {
                return res.status(400).json({
                    message: "ratedUserId, proposalId, exchangeRequestId, and stars are required",
                });
            }

            if (stars < 1 || stars > 5) {
                return res.status(400).json({ message: "Stars must be between 1 and 5" });
            }

            if (comment && comment.length > 500) {
                return res.status(400).json({ message: "Comment cannot exceed 500 characters" });
            }

            const rating = await RatingService.createRating({
                raterId: req.user.id,
                ratedUserId,
                proposalId,
                exchangeRequestId,
                stars,
                comment,
            });

            res.status(201).json({ message: "Rating submitted successfully", rating });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get ratings received by the authenticated user
     * GET /api/profile/ratings/received
     */
    async getReceivedRatings(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const skip = parseInt(req.query.skip) || 0;
            const ratings = await RatingService.getUserRatingsReceived(req.user.id, limit, skip);
            res.status(200).json({ ratings });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get ratings given by the authenticated user
     * GET /api/profile/ratings/given
     */
    async getGivenRatings(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const skip = parseInt(req.query.skip) || 0;
            const ratings = await RatingService.getUserRatingsGiven(req.user.id, limit, skip);
            res.status(200).json({ ratings });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get authenticated user's stats (avg rating, badges, completed exchanges)
     * GET /api/profile/stats
     */
    async getMyStats(req, res, next) {
        try {
            const stats = await RatingService.getUserStats(req.user.id);
            res.status(200).json(stats);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get another user's public profile with stats
     * GET /api/profile/:userId/public
     */
    async getPublicProfile(req, res, next) {
        try {
            const { userId } = req.params;

            const UserRepositoryClass = require("../repositories/Auth");
            const userRepository = new UserRepositoryClass();

            const user = await userRepository.findById(userId);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            // Get stats
            const stats = await RatingService.getUserStats(userId);

            // Get recent ratings received
            const recentRatings = await RatingService.getUserRatingsReceived(userId, 10, 0);

            // Get credit history is private, so don't include it

            // Remove sensitive fields
            delete user.password;
            delete user.email;

            res.status(200).json({
                user,
                stats,
                recentRatings,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get credit history for the authenticated user
     * GET /api/profile/credits/history
     */
    async getCreditHistory(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const skip = parseInt(req.query.skip) || 0;
            const history = await CreditService.getCreditHistory(req.user.id, limit, skip);
            res.status(200).json({ history });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new RatingController();
