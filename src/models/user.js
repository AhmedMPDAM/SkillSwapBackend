const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        date: { type: Date, required: true },
        issuedBy: { type: String, required: true },
        documentUrl: { type: String, default: null },
    },
    { timestamps: true }
);

const userSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true },
        bio: { type: String, default: "" },
        location: { type: String, default: "" },
        profileImage: { type: String, default: null },
        languages: [{ type: String }],
        skills: [{ type: String }],
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        acceptedGuidelines: { type: Boolean, default: false },
        socialLinks: {
            facebook: { type: String, default: "" },
            instagram: { type: String, default: "" },
            twitter: { type: String, default: "" },
            linkedin: { type: String, default: "" },
            github: { type: String, default: "" },
            portfolio: { type: String, default: "" },
        },
        certificates: [certificateSchema],
        credits: { type: Number, default: 5, min: 0 }, // 5 crédits de démarrage
        role: { type: String, enum: ["user", "admin"], default: "user" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
