const RatingRepositoryClass = require("../repositories/Rating");
const ratingRepository = new RatingRepositoryClass();

// ── Badge milestone thresholds ──────────────────────────────────────────────
const BADGE_MILESTONES = [
    { threshold: 5, label: "Rising Star", icon: "star-outline" },
    { threshold: 10, label: "Trusted Trader", icon: "shield-checkmark-outline" },
    { threshold: 25, label: "Expert Exchanger", icon: "trophy-outline" },
    { threshold: 50, label: "Master Swapper", icon: "diamond-outline" },
    { threshold: 100, label: "Legend", icon: "flame-outline" },
];

class RatingService {
    /**
     * Create a rating for a completed exchange.
     * The rater is the request owner; the rated user is the proposer.
     */
    async createRating({ raterId, ratedUserId, proposalId, exchangeRequestId, stars, comment }) {
        // Validate stars
        if (!stars || stars < 1 || stars > 5) {
            throw new Error("Rating must be between 1 and 5 stars");
        }

        // Validate comment length
        if (comment && comment.length > 500) {
            throw new Error("Comment cannot exceed 500 characters");
        }

        // Check if rating already exists for this exchange by this rater
        const existing = await ratingRepository.findOne({ raterId, exchangeRequestId });
        if (existing) {
            throw new Error("You have already rated this exchange");
        }

        // Verify the exchange is completed
        const request = await ratingRepository.findRequestById(exchangeRequestId);
        if (!request || request.status !== "completed") {
            throw new Error("You can only rate completed exchanges");
        }

        return await ratingRepository.createRating({
            exchangeRequestId,
            proposalId,
            raterId,
            ratedUserId,
            stars,
            comment: comment || "",
        });
    }

    /**
     * Get all ratings received by a user (paginated, newest first)
     */
    async getUserRatingsReceived(userId, limit = 50, skip = 0) {
        return await ratingRepository.getRatingsReceived(userId, limit, skip);
    }

    /**
     * Get all ratings given by a user (paginated)
     */
    async getUserRatingsGiven(userId, limit = 50, skip = 0) {
        return await ratingRepository.getRatingsGiven(userId, limit, skip);
    }

    /**
     * Calculate the average rating (stars) for a user
     */
    async getUserAverageRating(userId) {
        const result = await ratingRepository.getAverageRating(userId);

        if (result.length === 0) {
            return { average: 0, count: 0 };
        }

        return {
            average: Math.round(result[0].average * 10) / 10, // 1 decimal
            count: result[0].count,
        };
    }

    /**
     * Count completed exchanges for a user (as proposer or request owner)
     */
    async getCompletedExchangeCount(userId) {
        const asOwner = await ratingRepository.countCompletedAsOwner(userId);
        const proposerCount = await ratingRepository.countCompletedAsProposer(userId);
        return asOwner + proposerCount;
    }

    /**
     * Get badges earned based on completed exchange count
     */
    getBadgesForCount(completedCount) {
        return BADGE_MILESTONES.filter((b) => completedCount >= b.threshold);
    }

    /**
     * Get top-rated users with optional filters.
     * Returns a flat list of users sorted by average rating.
     */
    async getTopRatedUsers({ category, search, minRating, minExchanges, limit, skip } = {}) {
        const User = require("../models/user");

        // Step 1: Aggregate ratings to get average rating per user
        const ratingResults = await ratingRepository.aggregateTopRated(minRating);

        // Step 2: Get user details
        const userIds = ratingResults.map((r) => r._id);
        const users = await User.find({ _id: { $in: userIds } })
            .select("fullName profileImage skills bio location")
            .lean();

        // Step 3: Get categories each user has participated in
        const exchangeCategories = await ratingRepository.getCategoriesAsOwner(userIds);
        const proposalCategories = await ratingRepository.getCategoriesAsProposer(userIds);

        // Merge categories
        const categoryMap = {};
        exchangeCategories.forEach((ec) => {
            categoryMap[ec._id.toString()] = new Set(ec.categories);
        });
        proposalCategories.forEach((pc) => {
            const key = pc._id.toString();
            if (!categoryMap[key]) categoryMap[key] = new Set();
            pc.categories.forEach((c) => categoryMap[key].add(c));
        });

        // Step 4: Build result
        const userMap = {};
        users.forEach((u) => {
            userMap[u._id.toString()] = u;
        });

        let result = ratingResults
            .map((r) => {
                const user = userMap[r._id.toString()];
                if (!user) return null;
                const cats = categoryMap[r._id.toString()]
                    ? Array.from(categoryMap[r._id.toString()])
                    : [];
                return {
                    _id: user._id,
                    fullName: user.fullName,
                    profileImage: user.profileImage,
                    skills: user.skills,
                    bio: user.bio,
                    location: user.location,
                    averageRating: Math.round(r.averageRating * 10) / 10,
                    totalRatings: r.totalRatings,
                    categories: cats,
                };
            })
            .filter(Boolean);

        // Apply category filter
        if (category) {
            result = result.filter((u) =>
                u.categories.some((c) => c.toLowerCase() === category.toLowerCase())
            );
        }

        // Apply search filter
        if (search) {
            const searchLower = search.toLowerCase();
            result = result.filter(
                (u) =>
                    u.fullName.toLowerCase().includes(searchLower) ||
                    (u.skills && u.skills.some((s) => s.toLowerCase().includes(searchLower))) ||
                    (u.bio && u.bio.toLowerCase().includes(searchLower))
            );
        }

        // Apply minimum exchanges filter
        if (minExchanges) {
            result = result.filter((u) => u.totalRatings >= parseInt(minExchanges));
        }

        // Pagination
        const total = result.length;
        const paginatedResult = result.slice(
            parseInt(skip) || 0,
            (parseInt(skip) || 0) + (parseInt(limit) || 50)
        );

        return { users: paginatedResult, total };
    }

    /**
     * Get top-rated users grouped by category.
     */
    async getTopRatedByCategory({ limit } = {}) {
        const Category = require("../models/category");
        const { users } = await this.getTopRatedUsers({ limit: 200 });

        // Get all categories
        const categories = await Category.find().lean();

        const grouped = {};

        // Initialize with database categories
        categories.forEach((cat) => {
            grouped[cat.name] = [];
        });

        // Group users by category
        users.forEach((user) => {
            user.categories.forEach((cat) => {
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(user);
            });
        });

        // Sort each category by rating and limit
        const perCategoryLimit = parseInt(limit) || 10;
        const result = Object.keys(grouped)
            .filter((cat) => grouped[cat].length > 0)
            .map((cat) => ({
                category: cat,
                users: grouped[cat]
                    .sort((a, b) => b.averageRating - a.averageRating || b.totalRatings - a.totalRatings)
                    .slice(0, perCategoryLimit),
            }));

        return result;
    }

    /**
     * Get full user stats: average rating, completed exchanges, badges
     */
    async getUserStats(userId) {
        const [ratingInfo, completedCount] = await Promise.all([
            this.getUserAverageRating(userId),
            this.getCompletedExchangeCount(userId),
        ]);

        const badges = this.getBadgesForCount(completedCount);

        // Next badge info
        const nextBadge = BADGE_MILESTONES.find((b) => completedCount < b.threshold) || null;

        return {
            averageRating: ratingInfo.average,
            totalRatings: ratingInfo.count,
            completedExchanges: completedCount,
            badges,
            nextBadge: nextBadge
                ? {
                    ...nextBadge,
                    remaining: nextBadge.threshold - completedCount,
                }
                : null,
        };
    }
}

module.exports = new RatingService();
