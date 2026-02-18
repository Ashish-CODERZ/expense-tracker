const { DuplicateEmailError } = require("../errors/duplicateEmailError");
const { DuplicateGoogleIdError } = require("../errors/duplicateGoogleIdError");

class PrismaUserRepository {
  constructor(prismaClient) {
    this.prisma = prismaClient;
  }

  async create({ email, passwordHash = null, googleId = null }) {
    try {
      return await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          googleId
        }
      });
    } catch (error) {
      const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");

      if (error?.code === "P2002" && target.includes("email")) {
        throw new DuplicateEmailError(email);
      }
      if (error?.code === "P2002" && target.includes("google")) {
        throw new DuplicateGoogleIdError(googleId);
      }

      throw error;
    }
  }

  async findByEmail(email) {
    return this.prisma.user.findUnique({
      where: {
        email
      }
    });
  }

  async findById(id) {
    return this.prisma.user.findUnique({
      where: {
        id
      }
    });
  }

  async findByGoogleId(googleId) {
    return this.prisma.user.findUnique({
      where: {
        googleId
      }
    });
  }

  async updatePassword(userId, passwordHash) {
    return this.prisma.user.update({
      where: {
        id: userId
      },
      data: {
        passwordHash
      }
    });
  }

  async updateGoogleId(userId, googleId) {
    try {
      return await this.prisma.user.update({
        where: {
          id: userId
        },
        data: {
          googleId
        }
      });
    } catch (error) {
      const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");

      if (error?.code === "P2002" && target.includes("google")) {
        throw new DuplicateGoogleIdError(googleId);
      }

      throw error;
    }
  }
}

module.exports = {
  PrismaUserRepository
};
