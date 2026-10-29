const test = require("node:test");
const assert = require("node:assert/strict");
const { createOtp, hashOtp, verifyOtp } = require("../otpUtils");

test("generates six-digit OTPs and stores a one-way digest", () => {
    const otp = createOtp();
    const digest = hashOtp(otp);

    assert.match(otp, /^\d{6}$/);
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.notEqual(digest, otp);
    assert.equal(verifyOtp(otp, digest), true);
});

test("rejects incorrect or malformed OTPs safely", () => {
    assert.equal(verifyOtp("000000", hashOtp("123456")), false);
    assert.equal(verifyOtp("12345", hashOtp("123456")), false);
    assert.equal(verifyOtp("123456", "plaintext"), false);
});
