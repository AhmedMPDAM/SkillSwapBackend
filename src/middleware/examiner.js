const examinerMiddleware = (req, res, next) => {
    if (req.user && (req.user.role === "examiner" || req.user.role === "admin")) {
        next();
    } else {
        res.status(403).json({ message: "Access denied. Examiner role required." });
    }
};

module.exports = examinerMiddleware;
