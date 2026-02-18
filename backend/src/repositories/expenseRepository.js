const { DuplicateIdempotencyKeyError } = require("../errors/duplicateIdempotencyKeyError");
const { buildDateFilter } = require("../utils/dateFilters");

class PrismaExpenseRepository {
  constructor(prismaClient) {
    this.prisma = prismaClient;
  }

  async create({ userId, amount, category, description, date, idempotencyKey }) {
    try {
      return await this.prisma.expense.create({
        data: {
          userId,
          amount,
          category,
          description,
          date,
          idempotencyKey
        }
      });
    } catch (error) {
      const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");

      if (error?.code === "P2002" && target.includes("idempotency")) {
        throw new DuplicateIdempotencyKeyError(userId, idempotencyKey);
      }

      throw error;
    }
  }

  async findByIdempotencyKey(userId, idempotencyKey) {
    return this.prisma.expense.findFirst({
      where: {
        userId,
        idempotencyKey
      }
    });
  }

  async list({ userId, category, sort, date, month, year, page, pageSize }) {
    const dateFilter = buildDateFilter({ date, month, year });
    const categoryFilter = category
      ? {
          contains: category,
          mode: "insensitive"
        }
      : undefined;
    const where = {
      userId,
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(dateFilter ? { date: dateFilter } : {})
    };

    const orderBy = sort === "oldest" ? { date: "asc" } : { date: "desc" };
    const skip = (page - 1) * pageSize;

    const [data, totalResult, countResult] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        orderBy,
        skip,
        take: pageSize
      }),
      this.prisma.expense.aggregate({
        where,
        _sum: {
          amount: true
        }
      }),
      this.prisma.expense.count({
        where
      })
    ]);

    return {
      data,
      total: totalResult._sum.amount,
      totalItems: countResult
    };
  }

  async deleteById(userId, expenseId) {
    const result = await this.prisma.expense.deleteMany({
      where: {
        id: expenseId,
        userId
      }
    });

    return result.count > 0;
  }
}

module.exports = {
  PrismaExpenseRepository
};
