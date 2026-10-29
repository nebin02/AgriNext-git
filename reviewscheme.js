const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
    {
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

        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true,
            unique: true
        },

        customerName: {
            type: String,
            required: true
        },

        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },

        comment: {
            type: String,
            required: true,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Review", reviewSchema);