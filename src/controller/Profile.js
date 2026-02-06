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
                socialLinks: typeof socialLinks === 'string' ? JSON.parse(socialLinks) : socialLinks,
            };

            // Add profile image if file was uploaded
            if (req.file) {

                // Normalize path to use forward slashes and be relative to uploads folder
                const filePath = req.file.path.replace(/\\/g, '/');
                const uploadsIndex = filePath.indexOf('uploads');
                updateData.profileImage = uploadsIndex > -1
                    ? filePath.substring(uploadsIndex)
                    : filePath;
            }

            const user = await UserRepository.findByIdAndUpdate(req.user.id, updateData);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            // Return user without password
            const userObject = user.toObject();
            delete userObject.password;
            res.status(200).json({ message: "Profile updated successfully", user: userObject });
        } catch (error) {
            console.error('❌ Error in updateProfile:', error);
            console.error('Error stack:', error.stack);
            next(error);
        }
    }

    async addCertificate(req, res, next) {
        try {
            const { name, date, issuedBy } = req.body;

            if (!name || !date || !issuedBy) {
                return res.status(400).json({ message: "Name, date, and issuedBy are required" });
            }

            let documentUrl = null;
            if (req.file) {
                // Normalize path to use forward slashes and be relative to uploads folder
                const filePath = req.file.path.replace(/\\/g, '/');
                const uploadsIndex = filePath.indexOf('uploads');
                documentUrl = uploadsIndex > -1
                    ? filePath.substring(uploadsIndex)
                    : filePath;
            }

            const certificateData = {
                name,
                date,
                issuedBy,
                documentUrl,
            };

            const user = await UserRepository.findByIdAndPushCertificate(req.user.id, certificateData);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            const userObject = user.toObject();
            delete userObject.password;
            res.status(201).json({ message: "Certificate added successfully", user: userObject });
        } catch (error) {
            console.error('Error in addCertificate:', error);
            next(error);
        }
    }

    async updateCertificate(req, res, next) {
        try {
            const { certificateId } = req.params;
            const { name, date, issuedBy } = req.body;

            const updateData = { name, date, issuedBy };
            if (req.file) {
                // Normalize path to use forward slashes and be relative to uploads folder
                const filePath = req.file.path.replace(/\\/g, '/');
                const uploadsIndex = filePath.indexOf('uploads');
                updateData.documentUrl = uploadsIndex > -1
                    ? filePath.substring(uploadsIndex)
                    : filePath;
            }

            const user = await UserRepository.findByIdAndUpdateCertificate(
                req.user.id,
                certificateId,
                updateData
            );
            if (!user) {
                return res.status(404).json({ message: "User or certificate not found" });
            }

            const userObject = user.toObject();
            delete userObject.password;
            res.status(200).json({ message: "Certificate updated successfully", user: userObject });
        } catch (error) {
            console.error('Error in updateCertificate:', error);
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

            const userObject = user.toObject();
            delete userObject.password;
            res.status(200).json({ message: "Certificate deleted successfully", user: userObject });
        } catch (error) {
            console.error('Error in deleteCertificate:', error);
            next(error);
        }
    }
}

module.exports = new ProfileController();
