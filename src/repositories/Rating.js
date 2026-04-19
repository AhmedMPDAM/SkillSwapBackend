const mongoose = require("mongoose");
const Rating = require("../models/rating");
const ExchangeRequest = require("../models/exchangeRequest");
const ExchangeProposal = require("../models/exchangeProposal");

class RatingRepository {
    /**
     * Find one rating matching a query
     */
    async findOne(query) {
        return await Rating.findOne(query).lean();
    }

    /**
     * Create a new rating
     */
    async createRating(data) {
        return await Rating.create(data);
    }

    /**
     * Get ratings received by a user, paginated
     */
    async getRatingsReceived(userId, limit = 50, skip = 0) {
        return await Rating.find({ ratedUserId: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("raterId", "fullName profileImage")
            .populate("exchangeRequestId", "title")
            .lean();
    }

    /**
     * Get ratings given by a user, paginated
     */
    async getRatingsGiven(userId, limit = 50, skip = 0) {
        return await Rating.find({ raterId: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("ratedUserId", "fullName profileImage")
            .populate("exchangeRequestId", "title")
            .lean();
    }

    /**
     * Aggregate average rating for a user
     */
    async getAverageRating(userId) {
        return await Rating.aggregate([
            { $match: { ratedUserId: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    average: { $avg: "$stars" },
                    count: { $sum: 1 },
                },
            },
        ]);
    }

    /**
     * Aggregate the full top-rated pipeline with an optional minRating filter
     */
    async aggregateTopRated(minRating) {
        const pipeline = [
            {
                $group: {
                    _id: "$ratedUserId",
                    averageRating: { $avg: "$stars" },
                    totalRatings: { $sum: 1 },
                },
            },
        ];

        if (minRating) {
            pipeline.push({ $match: { averageRating: { $gte: parseFloat(minRating) } } });
        }

        pipeline.push({ $sort: { averageRating: -1, totalRatings: -1 } });

        return await Rating.aggregate(pipeline);
    }

    /**
     * Count completed exchange requests for a user as owner
     */
    async countCompletedAsOwner(userId) {
        return await ExchangeRequest.countDocuments({
            userId: new mongoose.Types.ObjectId(userId),
            status: "completed",
        });
    }

    /**
     * Count completed exchanges for a user as proposer (avoids double-counting)
     */
    async countCompletedAsProposer(userId) {
        const result = await ExchangeProposal.aggregate([
            {
                $match: {
                    proposerId: new mongoose.Types.ObjectId(userId),
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
        return result.length > 0 ? result[0].total : 0;
    }

    /**
     * Get categories each user participated in as owner (completed requests)
     */
    async getCategoriesAsOwner(userIds) {
        return await ExchangeRequest.aggregate([
            { $match: { status: "completed", userId: { $in: userIds } } },
            { $group: { _id: "$userId", categories: { $addToSet: "$category" } } },
        ]);
    }

    /**
     * Get categories each user participated in as proposer
     */
    async getCategoriesAsProposer(userIds) {
        return await ExchangeProposal.aggregate([
            {
                $match: {
                    proposerId: { $in: userIds },
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
            { $group: { _id: "$proposerId", categories: { $addToSet: "$request.category" } } },
        ]);
    }

    /**
     * Find an exchange request by ID
     */
    async findRequestById(requestId) {
        return await ExchangeRequest.findById(requestId).lean();
    }
}

module.exports = RatingRepository;
