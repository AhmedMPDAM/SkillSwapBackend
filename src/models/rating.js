const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
    {
        exchangeRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExchangeRequest",
            required: true,
            index: true,
        },
        proposalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ExchangeProposal",
            required: true,
            index: true,
        },
        raterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        ratedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        stars: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: String,
            default: "",
            maxlength: 500,
            trim: true,
        },
    },
    { timestamps: true }
);

// Prevent duplicate ratings: one rating per user per exchange
ratingSchema.index({ raterId: 1, exchangeRequestId: 1 }, { unique: true });
// Efficient lookup for a user's received ratings
ratingSchema.index({ ratedUserId: 1, createdAt: -1 });

module.exports = mongoose.model("Rating", ratingSchema);
