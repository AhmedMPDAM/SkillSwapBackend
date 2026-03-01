const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
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
        submitterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // File information
        fileName: {
            type: String,
            required: true,
            trim: true,
        },
        filePath: {
            type: String,
            required: true,
        },
        fileSize: {
            type: Number,
            default: 0,
        },
        fileMimeType: {
            type: String,
            default: "",
        },
        // Optional message from the submitter
        message: {
            type: String,
            default: "",
            trim: true,
        },
        // Status of this submission
        status: {
            type: String,
            enum: ["pending_review", "revision_requested", "approved"],
            default: "pending_review",
            index: true,
        },
        // Revision notes from the request owner (when asking for modifications)
        revisionNotes: {
            type: String,
            default: "",
            trim: true,
        },
        // Which revision number this submission is (1st, 2nd, etc.)
        revisionNumber: {
            type: Number,
            default: 1,
            min: 1,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes for efficient queries
submissionSchema.index({ exchangeRequestId: 1, createdAt: -1 });
submissionSchema.index({ proposalId: 1, status: 1 });

module.exports = mongoose.model("Submission", submissionSchema);
