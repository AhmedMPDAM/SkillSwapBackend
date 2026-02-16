const CreditHistory = require("../models/creditHistory");

class CreditRepository {
    async create(data) {
        return await CreditHistory.create(data);
    }

    async find(query, sort = { createdAt: -1 }, limit = 50, skip = 0) {
        return await CreditHistory.find(query)
            .sort(sort)
            .limit(limit)
            .skip(skip)
            .populate("relatedRequest", "title")
            .populate("relatedProposal", "coverLetter")
            .lean();
    }

    async findOne(query) {
        return await CreditHistory.findOne(query).lean();
    }
}

module.exports = CreditRepository;
