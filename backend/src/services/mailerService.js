const nodemailer = require("nodemailer");

function createMailerService() {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || process.env.SECURE || "false").toLowerCase() === "true";
  const user = (process.env.SMTP_USER || process.env.SMTP_MAIL || "").trim();
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
  const service = (process.env.SMTP_SERVICE || "").trim();
  const from = process.env.SMTP_FROM || (user ? `Expense Tracker <${user}>` : "Expense Tracker <no-reply@example.com>");

  if (!host) {
    return {
      async sendOtpEmail({ email, otpCode, expiresInMinutes, intent }) {
        // eslint-disable-next-line no-console
        console.log(
          `SMTP is not configured. OTP for ${email}: ${otpCode} (intent=${intent}, expires in ${expiresInMinutes} minutes)`
        );
      }
    };
  }

  if (user && !pass) {
    return {
      async sendOtpEmail({ email, otpCode, expiresInMinutes, intent }) {
        // eslint-disable-next-line no-console
        console.log(
          `SMTP credentials are incomplete. OTP for ${email}: ${otpCode} (intent=${intent}, expires in ${expiresInMinutes} minutes)`
        );
      }
    };
  }

  const transporter = nodemailer.createTransport({
    service: service || undefined,
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined
  });

  return {
    async sendOtpEmail({ email, otpCode, expiresInMinutes, intent }) {
      const intentLabel =
        intent === "forgot_password"
          ? "password reset"
          : intent === "signup"
          ? "signup verification"
          : "login verification";
      await transporter.sendMail({
        from,
        to: email,
        subject: `Your Expense Tracker OTP for ${intentLabel}`,
        text: `Your one-time password is ${otpCode}. It expires in ${expiresInMinutes} minutes.`,
        html: `<p>Your one-time password is <strong>${otpCode}</strong>.</p><p>It expires in ${expiresInMinutes} minutes.</p>`
      });
    }
  };
}

module.exports = {
  createMailerService
};
