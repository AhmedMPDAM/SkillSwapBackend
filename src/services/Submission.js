const Submission = require("../models/submission");
const MarketplaceRepositoryClass = require("../repositories/Marketplace");
const marketplaceRepository = new MarketplaceRepositoryClass();
const socketUtil = require("../utils/socket");

class SubmissionService {
    /**
     * Submit work for an exchange (by proposer)
     * Creates a new submission with the uploaded file.
     */
    async submitWork(proposerId, requestId, proposalId, fileData, message) {
        // Validate the request exists and is in_progress
        const request = await marketplaceRepository.getRequestById(requestId);
        if (!request) {
            throw new Error("Request not found");
        }

        if (request.status !== "in_progress") {
            throw new Error("Only in-progress requests can receive submissions");
        }

        // Validate the proposal exists and belongs to this request
        const proposal = await marketplaceRepository.getProposalById(proposalId);
        if (!proposal) {
            throw new Error("Proposal not found");
        }

        const proposalProposerId = proposal.proposerId._id
            ? proposal.proposerId._id.toString()
            : proposal.proposerId.toString();

        if (proposalProposerId !== proposerId) {
            throw new Error("Unauthorized: Only the proposer can submit work");
        }

        // Check that this is the selected proposal
        const selectedProposalId = request.selectedProposal._id
            ? request.selectedProposal._id.toString()
            : request.selectedProposal.toString();

        if (selectedProposalId !== proposalId) {
            throw new Error("This proposal is not the selected one for this request");
        }

        // Count existing submissions to determine revision number
        const existingCount = await Submission.countDocuments({
            exchangeRequestId: requestId,
            proposalId: proposalId,
        });

        const submission = await Submission.create({
            exchangeRequestId: requestId,
            proposalId: proposalId,
            submitterId: proposerId,
            fileName: fileData.originalname,
            filePath: fileData.filename, // stored filename on disk
            fileSize: fileData.size,
            fileMimeType: fileData.mimetype,
            message: message || "",
            status: "pending_review",
            revisionNumber: existingCount + 1,
        });

        // Notify request owner
        try {
            const requestUserId = request.userId._id
                ? request.userId._id.toString()
                : request.userId.toString();

            const io = socketUtil.getIo();
            io.to(requestUserId).emit("notification", {
                type: "work_submitted",
                message: `Work has been submitted for "${request.title}" (revision #${submission.revisionNumber})`,
                requestId,
                proposalId,
                submissionId: submission._id.toString(),
            });
        } catch (err) {
            console.error("Socket notification error (submitWork):", err);
        }

        return submission;
    }

    /**
     * Get all submissions for an exchange
     */
    async getSubmissions(requestId, userId) {
        const request = await marketplaceRepository.getRequestById(requestId);
        if (!request) {
            throw new Error("Request not found");
        }

        // Both the request owner and the proposer can view submissions
        const requestUserId = request.userId._id
            ? request.userId._id.toString()
            : request.userId.toString();

        let isParticipant = requestUserId === userId;

        if (!isParticipant && request.selectedProposal) {
            const proposal = await marketplaceRepository.getProposalById(
                request.selectedProposal._id
                    ? request.selectedProposal._id.toString()
                    : request.selectedProposal.toString()
            );
            if (proposal) {
                const proposerIdStr = proposal.proposerId._id
                    ? proposal.proposerId._id.toString()
                    : proposal.proposerId.toString();
                isParticipant = proposerIdStr === userId;
            }
        }

        if (!isParticipant) {
            throw new Error("Unauthorized: Only exchange participants can view submissions");
        }

        return Submission.find({ exchangeRequestId: requestId })
            .populate("submitterId", "fullName profileImage")
            .sort({ createdAt: -1 })
            .lean();
    }

    /**
     * Request revision on a submission (by request owner)
     */
    async requestRevision(submissionId, userId, revisionNotes) {
        const submission = await Submission.findById(submissionId)
            .populate("exchangeRequestId")
            .lean();

        if (!submission) {
            throw new Error("Submission not found");
        }

        if (submission.status !== "pending_review") {
            throw new Error("This submission has already been reviewed");
        }

        // Verify user is the request owner
        const request = await marketplaceRepository.getRequestById(
            submission.exchangeRequestId._id
                ? submission.exchangeRequestId._id.toString()
                : submission.exchangeRequestId.toString()
        );

        if (!request) {
            throw new Error("Associated request not found");
        }

        const requestUserId = request.userId._id
            ? request.userId._id.toString()
            : request.userId.toString();

        if (requestUserId !== userId) {
            throw new Error("Unauthorized: Only the request owner can request revisions");
        }

        if (!revisionNotes || !revisionNotes.trim()) {
            throw new Error("Revision notes are required when requesting modifications");
        }

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

        // Notify the proposer
        try {
            const io = socketUtil.getIo();
            io.to(submission.submitterId.toString()).emit("notification", {
                type: "revision_requested",
                message: `Modifications requested for "${request.title}": ${revisionNotes}`,
                requestId: request._id.toString(),
                submissionId: submissionId,
            });
        } catch (err) {
            console.error("Socket notification error (requestRevision):", err);
        }

        return updated;
    }

    /**
     * Approve a submission (by request owner)
     * This triggers completeExchange to release credits
     */
    async approveSubmission(submissionId, userId) {
        const submission = await Submission.findById(submissionId).lean();

        if (!submission) {
            throw new Error("Submission not found");
        }

        if (submission.status !== "pending_review") {
            throw new Error("This submission has already been reviewed");
        }

        // Verify user is the request owner
        const requestId = submission.exchangeRequestId._id
            ? submission.exchangeRequestId._id.toString()
            : submission.exchangeRequestId.toString();

        const request = await marketplaceRepository.getRequestById(requestId);

        if (!request) {
            throw new Error("Associated request not found");
        }

        const requestUserId = request.userId._id
            ? request.userId._id.toString()
            : request.userId.toString();

        if (requestUserId !== userId) {
            throw new Error("Unauthorized: Only the request owner can approve submissions");
        }

        // Mark submission as approved
        const updated = await Submission.findByIdAndUpdate(
            submissionId,
            {
                $set: {
                    status: "approved",
                    reviewedAt: new Date(),
                },
            },
            { new: true }
        ).lean();

        // Notify the proposer
        try {
            const io = socketUtil.getIo();
            io.to(submission.submitterId.toString()).emit("notification", {
                type: "submission_approved",
                message: `Your work for "${request.title}" has been approved! Credits are being transferred.`,
                requestId: requestId,
                submissionId: submissionId,
            });
        } catch (err) {
            console.error("Socket notification error (approveSubmission):", err);
        }

        return { submission: updated, requestId };
    }

    /**
     * Get the latest submission for an exchange (useful for chat UI)
     */
    async getLatestSubmission(requestId) {
        return Submission.findOne({ exchangeRequestId: requestId })
            .populate("submitterId", "fullName profileImage")
            .sort({ createdAt: -1 })
            .lean();
    }
}

module.exports = new SubmissionService();
