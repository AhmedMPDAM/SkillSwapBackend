const User = require("../models/user");
const ExchangeRequest = require("../models/exchangeRequest");
const ExchangeProposal = require("../models/exchangeProposal");
const socketUtil = require("../utils/socket");
const CreditService = require("../services/Credit");
const ChatService = require("../services/Chat");

class AdminController {
    // ── General stats ────────────────────────────────────────────────────────
    async getStats(req, res, next) {
        try {
            const users = await User.countDocuments();
            const credits = await User.aggregate([
                { $group: { _id: null, total: { $sum: "$credits" } } },
            ]);
            const totalCredits = credits.length > 0 ? credits[0].total : 0;
            const requests = await ExchangeRequest.countDocuments();
            const pendingExaminations = await ExchangeProposal.countDocuments({ status: "admin_processing" });

            res.status(200).json({
                users,
                totalCredits,
                requests,
                pendingExaminations,
            });
        } catch (error) {
            next(error);
        }
    }

    // ── Examination queue ────────────────────────────────────────────────────
    /**
     * GET /api/admin/examiner/queue
     * Returns all proposals awaiting examiner review (status = admin_processing)
     */
    async getExaminationQueue(req, res, next) {
        try {
            const proposals = await ExchangeProposal.find({ status: "admin_processing" })
                .populate("proposerId", "fullName email profileImage")
                .populate({
                    path: "exchangeRequestId",
                    select: "title description skillSearched estimatedCredits complexity estimatedDuration category level whatYouOffer desiredDeadline",
                    populate: {
                        path: "userId",
                        select: "fullName email profileImage",
                    },
                })
                .sort({ createdAt: 1 }) // oldest first — FIFO
                .lean();

            res.status(200).json({ proposals, total: proposals.length });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/admin/examiner/queue/:id
     * Get single proposal detail for review
     */
    async getProposalForReview(req, res, next) {
        try {
            const proposal = await ExchangeProposal.findById(req.params.id)
                .populate("proposerId", "fullName email profileImage credits")
                .populate({
                    path: "exchangeRequestId",
                    select: "title description skillSearched estimatedCredits complexity estimatedDuration category level whatYouOffer desiredDeadline location status",
                    populate: {
                        path: "userId",
                        select: "fullName email profileImage credits",
                    },
                })
                .lean();

            if (!proposal) {
                return res.status(404).json({ message: "Proposal not found" });
            }

            if (proposal.status !== "admin_processing") {
                return res.status(400).json({ message: "This proposal is not awaiting examination" });
            }

            res.status(200).json({ proposal });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/admin/examiner/queue/:id/review
     * Examiner approves (optionally modifying credits + adding a note).
     * Body: { assignedCredits?: number, examinerNote?: string }
     */
    async reviewProposal(req, res, next) {
        try {
            const { id } = req.params;
            const { assignedCredits, examinerNote } = req.body;
            const examinerId = req.user.id;

            const proposal = await ExchangeProposal.findById(id)
                .populate("proposerId", "fullName email")
                .populate({
                    path: "exchangeRequestId",
                    populate: { path: "userId", select: "fullName email" },
                });

            if (!proposal) {
                return res.status(404).json({ message: "Proposal not found" });
            }
            if (proposal.status !== "admin_processing") {
                return res.status(400).json({ message: "Proposal is not pending examination" });
            }

            const request = proposal.exchangeRequestId;
            const requestId = request._id.toString();
            const requestUserId = (request.userId._id || request.userId).toString();
            const proposerId = (proposal.proposerId._id || proposal.proposerId).toString();

            // Decide final credits
            const finalCredits =
                assignedCredits != null && !isNaN(assignedCredits)
                    ? Number(assignedCredits)
                    : request.estimatedCredits;

            // Update proposal → examiner_approved
            const updatedProposal = await ExchangeProposal.findByIdAndUpdate(
                id,
                {
                    $set: {
                        status: "examiner_approved",
                        "examinerReview.examinerId": examinerId,
                        "examinerReview.assignedCredits": finalCredits,
                        "examinerReview.examinerNote": examinerNote || "",
                        "examinerReview.reviewedAt": new Date(),
                    },
                },
                { new: true }
            ).lean();

            // Mark request as in_progress and set selected proposal
            await ExchangeRequest.findByIdAndUpdate(requestId, {
                $set: { status: "in_progress", selectedProposal: id },
            });

            // ── ESCROW ADJUSTMENT: examiner may have changed the credit amount ──
            // The owner already paid estimatedCredits into escrow at posting time.
            // We only charge/refund the DIFFERENCE here.
            const lockedCredits = request.lockedCredits || request.estimatedCredits || 0;
            const creditDiff = finalCredits - lockedCredits;

            try {
                if (creditDiff > 0) {
                    // Examiner raised credits — charge the extra from the owner
                    await CreditService.deductCredits(
                        requestUserId,
                        creditDiff,
                        `Ajustement examinateur (supplément) pour: "${request.title}"`,
                        requestId,
                        id
                    );
                } else if (creditDiff < 0) {
                    // Examiner reduced credits — refund the difference to the owner
                    await CreditService.addCredits(
                        requestUserId,
                        Math.abs(creditDiff),
                        `Ajustement examinateur (remboursement partiel) pour: "${request.title}"`,
                        requestId,
                        id
                    );
                }
                // Update the locked amount so completeExchange pays the right figure
                await ExchangeRequest.findByIdAndUpdate(requestId, {
                    $set: { lockedCredits: finalCredits },
                });
            } catch (creditErr) {
                console.error("Credit adjustment error:", creditErr.message);
            }

            // Create Firestore chat room
            try {
                const ownerName = request.userId.fullName || request.userId.email || "User";
                const proposerName = proposal.proposerId.fullName || proposal.proposerId.email || "User";

                await ChatService.createChatRoom({
                    proposalId: id,
                    requestId,
                    requestOwnerId: requestUserId,
                    requestOwnerName: ownerName,
                    proposerId,
                    proposerName,
                    offerExpiresAt: request.desiredDeadline,
                    requestTitle: request.title,
                });
            } catch (chatErr) {
                console.error("Chat room creation error:", chatErr);
            }

            // Notify proposer via socket
            try {
                const io = socketUtil.getIo();

                // Notify proposer
                io.to(proposerId).emit("notification", {
                    type: "examiner_approved",
                    message: `Your proposal for "${request.title}" was reviewed and approved by the examiner!${examinerNote ? ` Note: "${examinerNote}"` : ""
                        }`,
                    proposalId: id,
                    requestId,
                    chatId: id,
                    assignedCredits: finalCredits,
                    examinerNote: examinerNote || "",
                });

                // Also notify request owner that their request is now in progress
                io.to(requestUserId).emit("notification", {
                    type: "examiner_approved_owner",
                    message: `The examiner has approved a proposal for your request "${request.title}". Chat is now open!`,
                    proposalId: id,
                    requestId,
                    chatId: id,
                });
            } catch (sockErr) {
                console.error("Socket error:", sockErr);
            }

            res.status(200).json({
                message: "Proposal approved by examiner",
                proposal: updatedProposal,
                assignedCredits: finalCredits,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AdminController();
