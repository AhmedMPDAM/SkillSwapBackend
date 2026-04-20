const AdminService = require("../services/Admin");

class AdminController {
    // ── General stats ─────────────────────────────────────────────────────────
    async getStats(req, res, next) {
        try {
            const data = await AdminService.getStats();
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

    // ── User Management ───────────────────────────────────────────────────────
    async getAllUsers(req, res, next) {
        try {
            const { page, limit, search, role } = req.query;
            const data = await AdminService.getAllUsers({ page, limit, search, role });
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

    async getUserDetails(req, res, next) {
        try {
            const data = await AdminService.getUserDetails(req.params.id);
            if (!data) return res.status(404).json({ message: "User not found" });
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

    // ── Exchange Management ───────────────────────────────────────────────────
    async getAllExchanges(req, res, next) {
        try {
            const { page, limit, status, search } = req.query;
            const data = await AdminService.getAllExchanges({ page, limit, status, search });
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

    async getExchangeDetails(req, res, next) {
        try {
            const data = await AdminService.getExchangeDetails(req.params.id);
            if (!data) return res.status(404).json({ message: "Exchange not found" });
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

    // ── Examination Queue ─────────────────────────────────────────────────────
    async getExaminationQueue(req, res, next) {
        try {
            const data = await AdminService.getExaminationQueue();
            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }

    async getProposalForReview(req, res, next) {
        try {
            const result = await AdminService.getProposalForReview(req.params.id);
            if (result.error === "NOT_FOUND")
                return res.status(404).json({ message: "Proposal not found" });
            if (result.error === "NOT_PENDING")
                return res.status(400).json({ message: "This proposal is not awaiting examination" });
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    }

    async reviewProposal(req, res, next) {
        try {
            const { assignedCredits, examinerNote } = req.body;
            const result = await AdminService.reviewProposal({
                proposalId: req.params.id,
                examinerId: req.user.id,
                assignedCredits,
                examinerNote,
            });

            if (result.error === "NOT_FOUND")
                return res.status(404).json({ message: "Proposal not found" });
            if (result.error === "NOT_PENDING")
                return res.status(400).json({ message: "Proposal is not pending examination" });

            res.status(200).json({
                message: "Proposal approved by examiner",
                proposal: result.proposal,
                assignedCredits: result.finalCredits,
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AdminController();
