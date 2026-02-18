class PrismaOtpRepository {
  constructor(prismaClient) {
    this.prisma = prismaClient;
  }

  async invalidateActiveCodes(userId, intent) {
    await this.prisma.otpCode.updateMany({
      where: {
        userId,
        intent,
        consumedAt: null
      },
      data: {
        consumedAt: new Date()
      }
    });
  }

  async createCode({ userId, intent, codeHash, expiresAt }) {
    return this.prisma.otpCode.create({
      data: {
        userId,
        intent,
        codeHash,
        expiresAt
      }
    });
  }

  async getLatestActiveCode(userId, intent) {
    return this.prisma.otpCode.findFirst({
      where: {
        userId,
        intent,
        consumedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async incrementAttempts(codeId) {
    return this.prisma.otpCode.update({
      where: {
        id: codeId
      },
      data: {
        attempts: {
          increment: 1
        }
      }
    });
  }

  async consume(codeId) {
    return this.prisma.otpCode.update({
      where: {
        id: codeId
      },
      data: {
        consumedAt: new Date()
      }
    });
  }
}

module.exports = {
  PrismaOtpRepository
};
