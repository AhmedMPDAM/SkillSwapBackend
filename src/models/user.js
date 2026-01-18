const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true },
        bio: { type: String, default: "" },
        location: { type: String, default: "" },
        languages: [{ type: String }],
        skills: [{ type: String }],
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        acceptedGuidelines: { type: Boolean, default: false },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
