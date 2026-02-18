const crypto = require("crypto");

function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashOtp(email, otpCode) {
  const normalizedEmail = email.trim().toLowerCase();
  const payload = `${normalizedEmail}:${otpCode}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

module.exports = {
  generateOtpCode,
  hashOtp
};
