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
            const { userId } = req.body;
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ message: 'Missing or invalid token' });
            }

            const token = authHeader.slice(7);

            // Call logout service to invalidate token or clear session
            await AuthService.logout(userId, token);

            res.status(200).json({ 
                message: 'Successfully logged out',
                success: true 
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AuthController();
