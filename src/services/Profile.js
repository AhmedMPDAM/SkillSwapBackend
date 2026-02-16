const UserRepositoryClass = require("../repositories/Auth");
const userRepository = new UserRepositoryClass();

class ProfileService {
    async getProfile(userId) {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new Error("User not found");
        }
        return user;
    }

    async updateProfile(userId, updateData) {
        const user = await userRepository.updateUser(userId, updateData);
        if (!user) {
            throw new Error("User not found");
        }
        return user;
    }

    async addCertificate(userId, certificateData) {
        const user = await userRepository.addCertificate(userId, certificateData);
        if (!user) {
            throw new Error("User not found");
        }
        return user;
    }

    async updateCertificate(userId, certificateId, updateData) {
        const user = await userRepository.updateCertificate(userId, certificateId, updateData);
        if (!user) {
            throw new Error("User or certificate not found");
        }
        return user;
    }

    async deleteCertificate(userId, certificateId) {
        const user = await userRepository.removeCertificate(userId, certificateId);
        if (!user) {
            throw new Error("User or certificate not found");
        }
        return user;
    }
}

module.exports = new ProfileService();
