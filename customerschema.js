const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({

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

    // Email verification
    isVerified: {
        type: Boolean,
        default: false
    },

    // 6 digit OTP
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

module.exports = mongoose.model("Customer", customerSchema);