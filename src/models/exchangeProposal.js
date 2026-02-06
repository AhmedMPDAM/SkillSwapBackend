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
            default: 0, // Will be 4 if admin_quantification is chosen
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "cancelled", "admin_processing"],
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
    },
    { timestamps: true }
);

// Indexes for efficient queries
exchangeProposalSchema.index({ exchangeRequestId: 1, status: 1 });
exchangeProposalSchema.index({ proposerId: 1, status: 1 });

module.exports = mongoose.model("ExchangeProposal", exchangeProposalSchema);

