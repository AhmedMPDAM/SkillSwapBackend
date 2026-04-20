const AdminRepository = require("../repositories/Admin");
const CreditService = require("./Credit");
const ChatService = require("./Chat");
const socketUtil = require("../utils/socket");

class AdminService {
    // ── General stats ─────────────────────────────────────────────────────────
    async getStats() {
        const [users, totalCredits, requests, completedExchanges, pendingExaminations] =
            await Promise.all([
                AdminRepository.countUsers(),
                AdminRepository.sumAllCredits(),
                AdminRepository.countRequests(),
                AdminRepository.countRequests({ status: "completed" }),
                AdminRepository.countProposals({ status: "admin_processing" }),
            ]);

        return { users, totalCredits, requests, completedExchanges, pendingExaminations };
    }

    // ── User Management ───────────────────────────────────────────────────────
    async getAllUsers({ page = 1, limit = 20, search, role } = {}) {
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        if (role && ["user", "admin", "examiner"].includes(role)) {
            query.role = role;
        }

        const [users, total] = await Promise.all([
            AdminRepository.findUsers(query, { skip, limit: parseInt(limit) }),
            AdminRepository.countUsers(query),
        ]);

        const enrichedUsers = await Promise.all(
            users.map(async (user) => {
                const [requestsCount, proposalsCount, completedCount] = await Promise.all([
                    AdminRepository.countRequests({ userId: user._id }),
                    AdminRepository.countProposals({ proposerId: user._id }),
                    AdminRepository.countRequests({ userId: user._id, status: "completed" }),
                ]);
                return { ...user, requestsCount, proposalsCount, completedCount };
            })
        );

        return {
            users: enrichedUsers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        };
    }

    async getUserDetails(id) {
        const user = await AdminRepository.findUserById(id);
        if (!user) return null;

        const [
            requests, proposals, ratingsReceived, ratingAgg, creditHistory,
            totalRequests, completedRequests, totalProposals,
        ] = await Promise.all([
            AdminRepository.findExchanges({ userId: id }, { skip: 0, limit: 20 }),
            AdminRepository.findProposals({ proposerId: id }, { skip: 0, limit: 20 }),
            AdminRepository.findRatingsForUser(id, 10),
            AdminRepository.aggregateUserRating(user._id),
            AdminRepository.findCreditHistory(id, 15),
            AdminRepository.countRequests({ userId: id }),
            AdminRepository.countRequests({ userId: id, status: "completed" }),
            AdminRepository.countProposals({ proposerId: id }),
        ]);

        return {
            user,
            stats: {
                totalRequests,
                completedRequests,
                totalProposals,
                averageRating: Math.round(ratingAgg.avg * 10) / 10,
                ratingsCount: ratingAgg.count,
            },
            requests,
            proposals,
            ratingsReceived,
            creditHistory,
        };
    }

    // ── Exchange Management ───────────────────────────────────────────────────
    async getAllExchanges({ page = 1, limit = 20, status, search } = {}) {
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

        const [exchanges, total, statusCounts] = await Promise.all([
            AdminRepository.findExchanges(query, { skip, limit: parseInt(limit) }),
            AdminRepository.countRequests(query),
            AdminRepository.getExchangeStatusCounts(),
        ]);

        const enrichedExchanges = await Promise.all(
            exchanges.map(async (ex) => {
                const proposalCount = await AdminRepository.countProposals({ exchangeRequestId: ex._id });
                return { ...ex, proposalCount };
            })
        );

        return {
            exchanges: enrichedExchanges,
            statusCounts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        };
    }

    async getExchangeDetails(id) {
        const exchange = await AdminRepository.findExchangeById(id);
        if (!exchange) return null;

        const [proposals, ratings] = await Promise.all([
            AdminRepository.findProposalsForExchange(id),
            AdminRepository.findRatingsForExchange(id),
        ]);

        return { exchange, proposals, ratings };
    }

    // ── Examination Queue ─────────────────────────────────────────────────────
    async getExaminationQueue() {
        const proposals = await AdminRepository.findProposalsByStatus("admin_processing");
        return { proposals, total: proposals.length };
    }

    async getProposalForReview(id) {
        const proposal = await AdminRepository.findProposalByIdForReview(id);
        if (!proposal) return { error: "NOT_FOUND" };
        if (proposal.status !== "admin_processing") return { error: "NOT_PENDING" };
        return { proposal };
    }

    /**
     * Business rule: approve a proposal as examiner.
     *
     * - lockedCredits = estimatedCredits - 4 (examination fee already deducted
     *   from escrow when the user submitted for admin_quantification).
     * - If examiner provides assignedCredits  → that is the absolute final payout.
     * - If examiner provides nothing          → keep lockedCredits (post-fee amount).
     * - Adjust escrow only for the EXTRA delta introduced by an examiner override.
     */
    async reviewProposal({ proposalId, examinerId, assignedCredits, examinerNote }) {
        const proposal = await AdminRepository.findProposalForApproval(proposalId);
        if (!proposal) return { error: "NOT_FOUND" };
        if (proposal.status !== "admin_processing") return { error: "NOT_PENDING" };

        const request = proposal.exchangeRequestId;
        const requestId = request._id.toString();
        const requestUserId = (request.userId._id || request.userId).toString();
        const proposerId = (proposal.proposerId._id || proposal.proposerId).toString();

        // ── Credit Decision Rule ──────────────────────────────────────────────
        const lockedCredits = request.lockedCredits != null
            ? request.lockedCredits
            : request.estimatedCredits;

        const finalCredits =
            assignedCredits != null && assignedCredits !== "" && !isNaN(Number(assignedCredits))
                ? Number(assignedCredits)
                : lockedCredits;

        // ── Persist changes ───────────────────────────────────────────────────
        const updatedProposal = await AdminRepository.updateProposal(proposalId, {
            status: "examiner_approved",
            "examinerReview.examinerId": examinerId,
            "examinerReview.assignedCredits": finalCredits,
            "examinerReview.examinerNote": examinerNote || "",
            "examinerReview.reviewedAt": new Date(),
        });

        await AdminRepository.updateExchange(requestId, {
            status: "in_progress",
            selectedProposal: proposalId,
        });

        // ── Escrow Adjustment ─────────────────────────────────────────────────
        const creditDiff = finalCredits - lockedCredits;
        try {
            if (creditDiff > 0) {
                await CreditService.deductCredits(
                    requestUserId, creditDiff,
                    `Ajustement examinateur (supplément) pour: "${request.title}"`,
                    requestId, proposalId
                );
            } else if (creditDiff < 0) {
                await CreditService.addCredits(
                    requestUserId, Math.abs(creditDiff),
                    `Ajustement examinateur (remboursement partiel) pour: "${request.title}"`,
                    requestId, proposalId
                );
            }
            await AdminRepository.updateExchange(requestId, { lockedCredits: finalCredits });
        } catch (creditErr) {
            console.error("Credit adjustment error:", creditErr.message);
        }

        // ── Chat Room ─────────────────────────────────────────────────────────
        try {
            await ChatService.createChatRoom({
                proposalId,
                requestId,
                requestOwnerId: requestUserId,
                requestOwnerName: request.userId.fullName || request.userId.email || "User",
                proposerId,
                proposerName: proposal.proposerId.fullName || proposal.proposerId.email || "User",
                offerExpiresAt: request.desiredDeadline,
                requestTitle: request.title,
            });
        } catch (chatErr) {
            console.error("Chat room creation error:", chatErr);
        }

        // ── Socket Notifications ──────────────────────────────────────────────
        try {
            const io = socketUtil.getIo();
            io.to(proposerId).emit("notification", {
                type: "examiner_approved",
                message: `Your proposal for "${request.title}" was reviewed and approved by the examiner!${examinerNote ? ` Note: "${examinerNote}"` : ""}`,
                proposalId, requestId, chatId: proposalId,
                assignedCredits: finalCredits,
                examinerNote: examinerNote || "",
            });
            io.to(requestUserId).emit("notification", {
                type: "examiner_approved_owner",
                message: `The examiner has approved a proposal for your request "${request.title}". Chat is now open!`,
                proposalId, requestId, chatId: proposalId,
            });
        } catch (sockErr) {
            console.error("Socket error:", sockErr);
        }

        return { proposal: updatedProposal, finalCredits };
    }
}

module.exports = new AdminService();
