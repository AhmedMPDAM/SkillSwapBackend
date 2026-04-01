const SubmissionService = require("../services/Submission");
const MarketplaceService = require("../services/Marketplace");

class SubmissionController {
    /**
     * Submit work for an exchange (either party)
     * POST /api/marketplace/requests/:id/submissions
     */
    async submitWork(req, res, next) {
        try {
            const { proposalId, message } = req.body;

            if (!proposalId) {
                return res.status(400).json({ message: "proposalId is required" });
            }
            if (!req.file) {
                return res.status(400).json({ message: "A file is required for submission" });
            }

            const submission = await SubmissionService.submitWork(
                req.user.id,
                req.params.id,
                proposalId,
                req.file,
                message
            );

            res.status(201).json({ message: "Work submitted successfully", submission });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all submissions for an exchange
     * GET /api/marketplace/requests/:id/submissions
     */
    async getSubmissions(req, res, next) {
        try {
            const submissions = await SubmissionService.getSubmissions(
                req.params.id,
                req.user.id
            );
            // Also return approval status
            const approvalStatus = await SubmissionService.checkBothApproved(req.params.id);

            res.status(200).json({ submissions, approvalStatus });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Request revision on a submission
     * POST /api/marketplace/submissions/:id/request-revision
     */
    async requestRevision(req, res, next) {
        try {
            const { revisionNotes } = req.body;
            if (!revisionNotes || !revisionNotes.trim()) {
                return res.status(400).json({ message: "Revision notes are required" });
            }

            const submission = await SubmissionService.requestRevision(
                req.params.id,
                req.user.id,
                revisionNotes
            );

            res.status(200).json({ message: "Revision requested successfully", submission });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Approve a submission — when both sides have approved, auto-complete the exchange.
     * POST /api/marketplace/submissions/:id/approve
     */
    async approveSubmission(req, res, next) {
        try {
            const result = await SubmissionService.approveSubmission(
                req.params.id,
                req.user.id
            );

            // Check if both sides are now approved
            const approvalStatus = await SubmissionService.checkBothApproved(result.requestId);

            // ── Auto-complete exchange when both sides approved ──────────────
            if (approvalStatus.bothApproved) {
                try {
                    await MarketplaceService.completeExchangeInternal(result.requestId);
                    console.log(`[approveSubmission] Exchange auto-completed for request ${result.requestId}`);
                } catch (completeErr) {
                    console.error(`[approveSubmission] Auto-complete failed:`, completeErr.message);
                    // Still return success for the approval itself
                }
            }

            res.status(200).json({
                message: approvalStatus.bothApproved
                    ? "Both sides approved! Exchange completed — credits released."
                    : "Submission approved. Waiting for the other side.",
                submission: result.submission,
                approvalStatus,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new SubmissionController();
