const MarketplaceRepository = require("../repositories/Marketplace");
const CreditService = require("./Credit");

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
        const request = await MarketplaceRepository.createRequest({
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
        const request = await MarketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        if (incrementViews) {
            await MarketplaceRepository.incrementViews(requestId);
        }

        return request;
    }

    /**
     * Get feed of requests
     */
    async getFeed(page = 1, limit = 10, filters = {}) {
        return MarketplaceRepository.getFeed(page, limit, filters);
    }

    /**
     * Search requests with filters
     */
    async searchRequests(searchQuery, filters = {}, page = 1, limit = 10) {
        return MarketplaceRepository.searchRequests(searchQuery, filters, page, limit);
    }

    /**
     * Get user's requests
     */
    async getUserRequests(userId, page = 1, limit = 10) {
        return MarketplaceRepository.getUserRequests(userId, page, limit);
    }

    /**
     * Update request (only by owner)
     */
    async updateRequest(requestId, userId, updateData) {
        const request = await MarketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        if (request.userId.toString() !== userId) {
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

        return MarketplaceRepository.updateRequest(requestId, updateData);
    }

    /**
     * Delete request (only by owner)
     */
    async deleteRequest(requestId, userId) {
        const request = await MarketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        if (request.userId.toString() !== userId) {
            throw new Error("Unauthorized: You can only delete your own requests");
        }

        return MarketplaceRepository.deleteRequest(requestId);
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
        const request = await MarketplaceRepository.getRequestById(requestId);
        if (!request) {
            throw new Error("Request not found");
        }

        if (request.status !== "open") {
            throw new Error("You can only propose on open requests");
        }

        // Check if user is not the request owner
        if (request.userId.toString() === userId) {
            throw new Error("You cannot propose on your own request");
        }

        // Check if user already has a pending proposal
        const existingProposal = await MarketplaceRepository.getRequestProposals(requestId);
        const hasPendingProposal = existingProposal.some(
            (p) => p.proposerId.toString() === userId && (p.status === "pending" || p.status === "admin_processing")
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
        const proposal = await MarketplaceRepository.createProposal({
            exchangeRequestId: requestId,
            proposerId: userId,
            coverLetter,
            acceptanceType,
            admin_quantification_cost,
            status,
        });

        // If accept_deal, update request status to in_progress and set selected proposal
        if (acceptanceType === "accept_deal") {
            await MarketplaceRepository.updateRequest(requestId, {
                status: "in_progress",
                selectedProposal: proposal._id,
            });

            // Deduct estimated credits from request owner
            await CreditService.deductCredits(
                request.userId.toString(),
                request.estimatedCredits,
                `Acceptation immédiate de proposition pour: ${request.title}`,
                requestId,
                proposal._id
            );
        }

        return proposal;
    }

    /**
     * Get proposals for a request
     */
    async getRequestProposals(requestId, userId) {
        const request = await MarketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        // Only request owner can see proposals
        if (request.userId.toString() !== userId) {
            throw new Error("Unauthorized: Only request owner can view proposals");
        }

        return MarketplaceRepository.getRequestProposals(requestId);
    }

    /**
     * Get user's proposals
     */
    async getUserProposals(userId, page = 1, limit = 10) {
        return MarketplaceRepository.getUserProposals(userId, page, limit);
    }

    /**
     * Accept a proposal (only by request owner)
     */
    async acceptProposal(requestId, proposalId, userId) {
        const request = await MarketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        if (request.userId.toString() !== userId) {
            throw new Error("Unauthorized: Only request owner can accept proposals");
        }

        if (request.status !== "open") {
            throw new Error("You can only accept proposals for open requests");
        }

        const proposal = await MarketplaceRepository.getProposalById(proposalId);
        if (!proposal) {
            throw new Error("Proposal not found");
        }

        if (proposal.exchangeRequestId.toString() !== requestId) {
            throw new Error("Proposal does not belong to this request");
        }

        // Accept proposal and reject others
        const acceptedProposal = await MarketplaceRepository.acceptProposal(requestId, proposalId);

        // Deduct credits from request owner
        await CreditService.deductCredits(
            userId,
            acceptedProposal.proposedCredits,
            `Acceptation de proposition pour: ${request.title}`,
            requestId,
            proposalId
        );

        // Add credits to proposer (will be paid when work is completed)
        // This will be handled when the work is marked as completed

        return acceptedProposal;
    }

    /**
     * Reject a proposal
     */
    async rejectProposal(proposalId, userId) {
        const proposal = await MarketplaceRepository.getProposalById(proposalId);

        if (!proposal) {
            throw new Error("Proposal not found");
        }

        const request = await MarketplaceRepository.getRequestById(proposal.exchangeRequestId);

        if (request.userId.toString() !== userId) {
            throw new Error("Unauthorized: Only request owner can reject proposals");
        }

        return MarketplaceRepository.updateProposal(proposalId, { status: "rejected" });
    }

    /**
     * Complete an exchange (mark request as completed)
     */
    async completeExchange(requestId, userId, rating, feedback) {
        const request = await MarketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        if (request.userId.toString() !== userId) {
            throw new Error("Unauthorized: Only request owner can complete exchanges");
        }

        if (request.status !== "in_progress") {
            throw new Error("Only in-progress requests can be completed");
        }

        if (!request.selectedProposal) {
            throw new Error("No selected proposal found");
        }

        const proposal = await MarketplaceRepository.getProposalById(request.selectedProposal);

        // Update proposal with rating and feedback
        await MarketplaceRepository.updateProposal(request.selectedProposal, {
            rating: rating || null,
            feedback: feedback || "",
        });

        // Add credits to proposer
        await CreditService.addCredits(
            proposal.proposerId,
            proposal.proposedCredits,
            `Travail complété: ${request.title}`,
            requestId,
            proposal._id
        );

        // Update request status
        await MarketplaceRepository.updateRequest(requestId, { status: "completed" });

        return request;
    }
}

module.exports = new MarketplaceService();

