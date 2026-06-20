// services/email-service.js
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     type: "OAuth2",
//     user: process.env.EMAIL_USER,
//     clientId: process.env.CLIENT_ID,
//     clientSecret: process.env.CLIENT_SECRET,
//     refreshToken: process.env.REFRESH_TOKEN,
//   },
// });

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

transporter.verify((error, success) => {
  if (error) {
    logger.error(`Nodemailer setup error: ${error.message}`);
  } else {
    logger.info("Nodemailer connected successfully.");
  }
});

const sendOtpEmail = async (email, otp, metadata = {}) => {
  logger.info(`Attempting to send OTP email to: ${email}`);

  const { isNewDevice, deviceName, locationStr, userId, challengeToken } =
    metadata;

  const resetLink = `${process.env.FRONTEND_URL}/reset-password?userId=${userId}&otp=${otp}${challengeToken ? `&challengeToken=${challengeToken}` : ""}`;

  let securityNoticeHtml = "";
  if (isNewDevice) {
    securityNoticeHtml = `
      <div style="background-color: #fef2f2; border: 1px solid #fca5a5; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="color: #991b1b; margin: 0 0 8px 0; font-size: 14px;">🚨 New Device Login Detected</h4>
        <p style="color: #7f1d1d; margin: 0; font-size: 13px; line-height: 1.4;">
          A login attempt is being made from an unrecognized device:<br>
          • <strong>Device:</strong> ${deviceName || "Unknown Device"}<br>
          • <strong>Location:</strong> ${locationStr || "Unknown Location"}<br>
        </p>
      </div>
    `;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Banking System Security" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: isNewDevice
        ? "Security Alert: New device login attempt"
        : "Your OTP Verification Code",
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eef2f6; border-radius: 12px;">
          
          ${securityNoticeHtml}

          <h2 style="color: #1e293b; margin-bottom: 8px;">Verify Your Identity</h2>
          <p style="color: #64748b; font-size: 15px; line-height: 1.5;">
            Use the one-time password (OTP) below to authorize this session. This code is valid for <strong>5 minutes</strong>.
          </p>
          
          <div style="margin: 24px 0; text-align: center;">
            <span style="display: inline-block; background: #f1f5f9; color: #4f46e5; font-family: monospace; font-size: 36px; font-weight: bold; letter-spacing: 6px; padding: 12px 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
              ${otp}
            </span>
          </div>

          <div style="background: #fafafa; border-radius: 8px; padding: 16px; margin-top: 24px; border: 1px solid #f1f5f9;">
            <p style="color: #dc2626; font-size: 13px; font-weight: bold; margin: 0 0 6px 0;">
              IMPORTANT SECURITY WARNING:
            </p>
            <p style="color: #475569; font-size: 13px; margin: 0; line-height: 1.4;">
              <strong>NEVER</strong> share this OTP with anyone, including banking staff. If this login wasn't requested by you, your credentials might be compromised. Please secure your account immediately:
            </p>
            <p style="margin: 12px 0 0 0; text-align: left;">
              <a href="${resetLink}" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; font-size: 13px; font-weight: bold; padding: 8px 16px; border-radius: 6px;">
                Reset My Password Instantly
              </a>
            </p>
          </div>

          <p style="color: #94a3b8; font-size: 13px; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center;">
            If you signed in just now, you can safely ignore this warning.
          </p>
        </div>
      `,
    });

    logger.info(`OTP email sent successfully. MessageID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error("Nodemailer transport failure:", error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

module.exports = {
  sendOtpEmail,
};
