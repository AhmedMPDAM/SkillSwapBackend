const AuthService = require("../services/Auth");

class AuthController {
    async register(req, res, next) {
        try {
            const user = await AuthService.register(req.body);
            res.status(201).json(user);
        } catch (error) {
            next(error);
        }
    }

    async login(req, res, next) {
        try {
            const user = await AuthService.login(
                req.body.email,
                req.body.password
            );
            res.status(200).json(user);
        } catch (error) {
            next(error);
        }
    }

    async refresh(req, res, next) {
        try {
            const { refreshToken } = req.body;
            const tokens = await AuthService.refreshTokens(refreshToken);
            res.status(200).json(tokens);
        } catch (error) {
            next(error);
        }
    }

    async logout(req, res, next) {
        try {
            // Since we're using JWT tokens (stateless), we just need to confirm the logout
            // The client will clear the tokens from storage
            res.status(200).json({ message: 'Logged out successfully' });
        } catch (error) {
            next(error);
        }
    }

}

module.exports = new AuthController();
