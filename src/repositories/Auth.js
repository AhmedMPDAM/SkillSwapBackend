const User = require("../models/user");

class UserRepository {
    async findByEmail(email) {
        return User.findOne({ email });
    }

    async create(userData) {
        return User.create(userData);
    }
}

module.exports = new UserRepository();
