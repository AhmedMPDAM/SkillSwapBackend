const Submission = require("../models/submission");
const MarketplaceRepositoryClass = require("../repositories/Marketplace");
const marketplaceRepository = new MarketplaceRepositoryClass();
const socketUtil = require("../utils/socket");

class SubmissionService {
    /**
     * Resolve both participant IDs and the caller's role for a given request.
     */
    async _resolveParticipants(requestId, userId) {
        const request = await marketplaceRepository.getRequestById(requestId);
        if (!request) throw new Error("Request not found");
        if (request.status !== "in_progress")
            throw new Error("Only in-progress requests can receive submissions");

        const ownerId = request.userId._id
            ? request.userId._id.toString()
            : request.userId.toString();

        if (!request.selectedProposal)
            throw new Error("No selected proposal found");

        const proposal = await marketplaceRepository.getProposalById(
            request.selectedProposal._id
                ? request.selectedProposal._id.toString()
                : request.selectedProposal.toString()
        );
        if (!proposal) throw new Error("Proposal not found");

        const proposerId = proposal.proposerId._id
            ? proposal.proposerId._id.toString()
            : proposal.proposerId.toString();

        let role = null;
        if (userId === ownerId) role = "owner";
        else if (userId === proposerId) role = "proposer";
        else throw new Error("Unauthorized: You are not a participant");

        const otherUserId = role === "owner" ? proposerId : ownerId;

        return { request, proposal, ownerId, proposerId, role, otherUserId };
    }

    /**
     * Submit work (either side can submit).
     */
    async submitWork(userId, requestId, proposalId, fileData, message) {
        const { request, role, otherUserId } =
            await this._resolveParticipants(requestId, userId);

        // Count existing submissions for THIS role to determine revision number
        const existingCount = await Submission.countDocuments({
            exchangeRequestId: requestId,
            role,
        });

        const submission = await Submission.create({
            exchangeRequestId: requestId,
            proposalId,
            submitterId: userId,
            role,
            fileName: fileData.originalname,
            filePath: fileData.filename,
            fileSize: fileData.size,
            fileMimeType: fileData.mimetype,
            message: message || "",
            status: "pending_review",
            revisionNumber: existingCount + 1,
        });

        // Notify the other party
        try {
            const io = socketUtil.getIo();
            io.to(otherUserId).emit("notification", {
                type: "work_submitted",
                message: `Work submitted for "${request.title}" (revision #${submission.revisionNumber})`,
                requestId,
                submissionId: submission._id.toString(),
            });
        } catch (err) {
            console.error("Socket notification error (submitWork):", err);
        }

        return submission;
    }

    /**
     * Get all submissions for an exchange (both sides visible to both).
     */
    async getSubmissions(requestId, userId) {
        const request = await marketplaceRepository.getRequestById(requestId);
        if (!request) throw new Error("Request not found");

        const ownerId = request.userId._id
            ? request.userId._id.toString()
            : request.userId.toString();

        let isParticipant = ownerId === userId;
        if (!isParticipant && request.selectedProposal) {
            const proposal = await marketplaceRepository.getProposalById(
                request.selectedProposal._id
                    ? request.selectedProposal._id.toString()
                    : request.selectedProposal.toString()
            );
            if (proposal) {
                const pid = proposal.proposerId._id
                    ? proposal.proposerId._id.toString()
                    : proposal.proposerId.toString();
                isParticipant = pid === userId;
            }
        }
        if (!isParticipant)
            throw new Error("Unauthorized: Only exchange participants can view submissions");

        return Submission.find({ exchangeRequestId: requestId })
            .populate("submitterId", "fullName profileImage")
            .sort({ createdAt: -1 })
            .lean();
    }

    /**
     * Request revision — the OTHER party reviews a submission.
     * The reviewer must NOT be the same person who submitted.
     */
    async requestRevision(submissionId, userId, revisionNotes) {
        const submission = await Submission.findById(submissionId).lean();
        if (!submission) throw new Error("Submission not found");
        if (submission.status !== "pending_review")
            throw new Error("This submission has already been reviewed");

        // The reviewer must be the OTHER participant (not the submitter)
        if (submission.submitterId.toString() === userId)
            throw new Error("You cannot review your own submission");

        const requestId = submission.exchangeRequestId._id
            ? submission.exchangeRequestId._id.toString()
            : submission.exchangeRequestId.toString();

        // Verify the reviewer is a participant
        await this._resolveParticipants(requestId, userId);

        if (!revisionNotes || !revisionNotes.trim())
            throw new Error("Revision notes are required");

        const updated = await Submission.findByIdAndUpdate(
            submissionId,
            {
                $set: {
                    status: "revision_requested",
                    revisionNotes: revisionNotes.trim(),
                    reviewedAt: new Date(),
                },
            },
            { new: true }
        ).lean();

        // Notify the submitter
        try {
            const request = await marketplaceRepository.getRequestById(requestId);
            const io = socketUtil.getIo();
            io.to(submission.submitterId.toString()).emit("notification", {
                type: "revision_requested",
                message: `Modifications requested for "${request.title}": ${revisionNotes}`,
                requestId,
                submissionId,
            });
        } catch (err) {
            console.error("Socket notification error (requestRevision):", err);
        }

        return updated;
    }

    /**
     * Approve a submission — the OTHER party approves.
     * Does NOT auto-complete the exchange (credits handled separately).
     */
    async approveSubmission(submissionId, userId) {
        const submission = await Submission.findById(submissionId).lean();
        if (!submission) throw new Error("Submission not found");
        if (submission.status !== "pending_review")
            throw new Error("This submission has already been reviewed");

        if (submission.submitterId.toString() === userId)
            throw new Error("You cannot approve your own submission");

        const requestId = submission.exchangeRequestId._id
            ? submission.exchangeRequestId._id.toString()
            : submission.exchangeRequestId.toString();

        await this._resolveParticipants(requestId, userId);

        const updated = await Submission.findByIdAndUpdate(
            submissionId,
            { $set: { status: "approved", reviewedAt: new Date() } },
            { new: true }
        ).lean();

        // Notify the submitter
        try {
            const request = await marketplaceRepository.getRequestById(requestId);
            const io = socketUtil.getIo();
            io.to(submission.submitterId.toString()).emit("notification", {
                type: "submission_approved",
                message: `Your work for "${request.title}" has been approved!`,
                requestId,
                submissionId,
            });
        } catch (err) {
            console.error("Socket notification error (approveSubmission):", err);
        }

        return { submission: updated, requestId };
    }

    /**
     * Check if both sides have at least one approved submission.
     */
    async checkBothApproved(requestId) {
        const ownerApproved = await Submission.findOne({
            exchangeRequestId: requestId,
            role: "owner",
            status: "approved",
        }).lean();

        const proposerApproved = await Submission.findOne({
            exchangeRequestId: requestId,
            role: "proposer",
            status: "approved",
        }).lean();

        return {
            ownerApproved: !!ownerApproved,
            proposerApproved: !!proposerApproved,
            bothApproved: !!ownerApproved && !!proposerApproved,
        };
    }
}

module.exports = new SubmissionService();
