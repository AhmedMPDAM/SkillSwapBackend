const Submission = require("../models/submission");

class SubmissionRepository {
    /**
     * Create a new submission
     */
    async createSubmission(data) {
        return await Submission.create(data);
    }

    /**
     * Count submissions matching a query
     */
    async countSubmissions(query) {
        return await Submission.countDocuments(query);
    }

    /**
     * Get all submissions for a request, populated, newest first
     */
    async findByRequest(requestId) {
        return await Submission.find({ exchangeRequestId: requestId })
            .populate("submitterId", "fullName profileImage")
            .sort({ createdAt: -1 })
            .lean();
    }

    /**
     * Find a single submission by ID
     */
    async findById(submissionId) {
        return await Submission.findById(submissionId).lean();
    }

    /**
     * Update a submission by ID
     */
    async updateSubmission(submissionId, updateData) {
        return await Submission.findByIdAndUpdate(
            submissionId,
            { $set: updateData },
            { new: true }
        ).lean();
    }

    /**
     * Find one submission matching a query
     */
    async findOne(query) {
        return await Submission.findOne(query).lean();
    }
}

module.exports = SubmissionRepository;
