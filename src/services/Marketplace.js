const MarketplaceRepositoryClass = require("../repositories/Marketplace");
const marketplaceRepository = new MarketplaceRepositoryClass();
const CreditService = require("./Credit");
const socketUtil = require("../utils/socket");

class MarketplaceService {
    /**
     * Create a new exchange request
     */
    async createRequest(userId, requestData) {
        const {
            title,
            description,
            skillSearched,
            category,
            level,
            whatYouOffer,
            estimatedDuration,
            desiredDeadline,
            complexity,
            location,
        } = requestData;

        // Validate required fields
        if (!title || !description || !skillSearched || !category || !level ||
            !whatYouOffer || !estimatedDuration || !desiredDeadline) {
            throw new Error("All required fields must be provided");
        }

        // Validate deadline is in the future
        if (new Date(desiredDeadline) <= new Date()) {
            throw new Error("Deadline must be in the future");
        }

        // Calculate estimated credits
        const estimatedCredits = CreditService.calculateCredits(
            estimatedDuration,
            complexity || "moyen"
        );

        // Create request
        const request = await marketplaceRepository.createRequest({
            userId,
            title,
            description,
            skillSearched,
            category,
            level,
            whatYouOffer,
            estimatedDuration,
            desiredDeadline: new Date(desiredDeadline),
            estimatedCredits,
            complexity: complexity || "moyen",
            location: location || "",
            status: "open",
        });

        return request;
    }

    /**
     * Get request by ID and increment views
     */
    async getRequestById(requestId, incrementViews = true) {
        const request = await marketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        if (incrementViews) {
            await marketplaceRepository.updateRequestRaw(requestId, { $inc: { views: 1 } });
        }

        return request;
    }

    /**
     * Get feed of requests
     */
    async getFeed(page = 1, limit = 10, filters = {}) {
        const skip = (page - 1) * limit;
        const query = { status: { $in: ["open", "in_progress"] }, ...filters };

        const requests = await marketplaceRepository.findRequests(query, { createdAt: -1 }, skip, limit);
        const total = await marketplaceRepository.countRequests(query);

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
     * Search requests with filters
     */
    async searchRequests(searchQuery, filters = {}, page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const query = { status: { $in: ["open", "in_progress"] } };

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

        const sort = searchQuery ? { score: { $meta: "textScore" } } : { createdAt: -1 };

        const requests = await marketplaceRepository.findRequests(query, sort, skip, limit);
        const total = await marketplaceRepository.countRequests(query);

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
        const query = { userId };
        const requests = await marketplaceRepository.findRequests(query, { createdAt: -1 }, skip, limit);
        const total = await marketplaceRepository.countRequests(query);

        return {
            requests,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        };
    }

    /**
     * Update request (only by owner)
     */
    async updateRequest(requestId, userId, updateData) {
        const request = await marketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        // Handle populated userId
        const requestUserId = request.userId._id ? request.userId._id.toString() : request.userId.toString();

        if (requestUserId !== userId) {
            throw new Error("Unauthorized: You can only update your own requests");
        }

        if (request.status !== "open") {
            throw new Error("You can only update open requests");
        }

        // Recalculate credits if duration or complexity changed
        if (updateData.estimatedDuration || updateData.complexity) {
            const duration = updateData.estimatedDuration || request.estimatedDuration;
            const complexity = updateData.complexity || request.complexity;
            updateData.estimatedCredits = CreditService.calculateCredits(duration, complexity);
        }

        // Convert deadline string to Date if provided
        if (updateData.desiredDeadline) {
            updateData.desiredDeadline = new Date(updateData.desiredDeadline);
        }

        return marketplaceRepository.updateRequest(requestId, updateData);
    }

    /**
     * Delete request (only by owner)
     */
    async deleteRequest(requestId, userId) {
        const request = await marketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        const requestUserId = request.userId._id ? request.userId._id.toString() : request.userId.toString();

        if (requestUserId !== userId) {
            throw new Error("Unauthorized: You can only delete your own requests");
        }

        return marketplaceRepository.deleteRequest(requestId);
    }

    /**
     * Create a proposal
     */
    async createProposal(userId, requestId, proposalData) {
        const { coverLetter, acceptanceType } = proposalData;

        // Validate required fields with specific messages
        if (!coverLetter || !coverLetter.trim()) {
            throw new Error("Cover letter is required");
        }

        if (!acceptanceType || acceptanceType.trim() === '') {
            throw new Error("Acceptance type is required");
        }

        if (!['accept_deal', 'admin_quantification'].includes(acceptanceType)) {
            throw new Error("Invalid acceptance type. Must be 'accept_deal' or 'admin_quantification'");
        }

        // Check if request exists and is open
        const request = await marketplaceRepository.getRequestById(requestId);
        if (!request) {
            throw new Error("Request not found");
        }

        if (request.status !== "open") {
            throw new Error("You can only propose on open requests");
        }

        const requestUserId = request.userId._id ? request.userId._id.toString() : request.userId.toString();

        // Check if user is not the request owner
        if (requestUserId === userId) {
            throw new Error("You cannot propose on your own request");
        }

        // Check if user already has a pending proposal
        const existingProposals = await marketplaceRepository.findProposals({ exchangeRequestId: requestId });
        const hasPendingProposal = existingProposals.some(
            (p) => (p.proposerId._id ? p.proposerId._id.toString() : p.proposerId.toString()) === userId && (p.status === "pending" || p.status === "admin_processing")
        );

        if (hasPendingProposal) {
            throw new Error("You already have a pending proposal for this request");
        }

        // Determine status and cost based on acceptance type
        let status = "pending";
        let admin_quantification_cost = 0;

        if (acceptanceType === "admin_quantification") {
            status = "admin_processing";
            admin_quantification_cost = 4; // 4 credits cost for admin verification
        } else if (acceptanceType === "accept_deal") {
            status = "accepted"; // Immediately accept
        }

        // Create proposal
        const proposal = await marketplaceRepository.createProposal({
            exchangeRequestId: requestId,
            proposerId: userId,
            coverLetter,
            acceptanceType,
            admin_quantification_cost,
            status,
        });

        // Add proposal to request
        await marketplaceRepository.updateRequestRaw(requestId, { $push: { proposals: proposal._id } });

        // If accept_deal, update request status to in_progress and set selected proposal
        if (acceptanceType === "accept_deal") {
            await marketplaceRepository.updateRequest(requestId, {
                status: "in_progress",
                selectedProposal: proposal._id,
            });

            // Deduct estimated credits from request owner
            await CreditService.deductCredits(
                requestUserId,
                request.estimatedCredits,
                `Acceptation immédiate de proposition pour: ${request.title}`,
                requestId,
                proposal._id
            );
        }

        // Notify the request owner via Socket.io
        try {
            const io = socketUtil.getIo();
            io.to(requestUserId).emit("notification", {
                type: "proposal_received",
                message: `New proposal for your request: ${request.title}`,
                requestId: requestId,
                proposalId: proposal._id,
                proposerId: userId
            });
            console.log(`Notification sent to user ${requestUserId}`);
        } catch (error) {
            console.error("Socket notification error:", error);
        }

        return proposal;
    }

    /**
     * Get proposals for a request
     */
    async getRequestProposals(requestId, userId) {
        const request = await marketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        const requestUserId = request.userId._id ? request.userId._id.toString() : request.userId.toString();

        // Only request owner can see proposals
        if (requestUserId !== userId) {
            throw new Error("Unauthorized: Only request owner can view proposals");
        }

        return marketplaceRepository.findProposals({ exchangeRequestId: requestId });
    }

    /**
     * Get user's proposals
     */
    async getUserProposals(userId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const query = { proposerId: userId };
        const proposals = await marketplaceRepository.findProposals(query, { createdAt: -1 }, skip, limit);
        const total = await marketplaceRepository.countProposals(query);

        return {
            proposals,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        };
    }

    /**
     * Accept a proposal (only by request owner)
     */
    async acceptProposal(requestId, proposalId, userId) {
        const request = await marketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        const requestUserId = request.userId._id ? request.userId._id.toString() : request.userId.toString();

        if (requestUserId !== userId) {
            throw new Error("Unauthorized: Only request owner can accept proposals");
        }

        if (request.status !== "open") {
            throw new Error("You can only accept proposals for open requests");
        }

        const proposal = await marketplaceRepository.getProposalById(proposalId);
        if (!proposal) {
            throw new Error("Proposal not found");
        }

        const proposalRequestId = proposal.exchangeRequestId._id ? proposal.exchangeRequestId._id.toString() : proposal.exchangeRequestId.toString();

        if (proposalRequestId !== requestId) {
            throw new Error("Proposal does not belong to this request");
        }

        // Reject all other proposals for this request
        await marketplaceRepository.updateManyProposals(
            {
                exchangeRequestId: requestId,
                _id: { $ne: proposalId },
                status: "pending",
            },
            { status: "rejected" }
        );

        // Accept the selected proposal
        const acceptedProposal = await marketplaceRepository.updateProposal(
            proposalId,
            { status: "accepted" }
        );

        // Update request status and selected proposal
        await marketplaceRepository.updateRequest(requestId, {
            status: "in_progress",
            selectedProposal: proposalId,
        });

        // Deduct credits from request owner
        await CreditService.deductCredits(
            userId,
            acceptedProposal.proposedCredits || 0, // Fallback if proposedCredits missing?
            `Acceptation de proposition pour: ${request.title}`,
            requestId,
            proposalId
        );

        return acceptedProposal;
    }

    /**
     * Reject a proposal
     */
    async rejectProposal(proposalId, userId) {
        const proposal = await marketplaceRepository.getProposalById(proposalId);

        if (!proposal) {
            throw new Error("Proposal not found");
        }

        const proposalRequestId = proposal.exchangeRequestId._id ? proposal.exchangeRequestId._id.toString() : proposal.exchangeRequestId.toString();
        const request = await marketplaceRepository.getRequestById(proposalRequestId);

        const requestUserId = request.userId._id ? request.userId._id.toString() : request.userId.toString();

        if (requestUserId !== userId) {
            throw new Error("Unauthorized: Only request owner can reject proposals");
        }

        return marketplaceRepository.updateProposal(proposalId, { status: "rejected" });
    }

    /**
     * Complete an exchange (mark request as completed)
     */
    async completeExchange(requestId, userId, rating, feedback) {
        const request = await marketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        const requestUserId = request.userId._id ? request.userId._id.toString() : request.userId.toString();

        if (requestUserId !== userId) {
            throw new Error("Unauthorized: Only request owner can complete exchanges");
        }

        if (request.status !== "in_progress") {
            throw new Error("Only in-progress requests can be completed");
        }

        if (!request.selectedProposal) {
            throw new Error("No selected proposal found");
        }

        const selectedProposalId = request.selectedProposal._id ? request.selectedProposal._id.toString() : request.selectedProposal.toString();

        const proposal = await marketplaceRepository.getProposalById(selectedProposalId);

        // Update proposal with rating and feedback
        await marketplaceRepository.updateProposal(selectedProposalId, {
            rating: rating || null,
            feedback: feedback || "",
        });

        // Add credits to proposer
        // proposal.proposerId could be populated
        const proposerId = proposal.proposerId._id ? proposal.proposerId._id.toString() : proposal.proposerId.toString();

        await CreditService.addCredits(
            proposerId,
            proposal.proposedCredits || request.estimatedCredits, // fallback
            `Travail complété: ${request.title}`,
            requestId,
            proposal._id
        );

        // Update request status
        await marketplaceRepository.updateRequest(requestId, { status: "completed" });

        return request;
    }
}

module.exports = new MarketplaceService();
