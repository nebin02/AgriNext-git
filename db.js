const mongoose = require("mongoose");

const getConnectionDiagnostic = (error) => {
    if (error.name === "MongoParseError") {
        return "MONGO_URI is invalid. Check its MongoDB scheme and URL-encode special characters in credentials.";
    }

    if (error.code === 8000 || error.codeName === "AtlasError") {
        return "MongoDB Atlas rejected authentication (error 8000). Verify the Atlas database username and password, and URL-encode special characters in the password.";
    }

    if (error.code === 13 || error.codeName === "Unauthorized") {
        return "MongoDB authenticated the connection but denied the requested operation. Verify the database user's roles.";
    }

    if (["ENOTFOUND", "EAI_AGAIN"].includes(error.code)) {
        return "MongoDB hostname could not be resolved. Verify the Atlas hostname and DNS/network configuration.";
    }

    if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH"].includes(error.code)) {
        return "MongoDB could not be reached. Verify Atlas Network Access, cluster availability, and outbound network connectivity.";
    }

    if (error.name === "MongooseServerSelectionError") {
        return "No MongoDB server could be selected. Verify Atlas Network Access, cluster availability, DNS, and network connectivity.";
    }

    return `MongoDB connection failed (${error.name || "Error"}${error.code ? ` ${error.code}` : ""}). Check Atlas configuration and server logs.`;
};

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
        console.error("MongoDB connection failed:", getConnectionDiagnostic(error));
        throw error;
    }
};

mongoose.connection.on("error", (error) => {
    console.error("MongoDB connection error:", getConnectionDiagnostic(error));
});

module.exports = connectDatabase;