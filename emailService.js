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
    const requiredVariables = [
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASS",
        "EMAIL_FROM"
    ];

    const missingVariables = requiredVariables.filter(
        (name) => !env[name]?.trim()
    );

    if (missingVariables.length) {
        throw new EmailDeliveryError(
            "SMTP_CONFIGURATION",
            `Email configuration is missing: ${missingVariables.join(", ")}`
        );
    }

    // Read and convert SMTP_PORT from environment variables
    const port = Number(env.SMTP_PORT.trim());

    if (!Number.isInteger(port) || ![465, 587, 2525].includes(port)) {
        throw new EmailDeliveryError(
            "SMTP_CONFIGURATION",
            "SMTP_PORT must be 465, 587, or 2525"
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
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.EMAIL_FROM;

    if (!apiKey || !senderEmail) {
        console.error("Brevo configuration is missing.");

        throw new EmailDeliveryError(
            "BREVO_CONFIGURATION",
            "BREVO_API_KEY or EMAIL_FROM is missing."
        );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail.trim())) {
        throw new EmailDeliveryError(
            "BREVO_CONFIGURATION",
            "EMAIL_FROM must be a valid verified sender address."
        );
    }

    const escapedOtp = String(otp).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    })[character]);

    const payload = {
        sender: {
            name: "AgriNext",
            email: senderEmail.trim()
        },
        to: [
            {
                email: email
            }
        ],
        subject: "AgriNext Email Verification OTP",
        textContent: `Your AgriNext verification code is ${otp}. It expires in 5 minutes.`,
        htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 30px; border: 1px solid #ddd; border-radius: 12px;">
                <h2 style="color: #2e7d32;">AgriNext</h2>
                <h3>Email Verification</h3>
                <p>Your AgriNext verification OTP is:</p>
                <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2e7d32; padding: 15px; text-align: center; background-color: #f1f8e9; border-radius: 8px;">
                    ${escapedOtp}
                </div>
                <p>This OTP is valid for <strong>5 minutes</strong>.</p>
                <p>If you did not request this OTP, you can safely ignore this email.</p>
            </div>
        `
    };

    try {
        const response = await fetch(
            "https://api.brevo.com/v3/smtp/email",
            {
                method: "POST",
                headers: {
                    "accept": "application/json",
                    "api-key": apiKey,
                    "content-type": "application/json"
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(15000)
            }
        );

        if (!response.ok) {
            const errorBody = await response.text();

            console.error("Brevo API error:", {
                status: response.status,
                response: errorBody.slice(0, 500)
            });

            throw new EmailDeliveryError(
                "BREVO_API_FAILED",
                `Brevo API returned HTTP ${response.status}`
            );
        }

        const result = await response.json();

        console.log("AgriNext OTP email accepted by Brevo.", {
            messageId: result.messageId
        });

        return result;

    } catch (error) {
        if (error instanceof EmailDeliveryError) {
            throw error;
        }

        console.error("Brevo email request failed:", error.message);

        throw new EmailDeliveryError(
            "BREVO_CONNECTION_FAILED",
            "Could not connect to Brevo email API."
        );
    }
};

module.exports = sendOTPEmail;
module.exports.EmailDeliveryError = EmailDeliveryError;
module.exports.getSmtpConfiguration = getSmtpConfiguration;
module.exports.getSmtpDiagnostic = getSmtpDiagnostic;
