const User = require("../models/user");
const ExchangeRequest = require("../models/exchangeRequest");
const ExchangeProposal = require("../models/exchangeProposal");
const Rating = require("../models/rating");
const CreditHistory = require("../models/creditHistory");

class AdminRepository {
    // ── Stats ─────────────────────────────────────────────────────────────────
    async countUsers(query = {}) {
        return User.countDocuments(query);
    }

    async sumAllCredits() {
        const result = await User.aggregate([
            { $group: { _id: null, total: { $sum: "$credits" } } },
        ]);
        return result.length > 0 ? result[0].total : 0;
    }

    async countRequests(query = {}) {
        return ExchangeRequest.countDocuments(query);
    }

    async countProposals(query = {}) {
        return ExchangeProposal.countDocuments(query);
    }

    // ── Users ─────────────────────────────────────────────────────────────────
    async findUsers(query, { skip, limit }) {
        return User.find(query)
            .select("fullName email profileImage role credits skills location createdAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
    }

    async findUserById(id) {
        return User.findById(id).select("-password").lean();
    }

    // ── Exchange Requests ─────────────────────────────────────────────────────
    async findExchanges(query, { skip, limit }) {
        return ExchangeRequest.find(query)
            .populate("userId", "fullName email profileImage")
            .populate("selectedProposal", "proposerId status")
            .select("title description skillSearched category level status estimatedCredits lockedCredits complexity estimatedDuration desiredDeadline views createdAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
    }

    async findExchangeById(id) {
        return ExchangeRequest.findById(id)
            .populate("userId", "fullName email profileImage credits role")
            .populate({
                path: "selectedProposal",
                populate: { path: "proposerId", select: "fullName email profileImage credits" },
            })
            .lean();
    }

    async updateExchange(id, updateData) {
        return ExchangeRequest.findByIdAndUpdate(id, { $set: updateData }, { new: true }).lean();
    }

    async getExchangeStatusCounts() {
        return {
            all: await ExchangeRequest.countDocuments(),
            open: await ExchangeRequest.countDocuments({ status: "open" }),
            in_progress: await ExchangeRequest.countDocuments({ status: "in_progress" }),
            completed: await ExchangeRequest.countDocuments({ status: "completed" }),
            cancelled: await ExchangeRequest.countDocuments({ status: "cancelled" }),
        };
    }

    // ── Proposals ─────────────────────────────────────────────────────────────
    async findProposalsForExchange(exchangeId) {
        return ExchangeProposal.find({ exchangeRequestId: exchangeId })
            .populate("proposerId", "fullName email profileImage")
            .populate("examinerReview.examinerId", "fullName email")
            .sort({ createdAt: -1 })
            .lean();
    }

    async findProposals(query, { skip = 0, limit = 20 } = {}) {
        return ExchangeProposal.find(query)
            .populate("exchangeRequestId", "title status estimatedCredits")
            .select("status acceptanceType createdAt exchangeRequestId")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
    }

    async findProposalsByStatus(status, sort = { createdAt: 1 }) {
        return ExchangeProposal.find({ status })
            .populate("proposerId", "fullName email profileImage")
            .populate({
                path: "exchangeRequestId",
                select: "title description skillSearched estimatedCredits complexity estimatedDuration category level whatYouOffer desiredDeadline",
                populate: { path: "userId", select: "fullName email profileImage" },
            })
            .sort(sort)
            .lean();
    }

    async findProposalByIdForReview(id) {
        return ExchangeProposal.findById(id)
            .populate("proposerId", "fullName email profileImage credits")
            .populate({
                path: "exchangeRequestId",
                select: "title description skillSearched estimatedCredits complexity estimatedDuration category level whatYouOffer desiredDeadline location status",
                populate: { path: "userId", select: "fullName email profileImage credits" },
            })
            .lean();
    }

    async findProposalForApproval(id) {
        return ExchangeProposal.findById(id)
            .populate("proposerId", "fullName email")
            .populate({
                path: "exchangeRequestId",
                populate: { path: "userId", select: "fullName email" },
            });
    }

    async updateProposal(id, updateData) {
        return ExchangeProposal.findByIdAndUpdate(id, { $set: updateData }, { new: true }).lean();
    }

    // ── Ratings ───────────────────────────────────────────────────────────────
    async findRatingsForExchange(exchangeId) {
        return Rating.find({ exchangeRequestId: exchangeId })
            .populate("raterId", "fullName profileImage")
            .populate("ratedUserId", "fullName profileImage")
            .lean();
    }

    async findRatingsForUser(userId, limit = 10) {
        return Rating.find({ ratedUserId: userId })
            .populate("raterId", "fullName profileImage")
            .populate("exchangeRequestId", "title")
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }

    async aggregateUserRating(userId) {
        const result = await Rating.aggregate([
            { $match: { ratedUserId: userId } },
            { $group: { _id: null, avg: { $avg: "$stars" }, count: { $sum: 1 } } },
        ]);
        return result.length > 0 ? result[0] : { avg: 0, count: 0 };
    }

    // ── Credit History ────────────────────────────────────────────────────────
    async findCreditHistory(userId, limit = 15) {
        return CreditHistory.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
    }
}

module.exports = new AdminRepository();
