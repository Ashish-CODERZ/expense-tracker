const { AppError } = require("../errors/appError");
const { DuplicateIdempotencyKeyError } = require("../errors/duplicateIdempotencyKeyError");
const { normalizeMoney } = require("../utils/money");

function serializeExpense(expense) {
  return {
    id: expense.id,
    amount: normalizeMoney(expense.amount),
    category: expense.category,
    description: expense.description,
    date: expense.date.toISOString().slice(0, 10),
    created_at: expense.createdAt.toISOString()
  };
}

class ExpenseService {
  constructor(expenseRepository) {
    this.expenseRepository = expenseRepository;
  }

  async createExpense(userId, expenseInput, idempotencyKey) {
    try {
      const createdExpense = await this.expenseRepository.create({
        userId,
        ...expenseInput,
        idempotencyKey
      });

      return {
        replayed: false,
        expense: serializeExpense(createdExpense)
      };
    } catch (error) {
      if (error instanceof DuplicateIdempotencyKeyError) {
        const existingExpense = await this.expenseRepository.findByIdempotencyKey(userId, idempotencyKey);

        if (!existingExpense) {
          throw new AppError(409, "Idempotent request conflict");
        }

        return {
          replayed: true,
          expense: serializeExpense(existingExpense)
        };
      }

      throw error;
    }
  }

  async getExpenses(userId, expenseQuery) {
    const result = await this.expenseRepository.list({
      userId,
      ...expenseQuery
    });

    const totalItems = result.totalItems;
    const pageSize = expenseQuery.pageSize;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    return {
      data: result.data.map(serializeExpense),
      total: normalizeMoney(result.total),
      pagination: {
        page: expenseQuery.page,
        page_size: pageSize,
        total_items: totalItems,
        total_pages: totalPages
      }
    };
  }

  async deleteExpense(userId, expenseId) {
    const deleted = await this.expenseRepository.deleteById(userId, expenseId);

    if (!deleted) {
      throw new AppError(404, "Expense not found");
    }
  }
}

module.exports = {
  ExpenseService
};
