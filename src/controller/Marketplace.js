const MarketplaceService = require("../services/Marketplace");
const CreditService = require("../services/Credit");

class MarketplaceController {
    /**
     * Create a new exchange request
     * POST /api/marketplace/requests
     */
    async createRequest(req, res, next) {
        try {
            const request = await MarketplaceService.createRequest(req.user.id, req.body);
            res.status(201).json({
                message: "Exchange request created successfully",
                request,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get feed of exchange requests
     * GET /api/marketplace/requests/feed
     */
    async getFeed(req, res, next) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const filters = {};

            if (req.query.status) {
                filters.status = req.query.status;
            }

            const result = await MarketplaceService.getFeed(page, limit, filters);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Search exchange requests with filters
     * GET /api/marketplace/requests/search
     */
    async searchRequests(req, res, next) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const searchQuery = req.query.q || "";
            
            const filters = {};
            if (req.query.skillSearched) filters.skillSearched = req.query.skillSearched;
            if (req.query.category) filters.category = req.query.category;
            if (req.query.level) filters.level = req.query.level;
            if (req.query.location) filters.location = req.query.location;
            if (req.query.minCredits) filters.minCredits = parseFloat(req.query.minCredits);
            if (req.query.maxCredits) filters.maxCredits = parseFloat(req.query.maxCredits);
            if (req.query.deadline) filters.deadline = req.query.deadline;

            const result = await MarketplaceService.searchRequests(searchQuery, filters, page, limit);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get request by ID
     * GET /api/marketplace/requests/:id
     */
    async getRequestById(req, res, next) {
        try {
            const request = await MarketplaceService.getRequestById(req.params.id);
            res.status(200).json(request);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get user's requests
     * GET /api/marketplace/requests/my
     */
    async getUserRequests(req, res, next) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const result = await MarketplaceService.getUserRequests(req.user.id, page, limit);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Update request
     * PUT /api/marketplace/requests/:id
     */
    async updateRequest(req, res, next) {
        try {
            const request = await MarketplaceService.updateRequest(
                req.params.id,
                req.user.id,
                req.body
            );
            res.status(200).json({
                message: "Request updated successfully",
                request,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete request
     * DELETE /api/marketplace/requests/:id
     */
    async deleteRequest(req, res, next) {
        try {
            await MarketplaceService.deleteRequest(req.params.id, req.user.id);
            res.status(200).json({ message: "Request deleted successfully" });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Create a proposal
     * POST /api/marketplace/proposals
     */
    async createProposal(req, res, next) {
        try {
            const { requestId, coverLetter, proposedDuration, proposedCredits } = req.body;

            if (!requestId) {
                return res.status(400).json({ message: "requestId is required" });
            }

            const proposal = await MarketplaceService.createProposal(
                req.user.id,
                requestId,
                { coverLetter, proposedDuration, proposedCredits }
            );

            res.status(201).json({
                message: "Proposal created successfully",
                proposal,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get proposals for a request
     * GET /api/marketplace/requests/:id/proposals
     */
    async getRequestProposals(req, res, next) {
        try {
            const proposals = await MarketplaceService.getRequestProposals(
                req.params.id,
                req.user.id
            );
            res.status(200).json({ proposals });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get user's proposals
     * GET /api/marketplace/proposals/my
     */
    async getUserProposals(req, res, next) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const result = await MarketplaceService.getUserProposals(req.user.id, page, limit);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Accept a proposal
     * POST /api/marketplace/proposals/:id/accept
     */
    async acceptProposal(req, res, next) {
        try {
            const { requestId } = req.body;
            if (!requestId) {
                return res.status(400).json({ message: "requestId is required" });
            }

            const proposal = await MarketplaceService.acceptProposal(
                requestId,
                req.params.id,
                req.user.id
            );

            res.status(200).json({
                message: "Proposal accepted successfully",
                proposal,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Reject a proposal
     * POST /api/marketplace/proposals/:id/reject
     */
    async rejectProposal(req, res, next) {
        try {
            const proposal = await MarketplaceService.rejectProposal(
                req.params.id,
                req.user.id
            );

            res.status(200).json({
                message: "Proposal rejected successfully",
                proposal,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Complete an exchange
     * POST /api/marketplace/requests/:id/complete
     */
    async completeExchange(req, res, next) {
        try {
            const { rating, feedback } = req.body;
            const request = await MarketplaceService.completeExchange(
                req.params.id,
                req.user.id,
                rating,
                feedback
            );

            res.status(200).json({
                message: "Exchange completed successfully",
                request,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Calculate credits
     * POST /api/marketplace/calculate-credits
     */
    async calculateCredits(req, res, next) {
        try {
            const { estimatedHours, complexity } = req.body;

            if (!estimatedHours || !complexity) {
                return res.status(400).json({
                    message: "estimatedHours and complexity are required",
                });
            }

            const credits = CreditService.calculateCredits(estimatedHours, complexity);

            res.status(200).json({
                estimatedHours,
                complexity,
                credits,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get credit history
     * GET /api/marketplace/credits/history
     */
    async getCreditHistory(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const skip = parseInt(req.query.skip) || 0;
            const history = await CreditService.getCreditHistory(req.user.id, limit, skip);
            res.status(200).json({ history });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new MarketplaceController();

