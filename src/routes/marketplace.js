const express = require("express");
const router = express.Router();
const MarketplaceController = require("../controller/Marketplace");
const authMiddleware = require("../middleware/auth");

// All routes require authentication
router.use(authMiddleware);

// Exchange Requests
router.post("/requests", MarketplaceController.createRequest);
router.get("/requests/feed", MarketplaceController.getFeed);
router.get("/requests/search", MarketplaceController.searchRequests);
router.get("/requests/my", MarketplaceController.getUserRequests);
router.get("/requests/:id", MarketplaceController.getRequestById);
router.put("/requests/:id", MarketplaceController.updateRequest);
router.delete("/requests/:id", MarketplaceController.deleteRequest);
router.get("/requests/:id/proposals", MarketplaceController.getRequestProposals);
router.post("/requests/:id/complete", MarketplaceController.completeExchange);

// Proposals
router.post("/proposals", MarketplaceController.createProposal);
router.get("/proposals/my", MarketplaceController.getUserProposals);
router.post("/proposals/:id/accept", MarketplaceController.acceptProposal);
router.post("/proposals/:id/reject", MarketplaceController.rejectProposal);

// Credits
router.post("/calculate-credits", MarketplaceController.calculateCredits);
router.get("/credits/history", MarketplaceController.getCreditHistory);

module.exports = router;

