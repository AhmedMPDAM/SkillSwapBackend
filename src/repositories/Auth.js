const User = require("../models/user");

class UserRepository {
    async findByEmail(email) {
        return User.findOne({ email });
    }

    async create(userData) {
        return User.create(userData);
    }

    async findById(id) {
        return User.findById(id);
    }

    async findByIdAndUpdate(id, updateData) {
        return User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    }

    async findByIdAndPushCertificate(userId, certificateData) {
        return User.findByIdAndUpdate(
            userId,
            { $push: { certificates: certificateData } },
            { new: true, runValidators: true }
        );
    }

    async findByIdAndUpdateCertificate(userId, certificateId, updateData) {
        return User.findOneAndUpdate(
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
        );
    }

    async findByIdAndPullCertificate(userId, certificateId) {
        return User.findByIdAndUpdate(
            userId,
            { $pull: { certificates: { _id: certificateId } } },
            { new: true }
        );
    }
}

module.exports = new UserRepository();
