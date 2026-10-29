const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({

    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: true
    },

    farmerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Farmer",
        required: true
    },

    cropId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Crop",
        required: true
    },

    cropName: {
        type: String,
        required: true
    },

    customerName: {
        type: String,
        required: true
    },

    customerPhone: {
        type: String,
        required: true
    },
    customerEmail: {
    type: String,
    required: true
},

    quantity: {
        type: Number,
        required: true
    },

    unit: {
        type: String,
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    subtotal: {
        type: Number,
        default: function () {
            return this.totalAmount;
        }
    },

    discountPercentage: {
        type: Number,
        default: 0
    },

    discountAmount: {
        type: Number,
        default: 0
    },

    finalAmount: {
        type: Number,
        default: function () {
            return this.totalAmount;
        }
    },

    totalAmount: {
        type: Number,
        required: true
    },

    razorpayOrderId: {
        type: String,
        default: null
    },

    razorpayPaymentId: {
        type: String,
        default: null
    },

    address: {
        type: String,
        required: true
    },

    paymentMethod: {
        type: String,
        enum: ["COD", "UPI"],
        required: true
    },

    paymentStatus: {
        type: String,
        enum: ["Pending", "Paid", "Failed"],
        default: "Pending"
    },

    orderStatus: {
        type: String,
        default: "Pending"
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Order", orderSchema);