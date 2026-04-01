const CreditRepositoryClass = require("../repositories/Credit");
const creditRepository = new CreditRepositoryClass();
const UserRepositoryClass = require("../repositories/Auth");
const userRepository = new UserRepositoryClass();

class CreditService {
    /**
     * Calculate credits based on estimated hours and complexity
     * Formula: Crédits = Heures estimées × Multiplicateur de complexité
     * 
     * Multipliers:
     * - Simple: 1x
     * - Medium: 1.5x
     * - Advanced: 2x
     * - Expert: 2.5x
     */
    calculateCredits(estimatedHours, complexity) {
        const multipliers = {
            simple: 1,
            medium: 1.5,
            advanced: 2,
            expert: 2.5,
        };

        const multiplier = multipliers[complexity] || multipliers.medium;
        const credits = Math.round(estimatedHours * multiplier * 10) / 10; // Round to 1 decimal

        return credits;
    }

    /**
     * Add credits to user account and create history entry
     */
    async addCredits(userId, amount, description, relatedRequest = null, relatedProposal = null) {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new Error("User not found");
        }

        const newBalance = (user.credits || 0) + amount;

        // Update user credits
        await userRepository.updateUser(userId, { credits: newBalance });

        // Create history entry
        await creditRepository.create({
            userId,
            type: "gain",
            amount,
            balanceAfter: newBalance,
            description,
            relatedRequest,
            relatedProposal,
        });

        return newBalance;
    }

    /**
     * Deduct credits from user account and create history entry
     */
    async deductCredits(userId, amount, description, relatedRequest = null, relatedProposal = null) {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new Error("User not found");
        }

        const currentCredits = user.credits || 0;
        if (currentCredits < amount) {
            throw new Error("Insufficient credits");
        }

        const newBalance = currentCredits - amount;

        // Update user credits
        await userRepository.updateUser(userId, { credits: newBalance });

        // Create history entry
        await creditRepository.create({
            userId,
            type: "depense",
            amount,
            balanceAfter: newBalance,
            description,
            relatedRequest,
            relatedProposal,
        });

        return newBalance;
    }

    /**
     * Get credit history for a user
     */
    async getCreditHistory(userId, limit = 50, skip = 0) {
        return await creditRepository.find({ userId }, { createdAt: -1 }, limit, skip);
    }

    /**
     * Initialize user with 5 starting credits
     */
    async initializeUserCredits(userId) {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw new Error("User not found");
        }

        // Check if user already has a starting bonus in history
        const existingBonus = await creditRepository.findOne({
            userId,
            type: "bonus_demarrage",
        });

        // Only initialize if no starting bonus exists
        if (!existingBonus) {
            // Ensure user has 5 credits (in case default wasn't applied)
            if (!user.credits || user.credits === 0) {
                await userRepository.updateUser(userId, { credits: 5 });
            }

            // Create history entry for starting bonus
            await creditRepository.create({
                userId,
                type: "bonus_demarrage",
                amount: 5,
                balanceAfter: 5,
                description: "Crédits de démarrage - Nouveau compte",
            });
        }
    }
}

module.exports = new CreditService();
