const ExchangeRequest = require("../models/exchangeRequest");
const ExchangeProposal = require("../models/exchangeProposal");

class MarketplaceRepository {
    /**
     * Create a new exchange request
     */
    async createRequest(requestData) {
        return ExchangeRequest.create(requestData);
    }

    /**
     * Get request by ID with populated user
     */
    async getRequestById(requestId) {
        return ExchangeRequest.findById(requestId)
            .populate("userId", "fullName profileImage location skills")
            .populate("selectedProposal")
            .populate({
                path: "proposals",
                populate: {
                    path: "proposerId",
                    select: "fullName profileImage location skills",
                },
            });
    }

    /**
     * Get feed of requests with pagination
     */
    async getFeed(page = 1, limit = 10, filters = {}) {
        const skip = (page - 1) * limit;
        const query = { status: "open", ...filters };

        const requests = await ExchangeRequest.find(query)
            .populate("userId", "fullName profileImage location")
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await ExchangeRequest.countDocuments(query);

        return {
            requests,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Search requests with advanced filters
     */
    async searchRequests(searchQuery, filters = {}, page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const query = { status: "open" };

        // Text search
        if (searchQuery) {
            query.$text = { $search: searchQuery };
        }

        // Apply filters
        if (filters.skillSearched) {
            query.skillSearched = { $regex: filters.skillSearched, $options: "i" };
        }
        if (filters.category) {
            query.category = filters.category;
        }
        if (filters.level) {
            query.level = filters.level;
        }
        if (filters.location) {
            query.location = { $regex: filters.location, $options: "i" };
        }
        if (filters.minCredits !== undefined) {
            query.estimatedCredits = { $gte: filters.minCredits };
        }
        if (filters.maxCredits !== undefined) {
            query.estimatedCredits = {
                ...query.estimatedCredits,
                $lte: filters.maxCredits,
            };
        }
        if (filters.deadline) {
            query.desiredDeadline = { $lte: new Date(filters.deadline) };
        }

        const requests = await ExchangeRequest.find(query)
            .populate("userId", "fullName profileImage location")
            .sort(searchQuery ? { score: { $meta: "textScore" } } : { createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await ExchangeRequest.countDocuments(query);

        return {
            requests,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get user's requests
     */
    async getUserRequests(userId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const requests = await ExchangeRequest.find({ userId })
            .populate("selectedProposal")
            .populate({
                path: "proposals",
                populate: {
                    path: "proposerId",
                    select: "fullName profileImage location",
                },
            })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await ExchangeRequest.countDocuments({ userId });

        return {
            requests,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Update request
     */
    async updateRequest(requestId, updateData) {
        return ExchangeRequest.findByIdAndUpdate(
            requestId,
            updateData,
            { new: true, runValidators: true }
        );
    }

    /**
     * Delete request
     */
    async deleteRequest(requestId) {
        return ExchangeRequest.findByIdAndDelete(requestId);
    }

    /**
     * Increment view count
     */
    async incrementViews(requestId) {
        return ExchangeRequest.findByIdAndUpdate(
            requestId,
            { $inc: { views: 1 } },
            { new: true }
        );
    }

    /**
     * Create a proposal
     */
    async createProposal(proposalData) {
        const proposal = await ExchangeProposal.create(proposalData);
        
        // Add proposal to request
        await ExchangeRequest.findByIdAndUpdate(
            proposalData.exchangeRequestId,
            { $push: { proposals: proposal._id } }
        );

        return proposal;
    }

    /**
     * Get proposal by ID
     */
    async getProposalById(proposalId) {
        return ExchangeProposal.findById(proposalId)
            .populate("exchangeRequestId", "title description userId")
            .populate("proposerId", "fullName profileImage location skills");
    }

    /**
     * Get proposals for a request
     */
    async getRequestProposals(requestId) {
        return ExchangeProposal.find({ exchangeRequestId: requestId })
            .populate("proposerId", "fullName profileImage location skills")
            .sort({ createdAt: -1 });
    }

    /**
     * Get user's proposals
     */
    async getUserProposals(userId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const proposals = await ExchangeProposal.find({ proposerId: userId })
            .populate("exchangeRequestId", "title description status userId")
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await ExchangeProposal.countDocuments({ proposerId: userId });

        return {
            proposals,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Update proposal
     */
    async updateProposal(proposalId, updateData) {
        return ExchangeProposal.findByIdAndUpdate(
            proposalId,
            updateData,
            { new: true, runValidators: true }
        );
    }

    /**
     * Accept a proposal (reject others automatically)
     */
    async acceptProposal(requestId, proposalId) {
        // Reject all other proposals for this request
        await ExchangeProposal.updateMany(
            {
                exchangeRequestId: requestId,
                _id: { $ne: proposalId },
                status: "pending",
            },
            { status: "rejected" }
        );

        // Accept the selected proposal
        const proposal = await ExchangeProposal.findByIdAndUpdate(
            proposalId,
            { status: "accepted" },
            { new: true }
        );

        // Update request status and selected proposal
        await ExchangeRequest.findByIdAndUpdate(requestId, {
            status: "in_progress",
            selectedProposal: proposalId,
        });

        return proposal;
    }
}

module.exports = new MarketplaceRepository();

