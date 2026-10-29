const crypto = require("node:crypto");

const createOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

const verifyOtp = (otp, storedHash) => {
    if (!/^\d{6}$/.test(String(otp)) || !/^[a-f0-9]{64}$/i.test(String(storedHash))) {
        return false;
    }

    const candidateHash = Buffer.from(hashOtp(String(otp)), "hex");
    const expectedHash = Buffer.from(String(storedHash), "hex");
    return crypto.timingSafeEqual(candidateHash, expectedHash);
};

module.exports = { createOtp, hashOtp, verifyOtp };
