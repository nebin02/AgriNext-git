const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        const allowedTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(
                new Error("Only JPG, PNG and WEBP images are allowed")
            );
        }

        cb(null, true);
    }
});

const hasValidImageSignature = (file) => {
    if (!Buffer.isBuffer(file.buffer)) {
        return false;
    }

    const { buffer, mimetype } = file;
    if (mimetype === "image/jpeg" || mimetype === "image/jpg") {
        return buffer.length >= 3 &&
            buffer[0] === 0xff &&
            buffer[1] === 0xd8 &&
            buffer[2] === 0xff;
    }

    if (mimetype === "image/png") {
        return buffer.length >= 8 &&
            buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }

    if (mimetype === "image/webp") {
        return buffer.length >= 12 &&
            buffer.toString("ascii", 0, 4) === "RIFF" &&
            buffer.toString("ascii", 8, 12) === "WEBP";
    }

    return false;
};

const validateImageContent = (req, res, next) => {
    if (!req.file || hasValidImageSignature(req.file)) {
        return next();
    }

    return res.status(400).json({
        message: "Only JPG, PNG and WEBP images are allowed"
    });
};

module.exports = { upload, validateImageContent };