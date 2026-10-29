const mongoose = require("mongoose");

const farmerSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
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
        required: true
    },

    // Email verification status
    isVerified: {
        type: Boolean,
        default: false
    },

    // 6-digit email OTP
    otp: {
        type: String,
        default: null
    },

    // OTP expiry time
    otpExpires: {
        type: Date,
        default: null
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

module.exports = mongoose.model("Farmer", farmerSchema);