const bcrypt = require("bcryptjs");
const { AppError } = require("../errors/appError");
const { DuplicateEmailError } = require("../errors/duplicateEmailError");
const { DuplicateGoogleIdError } = require("../errors/duplicateGoogleIdError");
const { generateOtpCode, hashOtp } = require("../utils/otp");
const { signAccessToken } = require("../utils/jwt");
const { createGoogleIdTokenVerifier } = require("./googleAuthService");

class AuthService {
  constructor({ userRepository, otpRepository, mailerService, googleVerifier }) {
    this.userRepository = userRepository;
    this.otpRepository = otpRepository;
    this.mailerService = mailerService;
    this.googleVerifier = googleVerifier || createGoogleIdTokenVerifier();
  }

  getOtpTtlMinutes() {
    return Number(process.env.OTP_TTL_MINUTES || 10);
  }

  getOtpMaxAttempts() {
    return Number(process.env.OTP_MAX_ATTEMPTS || 5);
  }

  getPasswordHashRounds() {
    return Number(process.env.PASSWORD_HASH_ROUNDS || 12);
  }

  async hashPassword(password) {
    return bcrypt.hash(password, this.getPasswordHashRounds());
  }

  serializeAuthResponse(user) {
    const accessToken = signAccessToken(user);
    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email
      }
    };
  }

  async requestOtp({ email, intent }) {
    let user = await this.userRepository.findByEmail(email);

    if (intent === "signup") {
      if (user) {
        throw new AppError(409, "User already exists. Use login or forgot password.");
      }
      try {
        user = await this.userRepository.create({
          email
        });
      } catch (error) {
        if (error instanceof DuplicateEmailError) {
          throw new AppError(409, "User already exists. Use login or forgot password.");
        }
        throw error;
      }
    }

    if (intent === "forgot_password" && !user) {
      throw new AppError(404, "User not found.");
    }

    const otpCode = generateOtpCode();
    const codeHash = hashOtp(email, otpCode);
    const ttlMinutes = this.getOtpTtlMinutes();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.otpRepository.invalidateActiveCodes(user.id, intent);
    await this.otpRepository.createCode({
      userId: user.id,
      intent,
      codeHash,
      expiresAt
    });

    await this.mailerService.sendOtpEmail({
      email,
      otpCode,
      expiresInMinutes: ttlMinutes,
      intent
    });

    return {
      message: "OTP sent",
      expires_in_minutes: ttlMinutes
    };
  }

  async verifyOtp({ email, intent, otp, password }) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const code = await this.otpRepository.getLatestActiveCode(user.id, intent);
    if (!code) {
      throw new AppError(400, "OTP is missing or expired");
    }

    const expectedHash = hashOtp(email, otp);
    if (expectedHash !== code.codeHash) {
      const updated = await this.otpRepository.incrementAttempts(code.id);
      if (updated.attempts >= this.getOtpMaxAttempts()) {
        await this.otpRepository.consume(code.id);
      }

      throw new AppError(401, "OTP is invalid");
    }

    await this.otpRepository.consume(code.id);

    let updatedUser = user;
    if (intent === "signup" || intent === "forgot_password") {
      const passwordHash = await this.hashPassword(password);
      updatedUser = await this.userRepository.updatePassword(user.id, passwordHash);
    }

    return this.serializeAuthResponse(updatedUser);
  }

  async loginWithPassword({ email, password }) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AppError(401, "Invalid email or password");
    }

    if (!user.passwordHash) {
      throw new AppError(400, "Password login is not configured for this account");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AppError(401, "Invalid email or password");
    }

    return this.serializeAuthResponse(user);
  }

  async loginWithGoogleIdToken({ idToken }) {
    let payload;
    try {
      payload = await this.googleVerifier(idToken);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(401, "Google token is invalid");
    }

    if (!payload?.email || !payload?.sub) {
      throw new AppError(401, "Google token payload is invalid");
    }

    if (payload.email_verified !== true) {
      throw new AppError(401, "Google email must be verified");
    }

    const email = payload.email.trim().toLowerCase();
    const googleId = payload.sub;

    let user = await this.userRepository.findByGoogleId(googleId);
    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(email);

      if (existingByEmail) {
        if (existingByEmail.googleId && existingByEmail.googleId !== googleId) {
          throw new AppError(409, "Account conflict for this email");
        }
        user = await this.userRepository.updateGoogleId(existingByEmail.id, googleId);
      } else {
        try {
          user = await this.userRepository.create({
            email,
            googleId
          });
        } catch (error) {
          if (error instanceof DuplicateEmailError || error instanceof DuplicateGoogleIdError) {
            throw new AppError(409, "Account already exists. Please retry sign in.");
          }
          throw error;
        }
      }
    }

    return this.serializeAuthResponse(user);
  }
}

module.exports = {
  AuthService
};
