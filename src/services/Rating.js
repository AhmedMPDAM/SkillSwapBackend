const Rating = require("../models/rating");
const ExchangeRequest = require("../models/exchangeRequest");
const ExchangeProposal = require("../models/exchangeProposal");

// ── Badge milestone thresholds ──────────────────────────────────────────────
const BADGE_MILESTONES = [
    { threshold: 5, label: "Rising Star", icon: "star-outline" },
    { threshold: 10, label: "Trusted Trader", icon: "shield-checkmark-outline" },
    { threshold: 25, label: "Expert Exchanger", icon: "trophy-outline" },
    { threshold: 50, label: "Master Swapper", icon: "diamond-outline" },
    { threshold: 100, label: "Legend", icon: "flame-outline" },
];

class RatingService {
    /**
     * Create a rating for a completed exchange.
     * The rater is the request owner; the rated user is the proposer.
     */
    async createRating({ raterId, ratedUserId, proposalId, exchangeRequestId, stars, comment }) {
        // Validate stars
        if (!stars || stars < 1 || stars > 5) {
            throw new Error("Rating must be between 1 and 5 stars");
        }

        // Validate comment length
        if (comment && comment.length > 500) {
            throw new Error("Comment cannot exceed 500 characters");
        }

        // Check if rating already exists for this exchange by this rater
        const existing = await Rating.findOne({ raterId, exchangeRequestId });
        if (existing) {
            throw new Error("You have already rated this exchange");
        }

        // Verify the exchange is completed
        const request = await ExchangeRequest.findById(exchangeRequestId).lean();
        if (!request || request.status !== "completed") {
            throw new Error("You can only rate completed exchanges");
        }

        const rating = await Rating.create({
            exchangeRequestId,
            proposalId,
            raterId,
            ratedUserId,
            stars,
            comment: comment || "",
        });

        return rating;
    }

    /**
     * Get all ratings received by a user (paginated, newest first)
     */
    async getUserRatingsReceived(userId, limit = 50, skip = 0) {
        return await Rating.find({ ratedUserId: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("raterId", "fullName profileImage")
            .populate("exchangeRequestId", "title")
            .lean();
    }

    /**
     * Get all ratings given by a user (paginated)
     */
    async getUserRatingsGiven(userId, limit = 50, skip = 0) {
        return await Rating.find({ raterId: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("ratedUserId", "fullName profileImage")
            .populate("exchangeRequestId", "title")
            .lean();
    }

    /**
     * Calculate the average rating (stars) for a user
     */
    async getUserAverageRating(userId) {
        const mongoose = require("mongoose");
        const result = await Rating.aggregate([
            { $match: { ratedUserId: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    average: { $avg: "$stars" },
                    count: { $sum: 1 },
                },
            },
        ]);

        if (result.length === 0) {
            return { average: 0, count: 0 };
        }

        return {
            average: Math.round(result[0].average * 10) / 10, // 1 decimal
            count: result[0].count,
        };
    }

    /**
     * Count completed exchanges for a user (as proposer or request owner)
     */
    async getCompletedExchangeCount(userId) {
        const mongoose = require("mongoose");
        const uid = new mongoose.Types.ObjectId(userId);

        // Count as request owner
        const asOwner = await ExchangeRequest.countDocuments({
            userId: uid,
            status: "completed",
        });

        // Count as proposer (proposals that are in a completed request)
        const asProposer = await ExchangeProposal.countDocuments({
            proposerId: uid,
            status: { $in: ["accepted", "examiner_approved"] },
        });

        // To avoid double-counting, only count proposals whose request is actually completed
        const completedAsProposer = await ExchangeProposal.aggregate([
            {
                $match: {
                    proposerId: uid,
                    status: { $in: ["accepted", "examiner_approved"] },
                },
            },
            {
                $lookup: {
                    from: "exchangerequests",
                    localField: "exchangeRequestId",
                    foreignField: "_id",
                    as: "request",
                },
            },
            { $unwind: "$request" },
            { $match: { "request.status": "completed" } },
            { $count: "total" },
        ]);

        const proposerCount = completedAsProposer.length > 0 ? completedAsProposer[0].total : 0;

        return asOwner + proposerCount;
    }

    /**
     * Get badges earned based on completed exchange count
     */
    getBadgesForCount(completedCount) {
        return BADGE_MILESTONES.filter((b) => completedCount >= b.threshold);
    }

    /**
     * Get full user stats: average rating, completed exchanges, badges
     */
    async getUserStats(userId) {
        const [ratingInfo, completedCount] = await Promise.all([
            this.getUserAverageRating(userId),
            this.getCompletedExchangeCount(userId),
        ]);

        const badges = this.getBadgesForCount(completedCount);

        // Next badge info
        const nextBadge = BADGE_MILESTONES.find((b) => completedCount < b.threshold) || null;

        return {
            averageRating: ratingInfo.average,
            totalRatings: ratingInfo.count,
            completedExchanges: completedCount,
            badges,
            nextBadge: nextBadge
                ? {
                    ...nextBadge,
                    remaining: nextBadge.threshold - completedCount,
                }
                : null,
        };
    }
}

module.exports = new RatingService();
