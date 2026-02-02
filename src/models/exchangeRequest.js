const mongoose = require("mongoose");

const exchangeRequestSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        skillSearched: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        category: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        level: {
            type: String,
            enum: ["beginner", "intermediate", "advanced", "expert"],
            required: true,
            index: true,
        },
        whatYouOffer: {
            type: String,
            required: true,
            trim: true,
        },
        estimatedDuration: {
            type: Number,
            required: true,
            min: 0.5, // Minimum 30 minutes
        },
        desiredDeadline: {
            type: Date,
            required: true,
            index: true,
        },
        estimatedCredits: {
            type: Number,
            required: true,
            min: 0,
        },
        complexity: {
            type: String,
            enum: ["simple", "moyen", "complexe", "tres_complexe"],
            required: true,
            default: "moyen",
        },
        location: {
            type: String,
            default: "",
            index: true,
        },
        status: {
            type: String,
            enum: ["open", "in_progress", "completed", "cancelled"],
            default: "open",
            index: true,
        },
        proposals: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExchangeProposal",
        }],
        selectedProposal: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExchangeProposal",
            default: null,
        },
        views: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

// Indexes for search optimization
exchangeRequestSchema.index({ title: "text", description: "text", skillSearched: "text" });
exchangeRequestSchema.index({ status: 1, createdAt: -1 });
exchangeRequestSchema.index({ category: 1, level: 1, location: 1 });

module.exports = mongoose.model("ExchangeRequest", exchangeRequestSchema);

