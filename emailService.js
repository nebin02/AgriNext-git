const nodemailer = require("nodemailer");

class EmailDeliveryError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "EmailDeliveryError";
        this.code = code;
        this.statusCode = 503;
        this.publicMessage = "Email delivery is temporarily unavailable. Please try again later.";
    }
}

const getSmtpConfiguration = (env = process.env) => {
    const requiredVariables = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
    const missingVariables = requiredVariables.filter((name) => !env[name]?.trim());
    if (missingVariables.length) {
        throw new EmailDeliveryError(
            "SMTP_CONFIGURATION",
            `Email configuration is missing: ${missingVariables.join(", ")}`
        );
    }

    const port = Number(env.SMTP_PORT);
    if (!Number.isInteger(port) || ![465, 587].includes(port)) {
        throw new EmailDeliveryError(
            "SMTP_CONFIGURATION",
            "SMTP_PORT must be 465 or 587"
        );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EMAIL_FROM.trim())) {
        throw new EmailDeliveryError(
            "SMTP_CONFIGURATION",
            "EMAIL_FROM must be a valid verified sender address"
        );
    }

    return {
        host: env.SMTP_HOST.trim(),
        port,
        secure: port === 465,
        from: env.EMAIL_FROM.trim(),
        auth: {
            user: env.SMTP_USER.trim(),
            pass: env.SMTP_PASS
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000
    };
};

const getSmtpDiagnostic = (error) => {
    const response = typeof error.response === "string" ? error.response : "";
    const responseCode = Number(error.responseCode);

    if (responseCode === 525 || /unauthorized ip address/i.test(response)) {
        return {
            code: "SMTP_IP_NOT_AUTHORIZED",
            message: "Brevo rejected the backend server IP (SMTP 525). Allow the server's outbound IP in Brevo SMTP security settings."
        };
    }

    if (error.code === "EAUTH" || [535, 534].includes(responseCode)) {
        return {
            code: "SMTP_AUTHENTICATION_FAILED",
            message: "SMTP authentication failed. Verify the Brevo SMTP login and SMTP key."
        };
    }

    if (["ETIMEDOUT", "ECONNECTION", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(error.code)) {
        return {
            code: "SMTP_CONNECTION_FAILED",
            message: "Could not connect to the SMTP server. Check host, port, TLS settings, and outbound network access."
        };
    }

    if ([550, 553].includes(responseCode)) {
        return {
            code: "SMTP_SENDER_REJECTED",
            message: "The SMTP provider rejected the sender. Verify EMAIL_FROM in Brevo and use a sender address that is authorized for the account."
        };
    }

    return {
        code: "SMTP_DELIVERY_FAILED",
        message: "The SMTP provider could not deliver the message. Check the provider's SMTP logs and account status."
    };
};

let transporter;

const sendOTPEmail = async (email, otp) => {
    let configuration;
    try {
        configuration = getSmtpConfiguration();
    } catch (error) {
        console.error("Email configuration error:", error.code, error.message);
        throw error;
    }

    if (!transporter) {
        transporter = nodemailer.createTransport(configuration);
    }

    const escapedOtp = String(otp).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    })[character]);

    try {
        await transporter.sendMail({
            from: `"AgriNext" <${configuration.from}>`,
            to: email,
            subject: "AgriNext Email Verification OTP",
            text: `Your AgriNext verification code is ${otp}. It expires in 5 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 30px; border: 1px solid #ddd; border-radius: 12px; background-color: #ffffff;">
                    <h2 style="color: #2e7d32;">AgriNext</h2>
                    <h3>Email Verification</h3>
                    <p>Your AgriNext verification OTP is:</p>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2e7d32; padding: 15px; text-align: center; background-color: #f1f8e9; border-radius: 8px;">${escapedOtp}</div>
                    <p>This OTP is valid for <strong>5 minutes</strong>.</p>
                    <p>If you did not request this OTP, you can safely ignore this email.</p>
                </div>
            `
        });
    } catch (error) {
        const diagnostic = getSmtpDiagnostic(error);
        console.error("Email delivery failed:", diagnostic.code, {
            smtpCode: error.code,
            responseCode: error.responseCode,
            command: error.command
        });
        throw new EmailDeliveryError(diagnostic.code, diagnostic.message);
    }
};

module.exports = sendOTPEmail;
module.exports.EmailDeliveryError = EmailDeliveryError;
module.exports.getSmtpConfiguration = getSmtpConfiguration;
module.exports.getSmtpDiagnostic = getSmtpDiagnostic;
