const { randomUUID } = require("crypto");
const { DuplicateIdempotencyKeyError } = require("../../src/errors/duplicateIdempotencyKeyError");
const { buildDateFilter } = require("../../src/utils/dateFilters");

function amountToCents(amount) {
  const [whole, fraction = ""] = amount.split(".");
  const normalizedFraction = fraction.padEnd(2, "0").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(normalizedFraction);
}

function centsToAmount(cents) {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole.toString()}.${fraction}`;
}

function matchesDateFilter(expenseDate, dateFilter) {
  if (!dateFilter) {
    return true;
  }
  if (dateFilter.equals) {
    return expenseDate.getTime() === dateFilter.equals.getTime();
  }
  if (dateFilter.gte && expenseDate < dateFilter.gte) {
    return false;
  }
  if (dateFilter.lt && expenseDate >= dateFilter.lt) {
    return false;
  }
  return true;
}

class InMemoryExpenseRepository {
  constructor() {
    this.expensesByIdempotencyKey = new Map();
    this.expenses = [];
  }

  buildIdempotencyLookupKey(userId, idempotencyKey) {
    return `${userId}:${idempotencyKey}`;
  }

  async create({ userId, amount, category, description, date, idempotencyKey }) {
    const lookupKey = this.buildIdempotencyLookupKey(userId, idempotencyKey);
    if (this.expensesByIdempotencyKey.has(lookupKey)) {
      throw new DuplicateIdempotencyKeyError(userId, idempotencyKey);
    }

    const expense = {
      id: randomUUID(),
      userId,
      amount,
      category,
      description,
      date,
      idempotencyKey,
      createdAt: new Date()
    };

    this.expenses.push(expense);
    this.expensesByIdempotencyKey.set(lookupKey, expense);
    return expense;
  }

  async findByIdempotencyKey(userId, idempotencyKey) {
    const lookupKey = this.buildIdempotencyLookupKey(userId, idempotencyKey);
    return this.expensesByIdempotencyKey.get(lookupKey) || null;
  }

  async list({ userId, category, sort, date, month, year, page, pageSize }) {
    const dateFilter = buildDateFilter({ date, month, year });
    const normalizedCategory = category ? category.toLowerCase() : null;
    const filtered = this.expenses.filter((expense) => {
      if (expense.userId !== userId) {
        return false;
      }
      if (normalizedCategory && !expense.category.toLowerCase().includes(normalizedCategory)) {
        return false;
      }
      return matchesDateFilter(expense.date, dateFilter);
    });

    const sorted = [...filtered].sort((left, right) => {
      if (sort === "oldest") {
        return left.date.getTime() - right.date.getTime();
      }
      return right.date.getTime() - left.date.getTime();
    });

    let totalCents = 0n;
    for (const expense of sorted) {
      totalCents += amountToCents(expense.amount);
    }

    const start = (page - 1) * pageSize;
    const data = sorted.slice(start, start + pageSize);

    return {
      data,
      total: centsToAmount(totalCents),
      totalItems: sorted.length
    };
  }

  async deleteById(userId, expenseId) {
    const beforeLength = this.expenses.length;
    this.expenses = this.expenses.filter((expense) => {
      return !(expense.userId === userId && expense.id === expenseId);
    });

    this.expensesByIdempotencyKey = new Map(
      [...this.expensesByIdempotencyKey.entries()].filter(([, expense]) => {
        return !(expense.userId === userId && expense.id === expenseId);
      })
    );

    return this.expenses.length < beforeLength;
  }
}

module.exports = {
  InMemoryExpenseRepository
};
