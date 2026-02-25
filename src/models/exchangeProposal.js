const mongoose = require("mongoose");

const exchangeProposalSchema = new mongoose.Schema(
    {
        exchangeRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExchangeRequest",
            required: true,
            index: true,
        },
        proposerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        coverLetter: {
            type: String,
            required: true,
            trim: true,
        },
        acceptanceType: {
            type: String,
            enum: ["accept_deal", "admin_quantification"],
            required: true,
        },
        admin_quantification_cost: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "cancelled", "admin_processing", "examiner_approved"],
            default: "pending",
            index: true,
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
            default: null,
        },
        feedback: {
            type: String,
            default: "",
        },
        // ── Examiner review fields ──────────────────────────────────────────
        examinerReview: {
            examinerId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            // Credits the examiner sets (overrides estimated if provided)
            assignedCredits: {
                type: Number,
                default: null,
            },
            // The examiner's covering letter / note to the proposer
            examinerNote: {
                type: String,
                default: "",
            },
            reviewedAt: {
                type: Date,
                default: null,
            },
        },
    },
    { timestamps: true }
);

// Indexes for efficient queries
exchangeProposalSchema.index({ exchangeRequestId: 1, status: 1 });
exchangeProposalSchema.index({ proposerId: 1, status: 1 });

module.exports = mongoose.model("ExchangeProposal", exchangeProposalSchema);
