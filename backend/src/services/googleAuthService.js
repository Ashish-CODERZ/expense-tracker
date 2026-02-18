const { OAuth2Client } = require("google-auth-library");
const { AppError } = require("../errors/appError");

function createGoogleIdTokenVerifier() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    return async function missingGoogleClientId() {
      throw new AppError(500, "GOOGLE_CLIENT_ID is not configured");
    };
  }

  const client = new OAuth2Client(clientId);

  return async function verifyGoogleIdToken(idToken) {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new AppError(401, "Google token payload is invalid");
    }

    return {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified === true
    };
  };
}

module.exports = {
  createGoogleIdTokenVerifier
};
