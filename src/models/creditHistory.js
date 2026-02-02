const mongoose = require("mongoose");

const creditHistorySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ["gain", "depense", "bonus_demarrage"],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        balanceAfter: {
            type: Number,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        relatedRequest: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExchangeRequest",
            default: null,
        },
        relatedProposal: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExchangeProposal",
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes for efficient queries
creditHistorySchema.index({ userId: 1, createdAt: -1 });
creditHistorySchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("CreditHistory", creditHistorySchema);

