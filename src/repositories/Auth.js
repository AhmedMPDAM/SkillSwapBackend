const User = require("../models/user");

class UserRepository {
    async findByEmail(email) {
        return await User.findOne({ email }).lean();
    }

    async create(userData) {
        return await User.create(userData);
    }

    async findById(id) {
        return await User.findById(id).lean();
    }

    async updateUser(id, updateData) {
        return await User.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).lean();
    }

    async updateUserRaw(id, updateQuery) {
        return await User.findByIdAndUpdate(id, updateQuery, { new: true, runValidators: true }).lean();
    }

    async addCertificate(userId, certificateData) {
        return await User.findByIdAndUpdate(
            userId,
            { $push: { certificates: certificateData } },
            { new: true, runValidators: true }
        ).lean();
    }

    async updateCertificate(userId, certificateId, updateData) {
        return await User.findOneAndUpdate(
            { _id: userId, "certificates._id": certificateId },
            {
                $set: {
                    "certificates.$.name": updateData.name,
                    "certificates.$.date": updateData.date,
                    "certificates.$.issuedBy": updateData.issuedBy,
                    ...(updateData.documentUrl && { "certificates.$.documentUrl": updateData.documentUrl }),
                },
            },
            { new: true, runValidators: true }
        ).lean();
    }

    async removeCertificate(userId, certificateId) {
        return await User.findByIdAndUpdate(
            userId,
            { $pull: { certificates: { _id: certificateId } } },
            { new: true }
        ).lean();
    }
}

module.exports = UserRepository;
