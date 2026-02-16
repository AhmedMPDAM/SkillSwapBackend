const ExchangeRequest = require("../models/exchangeRequest");
const ExchangeProposal = require("../models/exchangeProposal");

class MarketplaceRepository {
    /**
     * Create a new exchange request
     */
    async createRequest(requestData) {
        return await ExchangeRequest.create(requestData);
    }

    /**
     * Get request by ID with populated user
     */
    async getRequestById(requestId) {
        return await ExchangeRequest.findById(requestId)
            .populate("userId", "fullName profileImage location skills")
            .populate("selectedProposal")
            .populate({
                path: "proposals",
                populate: {
                    path: "proposerId",
                    select: "fullName profileImage location skills",
                },
            })
            .lean();
    }

    /**
     * Find requests with optional query, sorting, pagination
     */
    async findRequests(query, sort = { createdAt: -1 }, skip = 0, limit = 10) {
        return await ExchangeRequest.find(query)
            .populate("userId", "fullName profileImage location")
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();
    }

    /**
     * Count requests with optional query
     */
    async countRequests(query) {
        return await ExchangeRequest.countDocuments(query);
    }

    /**
     * Update request by ID with optional update data
     */
    async updateRequest(requestId, updateData) {
        return await ExchangeRequest.findByIdAndUpdate(
            requestId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).lean();
    }

    async updateRequestRaw(requestId, updateQuery) {
        return await ExchangeRequest.findByIdAndUpdate(
            requestId,
            updateQuery,
            { new: true, runValidators: true }
        ).lean();
    }

    /**
     * Delete request by ID
     */
    async deleteRequest(requestId) {
        return await ExchangeRequest.findByIdAndDelete(requestId).lean();
    }

    /**
     * Create a new exchange proposal
     */
    async createProposal(proposalData) {
        return await ExchangeProposal.create(proposalData);
    }

    /**
     * Get proposal by ID with populated exchange request and proposer
     */
    async getProposalById(proposalId) {
        return await ExchangeProposal.findById(proposalId)
            .populate("exchangeRequestId", "title description userId")
            .populate("proposerId", "fullName profileImage location skills")
            .lean();
    }

    /**
     * Find proposals with optional query, sorting, pagination
     */
    async findProposals(query, sort = { createdAt: -1 }, skip = 0, limit = 10) {
        return await ExchangeProposal.find(query)
            .populate("proposerId", "fullName profileImage location skills")
            .populate("exchangeRequestId", "title description status userId")
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();
    }

    /**
     * Count proposals with optional query
     */
    async countProposals(query) {
        return await ExchangeProposal.countDocuments(query);
    }

    /**
     * Update proposal by ID with optional update data
     */
    async updateProposal(proposalId, updateData) {
        return await ExchangeProposal.findByIdAndUpdate(
            proposalId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).lean();
    }

    async updateManyProposals(query, update) {
        return await ExchangeProposal.updateMany(query, { $set: update });
    }
}

module.exports = MarketplaceRepository;
