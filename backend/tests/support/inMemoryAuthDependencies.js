const { randomUUID } = require("crypto");
const { DuplicateEmailError } = require("../../src/errors/duplicateEmailError");
const { DuplicateGoogleIdError } = require("../../src/errors/duplicateGoogleIdError");

class InMemoryUserRepository {
  constructor() {
    this.usersByEmail = new Map();
    this.usersById = new Map();
    this.usersByGoogleId = new Map();
  }

  async create({ email, passwordHash = null, googleId = null }) {
    if (this.usersByEmail.has(email)) {
      throw new DuplicateEmailError(email);
    }
    if (googleId && this.usersByGoogleId.has(googleId)) {
      throw new DuplicateGoogleIdError(googleId);
    }

    const user = {
      id: randomUUID(),
      email,
      passwordHash,
      googleId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.usersByEmail.set(email, user);
    this.usersById.set(user.id, user);
    if (googleId) {
      this.usersByGoogleId.set(googleId, user);
    }
    return user;
  }

  async findByEmail(email) {
    return this.usersByEmail.get(email) || null;
  }

  async findById(id) {
    return this.usersById.get(id) || null;
  }

  async findByGoogleId(googleId) {
    return this.usersByGoogleId.get(googleId) || null;
  }

  async updatePassword(userId, passwordHash) {
    const user = this.usersById.get(userId);
    const updated = {
      ...user,
      passwordHash,
      updatedAt: new Date()
    };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(updated.email, updated);
    if (updated.googleId) {
      this.usersByGoogleId.set(updated.googleId, updated);
    }
    return updated;
  }

  async updateGoogleId(userId, googleId) {
    if (googleId && this.usersByGoogleId.has(googleId)) {
      throw new DuplicateGoogleIdError(googleId);
    }

    const user = this.usersById.get(userId);
    const updated = {
      ...user,
      googleId,
      updatedAt: new Date()
    };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(updated.email, updated);
    if (googleId) {
      this.usersByGoogleId.set(googleId, updated);
    }
    return updated;
  }
}

class InMemoryOtpRepository {
  constructor() {
    this.codes = [];
  }

  async invalidateActiveCodes(userId, intent) {
    const now = new Date();
    this.codes = this.codes.map((code) => {
      if (code.userId === userId && code.intent === intent && !code.consumedAt) {
        return { ...code, consumedAt: now };
      }
      return code;
    });
  }

  async createCode({ userId, intent, codeHash, expiresAt }) {
    const code = {
      id: randomUUID(),
      userId,
      intent,
      codeHash,
      attempts: 0,
      expiresAt,
      consumedAt: null,
      createdAt: new Date()
    };
    this.codes.push(code);
    return code;
  }

  async getLatestActiveCode(userId, intent) {
    const now = Date.now();
    const activeCodes = this.codes
      .filter((code) => {
        return (
          code.userId === userId &&
          code.intent === intent &&
          !code.consumedAt &&
          code.expiresAt.getTime() > now
        );
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return activeCodes[0] || null;
  }

  async incrementAttempts(codeId) {
    const index = this.codes.findIndex((code) => code.id === codeId);
    this.codes[index] = {
      ...this.codes[index],
      attempts: this.codes[index].attempts + 1
    };
    return this.codes[index];
  }

  async consume(codeId) {
    const index = this.codes.findIndex((code) => code.id === codeId);
    this.codes[index] = {
      ...this.codes[index],
      consumedAt: new Date()
    };
    return this.codes[index];
  }
}

function createInMemoryMailerService() {
  const sent = [];

  return {
    async sendOtpEmail({ email, otpCode, intent }) {
      sent.push({
        email,
        otpCode,
        intent
      });
    },
    getLatestOtp(email, intent) {
      for (let index = sent.length - 1; index >= 0; index -= 1) {
        const item = sent[index];
        if (item.email === email && item.intent === intent) {
          return item.otpCode;
        }
      }
      return null;
    }
  };
}

function createInMemoryGoogleVerifier() {
  return async (idToken) => {
    if (idToken === "google-token-valid") {
      return {
        sub: "google-user-1",
        email: "google.user@example.com",
        email_verified: true
      };
    }

    if (idToken === "google-token-existing-email") {
      return {
        sub: "google-user-2",
        email: "alice@example.com",
        email_verified: true
      };
    }

    throw new Error("Invalid token");
  };
}

module.exports = {
  InMemoryUserRepository,
  InMemoryOtpRepository,
  createInMemoryMailerService,
  createInMemoryGoogleVerifier
};
