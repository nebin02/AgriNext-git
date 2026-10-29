const mongoose = require("mongoose");

const connectDatabase = async () => {
    const mongoUri = process.env.MONGO_URI?.trim();
    if (!mongoUri) {
        const error = new Error("Missing required server environment variable: MONGO_URI");
        error.name = "MissingMongoUriError";
        throw error;
    }

    try {
        await mongoose.connect(mongoUri);
        console.log("MongoDB connected successfully");
    } catch (error) {
        if (error.name === "MongoParseError") {
            console.error(
                "MongoDB connection failed: MONGO_URI is not a valid MongoDB URI. Check its scheme and URL-encode special characters in credentials."
            );
        } else {
            console.error("MongoDB connection failed:", error.name, error.code || "");
        }
        throw error;
    }
};

mongoose.connection.on("error", (error) => {
    if (error.name === "MongoParseError") {
        console.error("MongoDB connection error: MONGO_URI is not a valid MongoDB URI");
    } else {
        console.error("MongoDB connection error:", error.name, error.code || "");
    }
});

module.exports = connectDatabase;