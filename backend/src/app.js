const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { createExpenseRouter } = require("./routes/expenseRoutes");
const { createAuthRouter } = require("./routes/authRoutes");
const { createExpenseController } = require("./controllers/expenseController");
const { createAuthController } = require("./controllers/authController");
const { ExpenseService } = require("./services/expenseService");
const { AuthService } = require("./services/authService");
const { createMailerService } = require("./services/mailerService");
const { PrismaExpenseRepository } = require("./repositories/expenseRepository");
const { PrismaUserRepository } = require("./repositories/userRepository");
const { PrismaOtpRepository } = require("./repositories/otpRepository");
const { createAuthenticateJwt } = require("./middleware/authenticateJwt");
const { createRateLimiter } = require("./middleware/rateLimiter");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { AppError } = require("./errors/appError");

function normalizeOrigin(origin) {
  return String(origin || "")
    .trim()
    .replace(/\/+$/, "");
}

function buildAllowedOriginSet() {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const frontendUrls = String(process.env.FRONTEND_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const localDefaults = ["http://localhost:5173", "http://127.0.0.1:5173"];
  const allOrigins = [frontendUrl, ...frontendUrls, ...localDefaults]
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  return new Set(allOrigins);
}

function isAllowedOrigin(origin, allowedOriginSet, allowVercelPreview) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOriginSet.has(normalizedOrigin)) {
    return true;
  }

  if (allowVercelPreview && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalizedOrigin)) {
    return true;
  }

  return false;
}

function createApp(options = {}) {
  const app = express();
  const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const allowedOriginSet = buildAllowedOriginSet();
  const allowVercelPreview = String(process.env.ALLOW_VERCEL_PREVIEW || "true").toLowerCase() === "true";

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin, allowedOriginSet, allowVercelPreview)) {
          return callback(null, true);
        }

        return callback(new AppError(403, `CORS blocked for origin: ${origin}`));
      },
      allowedHeaders: ["Content-Type", "Idempotency-Key", "Authorization"],
      methods: ["GET", "POST", "DELETE", "OPTIONS"]
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  let prisma = options.prisma || null;

  if (!prisma && !options.expenseRepository && !options.userRepository && !options.otpRepository) {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient();
  }

  const ensureRepository = (customRepository, RepositoryClass, repositoryName) => {
    if (customRepository) {
      return customRepository;
    }
    if (!prisma) {
      throw new Error(`Missing prisma instance for ${repositoryName}`);
    }
    return new RepositoryClass(prisma);
  };

  const expenseRepository = ensureRepository(
    options.expenseRepository,
    PrismaExpenseRepository,
    "expenseRepository"
  );
  const userRepository = ensureRepository(options.userRepository, PrismaUserRepository, "userRepository");
  const otpRepository = ensureRepository(options.otpRepository, PrismaOtpRepository, "otpRepository");

  const mailerService = options.mailerService || createMailerService();
  const expenseService = options.expenseService || new ExpenseService(expenseRepository);
  const authService =
    options.authService ||
    new AuthService({
      userRepository,
      otpRepository,
      mailerService,
      googleVerifier: options.googleVerifier
    });

  const expenseController = createExpenseController(expenseService);
  const authController = createAuthController(authService);

  const authenticateJwt = options.authenticateJwt || createAuthenticateJwt(userRepository);
  const authRateLimiter =
    options.authRateLimiter ||
    createRateLimiter({
      windowMs: rateLimitWindowMs,
      maxRequests: Number(process.env.RATE_LIMIT_AUTH_MAX || 20),
      keyBuilder: (req) => `auth:${req.ip}`,
      message: "Too many auth requests. Please wait before retrying."
    });
  const apiRateLimiter =
    options.apiRateLimiter ||
    createRateLimiter({
      windowMs: rateLimitWindowMs,
      maxRequests: Number(process.env.RATE_LIMIT_API_MAX || 300),
      keyBuilder: (req) => `api:${req.authUser?.id || req.ip}`,
      message: "Too many API requests. Please wait before retrying."
    });

  app.use("/auth", authRateLimiter, createAuthRouter(authController));
  app.use("/expenses", authenticateJwt, apiRateLimiter, createExpenseRouter(expenseController));

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.prisma = prisma;
  return app;
}

module.exports = {
  createApp
};
