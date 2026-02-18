const { AppError } = require("../errors/appError");

const ALLOWED_INTENTS = new Set(["signup", "forgot_password"]);

function normalizeEmail(value) {
  if (typeof value !== "string") {
    throw new AppError(400, "Email is required");
  }

  const email = value.trim().toLowerCase();
  if (!email) {
    throw new AppError(400, "Email is required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "Email format is invalid");
  }

  return email;
}

function normalizeIntent(value) {
  const intent = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!ALLOWED_INTENTS.has(intent)) {
    throw new AppError(400, "intent must be signup or forgot_password");
  }

  return intent;
}

function normalizePassword(value, fieldName = "password") {
  if (typeof value !== "string") {
    throw new AppError(400, `${fieldName} is required`);
  }

  const password = value.trim();
  if (password.length < 8) {
    throw new AppError(400, `${fieldName} must be at least 8 characters`);
  }
  if (password.length > 72) {
    throw new AppError(400, `${fieldName} must be at most 72 characters`);
  }

  return password;
}

function validateRequestOtp(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    const intent = normalizeIntent(req.body?.intent);

    req.authInput = {
      email,
      intent
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function validateVerifyOtp(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    const intent = normalizeIntent(req.body?.intent);
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";

    if (!/^\d{6}$/.test(otp)) {
      throw new AppError(400, "OTP must be a 6-digit code");
    }

    let password;
    if (intent === "signup" || intent === "forgot_password") {
      password = normalizePassword(req.body?.password, "password");
    }

    req.authInput = {
      email,
      intent,
      otp,
      password
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function validatePasswordLogin(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password, "password");

    req.authInput = {
      email,
      password
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function validateGoogleAuth(req, res, next) {
  try {
    const idTokenRaw = req.body?.id_token || req.body?.idToken || req.body?.credential;
    const idToken = typeof idTokenRaw === "string" ? idTokenRaw.trim() : "";
    if (!idToken) {
      throw new AppError(400, "id_token is required");
    }

    req.authInput = {
      idToken
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  validateRequestOtp,
  validateVerifyOtp,
  validatePasswordLogin,
  validateGoogleAuth
};
