const UserRepository = require("../repositories/Auth");

class ProfileController {
    async getProfile(req, res, next) {
        try {
         
            const user = await UserRepository.findById(req.user.id);
            if (!user) {
                
                return res.status(404).json({ message: "User not found" });
            }
       
            // Convert mongoose document to plain object and remove password
            const userObject = user.toObject();
            delete userObject.password;
            res.status(200).json(userObject);
        } catch (error) {
            console.error('Error in getProfile:', error);
            console.error('Error stack:', error.stack);
            next(error);
        }
    }

    async updateProfile(req, res, next) {
        try {
            const {
                fullName,
                bio,
                location,
                socialLinks,
            } = req.body;

            const updateData = {
                fullName,
                bio,
                location,
                socialLinks,
            };

            // Add profile image if file was uploaded
            if (req.file) {
                updateData.profileImage = req.file.path;
            }

            const user = await UserRepository.findByIdAndUpdate(req.user.id, updateData);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            res.status(200).json({ message: "Profile updated successfully", user });
        } catch (error) {
            next(error);
        }
    }

    async addCertificate(req, res, next) {
        try {
            const { name, date, issuedBy } = req.body;

            if (!name || !date || !issuedBy) {
                return res.status(400).json({ message: "Name, date, and issuedBy are required" });
            }

            const certificateData = {
                name,
                date,
                issuedBy,
                documentUrl: req.file ? req.file.path : null,
            };

            const user = await UserRepository.findByIdAndPushCertificate(req.user.id, certificateData);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            res.status(201).json({ message: "Certificate added successfully", user });
        } catch (error) {
            next(error);
        }
    }

    async updateCertificate(req, res, next) {
        try {
            const { certificateId } = req.params;
            const { name, date, issuedBy } = req.body;

            const updateData = { name, date, issuedBy };
            if (req.file) {
                updateData.documentUrl = req.file.path;
            }

            const user = await UserRepository.findByIdAndUpdateCertificate(
                req.user.id,
                certificateId,
                updateData
            );
            if (!user) {
                return res.status(404).json({ message: "User or certificate not found" });
            }

            res.status(200).json({ message: "Certificate updated successfully", user });
        } catch (error) {
            next(error);
        }
    }

    async deleteCertificate(req, res, next) {
        try {
            const { certificateId } = req.params;

            const user = await UserRepository.findByIdAndPullCertificate(req.user.id, certificateId);
            if (!user) {
                return res.status(404).json({ message: "User or certificate not found" });
            }

            res.status(200).json({ message: "Certificate deleted successfully", user });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ProfileController();
