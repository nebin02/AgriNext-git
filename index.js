require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const routes = require("./routes");
const connectDatabase = require("./db");
const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .map((origin) => origin.replace(/\/+$/, ""))
    .filter(Boolean);

const corsOptions = {
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.includes(origin));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    optionsSuccessStatus: 204
};

app.options(/.*/, cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

app.get("/health", (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
        status: databaseReady ? "ok" : "unavailable",
        database: databaseReady ? "connected" : "disconnected"
    });
});

app.use("/", routes);

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    console.error("Request failed:", error.name, error.code || "");

    if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "Image must be 5 MB or smaller" });
    }

    if (error.message === "Only JPG, PNG and WEBP images are allowed") {
        return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: "Request could not be completed" });
});

const listen = (port) => new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
        server.removeListener("error", handleError);
        resolve(server);
    });
    const handleError = (error) => reject(error);
    server.once("error", handleError);
});

const startServer = async () => {
    let server;

    try {
        await connectDatabase();

        const port = Number(process.env.PORT || 3000);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
            const error = new Error("PORT must be an integer between 0 and 65535");
            error.name = "InvalidPortError";
            throw error;
        }

        server = await listen(port);
        console.log(`AgriNext API listening on port ${port}`);

        let shuttingDown = false;
        const shutdown = (signal) => {
            if (shuttingDown) {
                return;
            }
            shuttingDown = true;
            console.log(`${signal} received; shutting down`);

            server.close(async (error) => {
                if (error) {
                    console.error("HTTP server shutdown failed:", error.name, error.code || "");
                    process.exitCode = 1;
                }

                try {
                    await mongoose.disconnect();
                    console.log("MongoDB disconnected");
                } catch (disconnectError) {
                    console.error(
                        "MongoDB shutdown failed:",
                        disconnectError.name,
                        disconnectError.code || ""
                    );
                    process.exitCode = 1;
                }
            });
        };

        process.once("SIGTERM", () => shutdown("SIGTERM"));
        process.once("SIGINT", () => shutdown("SIGINT"));
    } catch (error) {
        if (error.name === "MissingMongoUriError" || error.name === "InvalidPortError") {
            console.error("Server startup failed:", error.message);
        } else {
            console.error("Server startup failed:", error.name || "Error", error.code || "");
        }

        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error(
                "MongoDB shutdown failed:",
                disconnectError.name,
                disconnectError.code || ""
            );
        }

        process.exitCode = 1;
    }
};

startServer();