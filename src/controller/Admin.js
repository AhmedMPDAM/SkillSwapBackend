const User = require("../models/user");
const ExchangeRequest = require("../models/exchangeRequest");
const ExchangeProposal = require("../models/exchangeProposal");
const Rating = require("../models/rating");
const CreditHistory = require("../models/creditHistory");
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
            const completedExchanges = await ExchangeRequest.countDocuments({ status: "completed" });
            const pendingExaminations = await ExchangeProposal.countDocuments({ status: "admin_processing" });

            res.status(200).json({
                users,
                totalCredits,
                requests,
                completedExchanges,
                pendingExaminations,
            });
        } catch (error) {
            next(error);
        }
    }

    // ── User Management ──────────────────────────────────────────────────────
    /**
     * GET /api/admin/users
     * List all users with pagination, search, and role filtering
     */
    async getAllUsers(req, res, next) {
        try {
            const { page = 1, limit = 20, search, role } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const query = {};

            // Search by name or email
            if (search) {
                query.$or = [
                    { fullName: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                ];
            }

            // Filter by role
            if (role && ["user", "admin", "examiner"].includes(role)) {
                query.role = role;
            }

            const users = await User.find(query)
                .select("fullName email profileImage role credits skills location createdAt")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            const total = await User.countDocuments(query);

            // Enrich with exchange counts
            const enrichedUsers = await Promise.all(
                users.map(async (user) => {
                    const requestsCount = await ExchangeRequest.countDocuments({ userId: user._id });
                    const proposalsCount = await ExchangeProposal.countDocuments({ proposerId: user._id });
                    const completedCount = await ExchangeRequest.countDocuments({ userId: user._id, status: "completed" });

                    return {
                        ...user,
                        requestsCount,
                        proposalsCount,
                        completedCount,
                    };
                })
            );

            res.status(200).json({
                users: enrichedUsers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/admin/users/:id
     * Get full details for a single user
     */
    async getUserDetails(req, res, next) {
        try {
            const { id } = req.params;

            const user = await User.findById(id)
                .select("-password")
                .lean();

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            // Get user's exchange requests
            const requests = await ExchangeRequest.find({ userId: id })
                .select("title status estimatedCredits category complexity createdAt")
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();

            // Get user's proposals
            const proposals = await ExchangeProposal.find({ proposerId: id })
                .populate("exchangeRequestId", "title status estimatedCredits")
                .select("status acceptanceType createdAt exchangeRequestId")
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();

            // Get user's ratings received
            const ratingsReceived = await Rating.find({ ratedUserId: id })
                .populate("raterId", "fullName profileImage")
                .populate("exchangeRequestId", "title")
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            // Get user's average rating
            const ratingAgg = await Rating.aggregate([
                { $match: { ratedUserId: user._id } },
                { $group: { _id: null, avg: { $avg: "$stars" }, count: { $sum: 1 } } },
            ]);
            const averageRating = ratingAgg.length > 0 ? ratingAgg[0].avg : 0;
            const ratingsCount = ratingAgg.length > 0 ? ratingAgg[0].count : 0;

            // Get credit history
            const creditHistory = await CreditHistory.find({ userId: id })
                .sort({ createdAt: -1 })
                .limit(15)
                .lean();

            // Counts
            const totalRequests = await ExchangeRequest.countDocuments({ userId: id });
            const completedRequests = await ExchangeRequest.countDocuments({ userId: id, status: "completed" });
            const totalProposals = await ExchangeProposal.countDocuments({ proposerId: id });

            res.status(200).json({
                user,
                stats: {
                    totalRequests,
                    completedRequests,
                    totalProposals,
                    averageRating: Math.round(averageRating * 10) / 10,
                    ratingsCount,
                },
                requests,
                proposals,
                ratingsReceived,
                creditHistory,
            });
        } catch (error) {
            next(error);
        }
    }

    // ── Exchange Management ──────────────────────────────────────────────────
    /**
     * GET /api/admin/exchanges
     * List all exchange requests with pagination and status filtering
     */
    async getAllExchanges(req, res, next) {
        try {
            const { page = 1, limit = 20, status, search } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const query = {};

            if (status && ["open", "in_progress", "completed", "cancelled"].includes(status)) {
                query.status = status;
            }

            if (search) {
                query.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { skillSearched: { $regex: search, $options: "i" } },
                ];
            }

            const exchanges = await ExchangeRequest.find(query)
                .populate("userId", "fullName email profileImage")
                .populate("selectedProposal", "proposerId status")
                .select("title description skillSearched category level status estimatedCredits lockedCredits complexity estimatedDuration desiredDeadline views createdAt")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();

            const total = await ExchangeRequest.countDocuments(query);

            // Enrich with proposal count
            const enrichedExchanges = await Promise.all(
                exchanges.map(async (ex) => {
                    const proposalCount = await ExchangeProposal.countDocuments({ exchangeRequestId: ex._id });
                    return { ...ex, proposalCount };
                })
            );

            // Status breakdown for filters
            const statusCounts = {
                all: await ExchangeRequest.countDocuments(),
                open: await ExchangeRequest.countDocuments({ status: "open" }),
                in_progress: await ExchangeRequest.countDocuments({ status: "in_progress" }),
                completed: await ExchangeRequest.countDocuments({ status: "completed" }),
                cancelled: await ExchangeRequest.countDocuments({ status: "cancelled" }),
            };

            res.status(200).json({
                exchanges: enrichedExchanges,
                statusCounts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/admin/exchanges/:id
     * Get full details for a single exchange
     */
    async getExchangeDetails(req, res, next) {
        try {
            const { id } = req.params;

            const exchange = await ExchangeRequest.findById(id)
                .populate("userId", "fullName email profileImage credits role")
                .populate({
                    path: "selectedProposal",
                    populate: { path: "proposerId", select: "fullName email profileImage credits" },
                })
                .lean();

            if (!exchange) {
                return res.status(404).json({ message: "Exchange not found" });
            }

            // Get all proposals for this exchange
            const proposals = await ExchangeProposal.find({ exchangeRequestId: id })
                .populate("proposerId", "fullName email profileImage")
                .populate("examinerReview.examinerId", "fullName email")
                .sort({ createdAt: -1 })
                .lean();

            // Get ratings for this exchange
            const ratings = await Rating.find({ exchangeRequestId: id })
                .populate("raterId", "fullName profileImage")
                .populate("ratedUserId", "fullName profileImage")
                .lean();

            res.status(200).json({
                exchange,
                proposals,
                ratings,
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

            // ── DECIDE FINAL CREDITS ──────────────────────────────────────────
            // lockedCredits = estimatedCredits - 4 (examination fee was already
            // deducted from escrow when the user submitted for admin_quantification).
            //
            // • Examiner approves "as-is"   → pay out lockedCredits (post-fee amount)
            // • Examiner sets a custom value → that is the absolute final payout
            const lockedCredits = request.lockedCredits != null
                ? request.lockedCredits
                : request.estimatedCredits;

            const finalCredits =
                assignedCredits != null && assignedCredits !== "" && !isNaN(Number(assignedCredits))
                    ? Number(assignedCredits)
                    : lockedCredits; // no override → keep post-fee amount

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

            // ── ESCROW ADJUSTMENT ─────────────────────────────────────────────
            // lockedCredits already reflects the 4-credit examination fee.
            // Charge/refund only the EXTRA delta from the examiner override.
            const creditDiff = finalCredits - lockedCredits;

            try {
                if (creditDiff > 0) {
                    // Examiner set amount ABOVE post-fee escrow → charge extra from owner
                    await CreditService.deductCredits(
                        requestUserId,
                        creditDiff,
                        `Ajustement examinateur (supplément) pour: "${request.title}"`,
                        requestId,
                        id
                    );
                } else if (creditDiff < 0) {
                    // Examiner set amount BELOW post-fee escrow → refund difference to owner
                    await CreditService.addCredits(
                        requestUserId,
                        Math.abs(creditDiff),
                        `Ajustement examinateur (remboursement partiel) pour: "${request.title}"`,
                        requestId,
                        id
                    );
                }
                // Persist the final locked amount so completeExchange pays correctly
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
