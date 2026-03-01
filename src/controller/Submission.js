const SubmissionService = require("../services/Submission");
const MarketplaceService = require("../services/Marketplace");

class SubmissionController {
    /**
     * Submit work for an exchange
     * POST /api/marketplace/requests/:id/submissions
     * Body: file (multipart), message, proposalId
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

            res.status(201).json({
                message: "Work submitted successfully",
                submission,
            });
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

            res.status(200).json({ submissions });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Request revision on a submission
     * POST /api/marketplace/submissions/:id/request-revision
     * Body: revisionNotes
     */
    async requestRevision(req, res, next) {
        try {
            const { revisionNotes } = req.body;

            if (!revisionNotes || !revisionNotes.trim()) {
                return res.status(400).json({
                    message: "Revision notes are required",
                });
            }

            const submission = await SubmissionService.requestRevision(
                req.params.id,
                req.user.id,
                revisionNotes
            );

            res.status(200).json({
                message: "Revision requested successfully",
                submission,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Approve a submission and complete the exchange
     * POST /api/marketplace/submissions/:id/approve
     * Body: rating (optional), feedback (optional)
     */
    async approveSubmission(req, res, next) {
        try {
            const { rating, feedback } = req.body;

            const result = await SubmissionService.approveSubmission(
                req.params.id,
                req.user.id
            );

            // Now trigger the exchange completion (credit transfer)
            const request = await MarketplaceService.completeExchange(
                result.requestId,
                req.user.id,
                rating,
                feedback
            );

            res.status(200).json({
                message: "Submission approved and exchange completed successfully",
                submission: result.submission,
                request,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new SubmissionController();
