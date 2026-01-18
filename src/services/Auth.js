const bcrypt = require("bcryptjs");
const UserRepository = require("../repositories/Auth");

class AuthService {
    async register(data) {
        const existingUser = await UserRepository.findByEmail(data.email);

        if (existingUser) {
            throw new Error("Email already in use");
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        return UserRepository.create({
            ...data,
            password: hashedPassword,
        });
    }

    async login(email, password) {
        const user = await UserRepository.findByEmail(email);

        if (!user) {
            throw new Error("Invalid credentials");
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            throw new Error("Invalid credentials");
        }

        return user;
    }
}

module.exports = new AuthService();
