const MarketplaceRepositoryClass = require("../repositories/Marketplace");
const marketplaceRepository = new MarketplaceRepositoryClass();
const CreditService = require("./Credit");
const UserRepositoryClass = require("../repositories/Auth");
const userRepository = new UserRepositoryClass();
const socketUtil = require("../utils/socket");
const ChatService = require("./Chat");
const ExchangeRequest = require("../models/exchangeRequest");

const ADMIN_EXAMINATION_FEE = 4; // credits deducted from escrow when admin examination is requested

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

        // Calculate how many credits this request costs
        const estimatedCredits = CreditService.calculateCredits(
            estimatedDuration,
            complexity || "medium"
        );

        // ── ESCROW CHECK: owner must have enough credits before posting ──────
        const user = await userRepository.findById(userId);
        if (!user || (user.credits || 0) < estimatedCredits) {
            throw new Error(
                `Insufficient credits. You need ${estimatedCredits} credits to post this request (you have ${user ? user.credits || 0 : 0}).`
            );
        }

        // Create request first so we have its ID for the credit history entry
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
            lockedCredits: estimatedCredits, // will be paid to proposer on completion
            complexity: complexity || "medium",
            location: location || "",
            status: "open",
        });

        // ── ESCROW DEDUCTION: lock credits now — they leave the owner's wallet ─
        try {
            await CreditService.deductCredits(
                userId,
                estimatedCredits,
                `Credits mis en séquestre pour: "${title}"`,
                request._id,
                null
            );
        } catch (deductErr) {
            // Roll back the request if escrow deduction fails
            await marketplaceRepository.deleteRequest(request._id);
            throw deductErr;
        }

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

        // ── ESCROW REFUND: return locked credits to owner when request is deleted ─
        if (request.lockedCredits && request.lockedCredits > 0) {
            try {
                await CreditService.addCredits(
                    requestUserId,
                    request.lockedCredits,
                    `Remboursement séquestre - demande supprimée: "${request.title}"`,
                    requestId,
                    null
                );
            } catch (refundErr) {
                console.error("Credit refund error on delete:", refundErr.message);
            }
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
            admin_quantification_cost = ADMIN_EXAMINATION_FEE;
        } else if (acceptanceType === "accept_deal") {
            status = "accepted"; // Immediately accept
        }

        // Create proposal
        const proposal = await marketplaceRepository.createProposal({
            image: request.image,
            exchangeRequestId: requestId,
            proposerId: userId,
            coverLetter,
            acceptanceType,
            admin_quantification_cost,
            status,
        });

        if (acceptanceType === "admin_quantification") {
            const currentLocked = request.lockedCredits || request.estimatedCredits || 0;
            const newLocked = Math.max(0, currentLocked - ADMIN_EXAMINATION_FEE);
            await ExchangeRequest.findByIdAndUpdate(requestId, {
                $set: { lockedCredits: newLocked },
            });
        }

        // Add proposal to request
        await marketplaceRepository.updateRequestRaw(requestId, { $push: { proposals: proposal._id } });

        // If accept_deal, update request status to in_progress, set selected proposal, and open chat
        if (acceptanceType === "accept_deal") {
            await marketplaceRepository.updateRequest(requestId, {
                status: "in_progress",
                selectedProposal: proposal._id,
            });

            // Credits were already locked in escrow at posting time — nothing to deduct here

            // --- Create Firestore chat room ---
            try {
                const requestOwner = request.userId;
                const ownerName = requestOwner.fullName || requestOwner.email || "User";
                const proposerUser = proposal.proposerId;
                const proposerName = proposerUser.fullName || proposerUser.email || "User";

                await ChatService.createChatRoom({
                    proposalId: proposal._id.toString(),
                    requestId: requestId.toString(),
                    requestOwnerId: requestUserId,
                    requestOwnerName: ownerName,
                    proposerId: userId,
                    proposerName,
                    offerExpiresAt: request.desiredDeadline,
                    requestTitle: request.title,
                });
            } catch (chatErr) {
                console.error("Chat room creation error:", chatErr);
            }
        }

        // Notify the request owner via Socket.io
        try {
            const io = socketUtil.getIo();
            // Notify request owner about the new proposal
            io.to(requestUserId).emit("notification", {
                type: "proposal_received",
                message: `New proposal for your request: ${request.title}`,
                requestId: requestId,
                proposalId: proposal._id.toString(),
                proposerId: userId
            });
            // If instantly accepted, also notify proposer that chat is ready
            if (acceptanceType === "accept_deal") {
                io.to(userId).emit("notification", {
                    type: "chat_ready",
                    message: `Your proposal was accepted for "${request.title}". Chat is now open!`,
                    requestId: requestId,
                    proposalId: proposal._id.toString(),
                    chatId: proposal._id.toString(),
                });
            }
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

        // Credits were already locked in escrow at posting time — nothing to deduct here

        // --- Create Firestore chat room ---
        const proposalProposerId = (
            proposal.proposerId._id || proposal.proposerId
        ).toString();
        try {
            const ownerName = request.userId.fullName || request.userId.email || "User";
            const proposerName = proposal.proposerId.fullName || proposal.proposerId.email || "User";

            await ChatService.createChatRoom({
                proposalId: proposalId.toString(),
                requestId: requestId.toString(),
                requestOwnerId: requestUserId,
                requestOwnerName: ownerName,
                proposerId: proposalProposerId,
                proposerName,
                offerExpiresAt: request.desiredDeadline,
                requestTitle: request.title,
            });
        } catch (chatErr) {
            console.error("Chat room creation error during acceptProposal:", chatErr);
        }

        // Notify proposer that their proposal was accepted and chat is ready
        try {
            const io = socketUtil.getIo();
            io.to(proposalProposerId).emit("notification", {
                type: "chat_ready",
                message: `Your proposal was accepted for "${request.title}". Chat is now open!`,
                requestId: requestId.toString(),
                proposalId: proposalId.toString(),
                chatId: proposalId.toString(),
            });
        } catch (sockErr) {
            console.error("Socket notification error in acceptProposal:", sockErr);
        }

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

        const selectedProposalId = request.selectedProposal._id
            ? request.selectedProposal._id.toString()
            : request.selectedProposal.toString();

        console.log(`[completeExchange] selectedProposalId = ${selectedProposalId}`);

        const proposal = await marketplaceRepository.getProposalById(selectedProposalId);

        if (!proposal) {
            throw new Error(`Proposal not found for id: ${selectedProposalId}`);
        }

        // ── ESCROW RELEASE: pay the locked credits to the proposer on completion ─
        const proposerId = proposal.proposerId._id
            ? proposal.proposerId._id.toString()
            : proposal.proposerId.toString();

        const payoutAmount = request.lockedCredits || request.estimatedCredits; // fallback for old requests

        console.log(`[completeExchange] Paying ${payoutAmount} credits to proposer ${proposerId} for request "${request.title}"`);

        try {
            await CreditService.addCredits(
                proposerId,
                payoutAmount,
                `Travail complété - paiement séquestre: "${request.title}"`,
                requestId,
                proposal._id
            );
            console.log(`[completeExchange] Credit transfer SUCCESS — ${payoutAmount} credits sent to ${proposerId}`);
        } catch (creditErr) {
            console.error(`[completeExchange] Credit transfer FAILED for proposer ${proposerId}:`, creditErr.message);
            throw new Error(`Failed to transfer credits to proposer: ${creditErr.message}`);
        }

        // Update proposal with rating and feedback
        await marketplaceRepository.updateProposal(selectedProposalId, {
            rating: rating || null,
            feedback: feedback || "",
        });

        // Update request status — only after successful credit transfer
        await marketplaceRepository.updateRequest(requestId, { status: "completed" });

        // Close the Firestore chat room
        try {
            await ChatService.disableChat(selectedProposalId);
        } catch (chatErr) {
            console.error("[completeExchange] Failed to close chat room:", chatErr.message);
        }

        return request;
    }

    /**
     * Internal: Complete an exchange when both sides have approved.
     * No user-auth check — called by the system, not by a user.
     */
    async completeExchangeInternal(requestId) {
        const request = await marketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Request not found");
        }

        // Prevent double-completion
        if (request.status === "completed") {
            console.log(`[completeExchangeInternal] Request ${requestId} already completed, skipping.`);
            return request;
        }

        if (request.status !== "in_progress") {
            throw new Error("Only in-progress requests can be completed");
        }

        if (!request.selectedProposal) {
            throw new Error("No selected proposal found");
        }

        const selectedProposalId = request.selectedProposal._id
            ? request.selectedProposal._id.toString()
            : request.selectedProposal.toString();

        console.log(`[completeExchangeInternal] selectedProposalId = ${selectedProposalId}`);

        const proposal = await marketplaceRepository.getProposalById(selectedProposalId);

        if (!proposal) {
            throw new Error(`Proposal not found for id: ${selectedProposalId}`);
        }

        // ── ESCROW RELEASE: pay the locked credits to the proposer ─
        const proposerId = proposal.proposerId._id
            ? proposal.proposerId._id.toString()
            : proposal.proposerId.toString();

        const payoutAmount = request.lockedCredits || request.estimatedCredits;

        console.log(`[completeExchangeInternal] Paying ${payoutAmount} credits to proposer ${proposerId} for request "${request.title}"`);

        try {
            await CreditService.addCredits(
                proposerId,
                payoutAmount,
                `Travail complété - paiement séquestre: "${request.title}"`,
                requestId,
                proposal._id
            );
            console.log(`[completeExchangeInternal] Credit transfer SUCCESS — ${payoutAmount} credits sent to ${proposerId}`);
        } catch (creditErr) {
            console.error(`[completeExchangeInternal] Credit transfer FAILED for proposer ${proposerId}:`, creditErr.message);
            throw new Error(`Failed to transfer credits to proposer: ${creditErr.message}`);
        }

        // Update request status — only after successful credit transfer
        await marketplaceRepository.updateRequest(requestId, { status: "completed" });

        // Close the Firestore chat room
        try {
            await ChatService.disableChat(selectedProposalId);
        } catch (chatErr) {
            console.error("[completeExchangeInternal] Failed to close chat room:", chatErr.message);
        }

        console.log(`[completeExchangeInternal] Exchange completed for request ${requestId}`);
        return request;
    }
}

module.exports = new MarketplaceService();
