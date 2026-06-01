const logger = require("../utils/logger");
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpEmail = async (email, otp) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "Acme <onboarding@resend.dev>",
      to: [email],
      subject: "Your OTP Code",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px;">
          <h2>Your OTP Code</h2>
          <p>Your one-time password is:</p>
          <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 4px;">${otp}</h1>
          <p>This code will expire in <strong>5 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
      text: `Your OTP is ${otp}. It expires in 5 minutes.`, // Fallback plain text
    });

    if (error) {
      logger.error("Resend Error:", error);
      throw new Error(error.message || "Failed to send email");
    }

    logger.info(`TP email sent successfully to ${email}. ID: ${data.id}`);
    return data;
  } catch (err) {
    logger.error("Email sending failed:", err.message);
    throw err;
  }
};

module.exports = {
  sendOtpEmail,
};