const test = require("node:test");
const assert = require("node:assert/strict");
const {
    EmailDeliveryError,
    getSmtpConfiguration,
    getSmtpDiagnostic
} = require("../emailService");

const brevoEnvironment = {
    SMTP_HOST: "smtp-relay.brevo.com",
    SMTP_PORT: "587",
    SMTP_USER: "smtp-login",
    SMTP_PASS: "smtp-key",
    EMAIL_FROM: "verified@example.com"
};

test("builds Brevo STARTTLS configuration for port 587", () => {
    const config = getSmtpConfiguration(brevoEnvironment);

    assert.equal(config.host, "smtp-relay.brevo.com");
    assert.equal(config.port, 587);
    assert.equal(config.secure, false);
    assert.equal(config.auth.user, "smtp-login");
    assert.equal(config.auth.pass, "smtp-key");
});

test("uses implicit TLS for SMTP port 465", () => {
    const config = getSmtpConfiguration({
        ...brevoEnvironment,
        SMTP_PORT: "465"
    });

    assert.equal(config.secure, true);
});

test("rejects incomplete or invalid SMTP configuration without logging its values", () => {
    assert.throws(
        () => getSmtpConfiguration({ ...brevoEnvironment, SMTP_PASS: "" }),
        (error) => error instanceof EmailDeliveryError &&
            error.code === "SMTP_CONFIGURATION" &&
            error.message.includes("SMTP_PASS")
    );
    assert.throws(
        () => getSmtpConfiguration({ ...brevoEnvironment, SMTP_PORT: "2525" }),
        (error) => error.code === "SMTP_CONFIGURATION"
    );
});

test("identifies Brevo unauthorized-IP rejections without exposing provider response text", () => {
    const diagnostic = getSmtpDiagnostic({
        code: "EAUTH",
        command: "AUTH PLAIN",
        responseCode: 525,
        response: "525 5.7.1 Unauthorized IP address"
    });

    assert.equal(diagnostic.code, "SMTP_IP_NOT_AUTHORIZED");
    assert.match(diagnostic.message, /outbound IP/);
    assert.doesNotMatch(diagnostic.message, /password|secret|SMTP key/i);
});

test("distinguishes SMTP authentication, connection, and sender failures", () => {
    assert.equal(getSmtpDiagnostic({ code: "EAUTH" }).code, "SMTP_AUTHENTICATION_FAILED");
    assert.equal(getSmtpDiagnostic({ code: "ETIMEDOUT" }).code, "SMTP_CONNECTION_FAILED");
    assert.equal(getSmtpDiagnostic({ responseCode: 550 }).code, "SMTP_SENDER_REJECTED");
});
