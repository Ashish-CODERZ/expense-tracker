const jwt = require("jsonwebtoken");

function getJwtConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN || "1h"
  };
}

function signAccessToken(user) {
  const config = getJwtConfig();
  return jwt.sign(
    {
      sub: user.id,
      email: user.email
    },
    config.secret,
    {
      expiresIn: config.expiresIn
    }
  );
}

function verifyAccessToken(token) {
  const config = getJwtConfig();
  return jwt.verify(token, config.secret);
}

module.exports = {
  signAccessToken,
  verifyAccessToken
};
