const ChatService = require("../services/Chat");
const MarketplaceRepositoryClass = require("../repositories/Marketplace");
const marketplaceRepository = new MarketplaceRepositoryClass();

/**
 * ChatController
 *
 * REST endpoints:
 *  POST  /api/chat/rooms          → createChatRoom  (called after proposal acceptance)
 *  GET   /api/chat/rooms/:chatId  → getChatRoom     (validate + fetch metadata)
 */

/**
 * POST /api/chat/rooms
 * Body: { proposalId, requestId }
 */
const createChatRoom = async (req, res) => {
    try {
        const { proposalId, requestId } = req.body;
        const currentUserId = req.user.id;

        if (!proposalId || !requestId) {
            return res.status(400).json({ error: "proposalId and requestId are required" });
        }

        // Load the request and proposal from MongoDB
        const request = await marketplaceRepository.getRequestById(requestId);
        if (!request) return res.status(404).json({ error: "Request not found" });

        const proposal = await marketplaceRepository.getProposalById(proposalId);
        if (!proposal) return res.status(404).json({ error: "Proposal not found" });

        const requestOwnerId = (request.userId._id || request.userId).toString();
        const proposerId = (proposal.proposerId._id || proposal.proposerId).toString();

        // Only participants can create the chat
        if (currentUserId !== requestOwnerId && currentUserId !== proposerId) {
            return res.status(403).json({ error: "Unauthorized: You are not a participant" });
        }

        // Proposal must be accepted (not pending/rejected)
        if (!["accepted"].includes(proposal.status)) {
            return res.status(400).json({ error: "Chat can only be created for accepted proposals" });
        }

        const requestOwnerName = request.userId.fullName || request.userId.email || "User";
        const proposerName = proposal.proposerId.fullName || proposal.proposerId.email || "User";

        const chat = await ChatService.createChatRoom({
            proposalId: proposalId.toString(),
            requestId: requestId.toString(),
            requestOwnerId,
            requestOwnerName,
            proposerId,
            proposerName,
            offerExpiresAt: request.desiredDeadline,
            requestTitle: request.title,
        });

        return res.status(201).json({ success: true, chat });
    } catch (err) {
        console.error("createChatRoom error:", err);
        return res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/chat/rooms/:chatId
 * chatId === proposalId
 */
const getChatRoom = async (req, res) => {
    try {
        const { chatId } = req.params;
        const currentUserId = req.user.id;

        const chat = await ChatService.getChatRoom(chatId);
        if (!chat) return res.status(404).json({ error: "Chat room not found" });

        // Only participants may access
        if (!chat.participants.includes(currentUserId)) {
            return res.status(403).json({ error: "Unauthorized: You are not a participant" });
        }

        // Auto-disable if expired
        if (chat.isActive && chat.offerExpiresAt) {
            const expiryDate =
                chat.offerExpiresAt.toDate ? chat.offerExpiresAt.toDate() : new Date(chat.offerExpiresAt);
            if (expiryDate <= new Date()) {
                await ChatService.disableChat(chatId);
                chat.isActive = false;
            }
        }

        return res.status(200).json({ success: true, chat });
    } catch (err) {
        console.error("getChatRoom error:", err);
        return res.status(500).json({ error: err.message });
    }
};

module.exports = { createChatRoom, getChatRoom };
