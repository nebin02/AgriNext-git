const mongoose = require("mongoose");

const cropSchema = new mongoose.Schema({

    farmerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Farmer",
        required: true
    },

    cropName: {
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

    location: {
        type: String,
        required: true
    },

    imageUrl: {
        type: String
    }

});

module.exports = mongoose.model("crops", cropSchema);