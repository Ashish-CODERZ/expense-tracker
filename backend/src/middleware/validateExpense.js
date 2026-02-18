const { AppError } = require("../errors/appError");

const VALID_SORT_VALUES = new Set(["newest", "oldest", "date_desc", "date_asc"]);

function normalizeAmount(amount) {
  const raw = String(amount).trim();

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new AppError(400, "Amount must be a non-negative number with up to 2 decimal places");
  }

  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function parseDateOnly(value, fieldName = "Date") {
  const raw = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError(400, `${fieldName} must use YYYY-MM-DD format`);
  }

  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new AppError(400, `${fieldName} is invalid`);
  }

  return date;
}

function getTodayUtcStart() {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  return todayUtc;
}

function assertNotFutureDate(date, fieldName = "Date") {
  if (date.getTime() > getTodayUtcStart().getTime()) {
    throw new AppError(400, `${fieldName} cannot be in the future`);
  }
}

function parseIntegerQuery(value, fieldName, { min, max, defaultValue, required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required && defaultValue === undefined) {
      throw new AppError(400, `${fieldName} is required`);
    }
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new AppError(400, `${fieldName} must be an integer`);
  }
  if (min !== undefined && parsed < min) {
    throw new AppError(400, `${fieldName} must be at least ${min}`);
  }
  if (max !== undefined && parsed > max) {
    throw new AppError(400, `${fieldName} must be at most ${max}`);
  }

  return parsed;
}

function normalizeSort(rawSort) {
  if (!rawSort) {
    return "newest";
  }

  if (!VALID_SORT_VALUES.has(rawSort)) {
    throw new AppError(400, "Unsupported sort value. Use newest or oldest");
  }

  if (rawSort === "date_desc") {
    return "newest";
  }

  if (rawSort === "date_asc") {
    return "oldest";
  }

  return rawSort;
}

function validateCreateExpense(req, res, next) {
  try {
    const idempotencyKey = (req.header("Idempotency-Key") || "").trim();
    if (!idempotencyKey) {
      throw new AppError(400, "Idempotency-Key header is required");
    }

    const { amount, category, description, date } = req.body || {};

    if (amount === undefined || amount === null || amount === "") {
      throw new AppError(400, "Amount is required");
    }

    if (!category || typeof category !== "string" || !category.trim()) {
      throw new AppError(400, "Category is required");
    }

    if (!date) {
      throw new AppError(400, "Date is required");
    }

    const parsedDate = parseDateOnly(date);
    assertNotFutureDate(parsedDate);

    req.idempotencyKey = idempotencyKey;
    req.expenseInput = {
      amount: normalizeAmount(amount),
      category: category.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      date: parsedDate
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function validateGetExpenses(req, res, next) {
  try {
    const category = typeof req.query.category === "string" ? req.query.category.trim() : undefined;
    const sortRaw = typeof req.query.sort === "string" ? req.query.sort.trim() : undefined;
    const dateRaw = typeof req.query.date === "string" ? req.query.date.trim() : undefined;
    const monthRaw = req.query.month;
    const yearRaw = req.query.year;

    const sort = normalizeSort(sortRaw);
    const page = parseIntegerQuery(req.query.page, "page", { min: 1, defaultValue: 1 });
    const pageSize = parseIntegerQuery(req.query.page_size, "page_size", {
      min: 1,
      max: 100,
      defaultValue: 20
    });
    const month = parseIntegerQuery(monthRaw, "month", { min: 1, max: 12, defaultValue: undefined });
    const year = parseIntegerQuery(yearRaw, "year", { min: 1970, max: 9999, defaultValue: undefined });

    let date;
    if (dateRaw) {
      date = parseDateOnly(dateRaw, "date").toISOString().slice(0, 10);
    }

    if (month && !year) {
      throw new AppError(400, "year is required when month is provided");
    }

    req.expenseQuery = {
      category: category || undefined,
      sort,
      page,
      pageSize,
      date,
      month,
      year
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function validateExpenseId(req, res, next) {
  try {
    const expenseId = typeof req.params.expenseId === "string" ? req.params.expenseId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expenseId)) {
      throw new AppError(400, "expenseId must be a valid UUID");
    }

    req.expenseId = expenseId;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  validateCreateExpense,
  validateGetExpenses,
  validateExpenseId
};
