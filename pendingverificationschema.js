const mongoose = require("mongoose");

const pendingVerificationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true
    },

    phone: {
        type: String,
        required: true
    },

    password: {
        type: String,
        required: true
    },

    address: {
        type: String,
        required: true
    },

    farmLocation: {
        type: String,
        default: ""
    },

    userType: {
        type: String,
        enum: ["customer", "farmer"],
        required: true
    },

    otp: {
        type: String,
        required: true
    },

    otpExpires: {
        type: Date,
        required: true
    },

    otpAttempts: {
        type: Number,
        default: 0
    },

    lastOtpSentAt: {
        type: Date,
        default: null
    }
});

module.exports = mongoose.model(
    "PendingVerification",
    pendingVerificationSchema
);