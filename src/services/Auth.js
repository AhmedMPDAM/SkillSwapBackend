const bcrypt = require("bcryptjs");
const UserRepository = require("../repositories/Auth");
const TokenService = require("./Token");
const CreditService = require("./Credit");

class AuthService {
  async register(data) {
    const existingUser = await UserRepository.findByEmail(data.email);
    if (existingUser) throw new Error("Email already in use");

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await UserRepository.create({ ...data, password: hashedPassword });

    // Initialize user credits (5 crédits de démarrage)
    await CreditService.initializeUserCredits(user._id);

    // Generate tokens on registration
    const accessToken = TokenService.generateAccessToken({ id: user._id });
    const refreshToken = TokenService.generateRefreshToken({ id: user._id });

    return { user, accessToken, refreshToken };
  }

  async login(email, password) {
    const user = await UserRepository.findByEmail(email);
    if (!user) throw new Error("Invalid credentials");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error("Invalid credentials");

    const accessToken = TokenService.generateAccessToken({ id: user._id });
    const refreshToken = TokenService.generateRefreshToken({ id: user._id });

    return { user, accessToken, refreshToken };
  }

  async refreshTokens(refreshToken) {
    try {
      const payload = TokenService.verifyRefreshToken(refreshToken);
      const user = await UserRepository.findById(payload.id);
      if (!user) throw new Error("User not found");

      const newAccessToken = TokenService.generateAccessToken({ id: user._id });
      const newRefreshToken = TokenService.generateRefreshToken({ id: user._id });

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (err) {
      throw new Error("Invalid refresh token");
    }
  }


}

module.exports = new AuthService();
