process.env.JWT_SECRET = "test-jwt-secret";
process.env.JWT_EXPIRES_IN = "1h";

const request = require("supertest");
const { createApp } = require("../src/app");
const { InMemoryExpenseRepository } = require("./support/inMemoryExpenseRepository");
const {
  InMemoryUserRepository,
  InMemoryOtpRepository,
  createInMemoryMailerService,
  createInMemoryGoogleVerifier
} = require("./support/inMemoryAuthDependencies");

function passthroughRateLimiter(req, res, next) {
  return next();
}

async function signupWithOtpUsingMailer(app, mailerService, email, password = "StrongPass123") {
  const otpResponse = await request(app).post("/auth/request-otp").send({ email, intent: "signup" });
  expect(otpResponse.status).toBe(200);

  const otpCode = mailerService.getLatestOtp(email, "signup");
  expect(otpCode).toMatch(/^\d{6}$/);

  const verifyResponse = await request(app).post("/auth/verify-otp").send({
    email,
    intent: "signup",
    otp: otpCode,
    password
  });

  expect(verifyResponse.status).toBe(200);
  return verifyResponse.body.access_token;
}

function getUtcDateOffset(daysFromToday) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

describe("Auth + Expense API", () => {
  let app;
  let mailerService;

  beforeEach(() => {
    const expenseRepository = new InMemoryExpenseRepository();
    const userRepository = new InMemoryUserRepository();
    const otpRepository = new InMemoryOtpRepository();

    mailerService = createInMemoryMailerService();

    app = createApp({
      expenseRepository,
      userRepository,
      otpRepository,
      mailerService,
      googleVerifier: createInMemoryGoogleVerifier(),
      authRateLimiter: passthroughRateLimiter,
      apiRateLimiter: passthroughRateLimiter
    });
  });

  it("creates an expense for an authenticated user", async () => {
    const token = await signupWithOtpUsingMailer(app, mailerService, "alice@example.com");

    const response = await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "create-test-key")
      .send({
        amount: "12.50",
        category: "Food",
        description: "Lunch",
        date: "2026-02-17"
      });

    expect(response.status).toBe(201);
    expect(response.body.replayed).toBe(false);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        amount: "12.50",
        category: "Food",
        description: "Lunch",
        date: "2026-02-17"
      })
    );
  });

  it("allows repeated signup OTP requests for the same pending email", async () => {
    const email = "repeat-signup@example.com";

    const firstRequest = await request(app).post("/auth/request-otp").send({
      email,
      intent: "signup"
    });
    expect(firstRequest.status).toBe(200);

    const secondRequest = await request(app).post("/auth/request-otp").send({
      email,
      intent: "signup"
    });
    expect(secondRequest.status).toBe(200);

    const latestOtp = mailerService.getLatestOtp(email, "signup");
    expect(latestOtp).toMatch(/^\d{6}$/);

    const verifyResponse = await request(app).post("/auth/verify-otp").send({
      email,
      intent: "signup",
      otp: latestOtp,
      password: "RepeatedOtp123"
    });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.access_token).toEqual(expect.any(String));
  });

  it("rejects creating an expense with a future date", async () => {
    const token = await signupWithOtpUsingMailer(app, mailerService, "future-date@example.com");
    const tomorrow = getUtcDateOffset(1);

    const response = await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "future-date-key")
      .send({
        amount: "12.50",
        category: "Food",
        description: "Invalid future entry",
        date: tomorrow
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("future");
  });

  it("logs in using email and password after OTP signup", async () => {
    await signupWithOtpUsingMailer(app, mailerService, "login@example.com", "Password123");

    const response = await request(app).post("/auth/login").send({
      email: "login@example.com",
      password: "Password123"
    });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toEqual(expect.any(String));
    expect(response.body.user.email).toBe("login@example.com");
  });

  it("resets password using forgot-password OTP flow", async () => {
    await signupWithOtpUsingMailer(app, mailerService, "forgot@example.com", "OldPassword123");

    const requestOtp = await request(app).post("/auth/request-otp").send({
      email: "forgot@example.com",
      intent: "forgot_password"
    });
    expect(requestOtp.status).toBe(200);

    const forgotOtp = mailerService.getLatestOtp("forgot@example.com", "forgot_password");
    expect(forgotOtp).toMatch(/^\d{6}$/);

    const verifyOtp = await request(app).post("/auth/verify-otp").send({
      email: "forgot@example.com",
      intent: "forgot_password",
      otp: forgotOtp,
      password: "NewPassword123"
    });
    expect(verifyOtp.status).toBe(200);

    const loginWithOld = await request(app).post("/auth/login").send({
      email: "forgot@example.com",
      password: "OldPassword123"
    });
    expect(loginWithOld.status).toBe(401);

    const loginWithNew = await request(app).post("/auth/login").send({
      email: "forgot@example.com",
      password: "NewPassword123"
    });
    expect(loginWithNew.status).toBe(200);
  });

  it("signs in with Google OAuth id token", async () => {
    const response = await request(app).post("/auth/google").send({
      id_token: "google-token-valid"
    });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toEqual(expect.any(String));
    expect(response.body.user.email).toBe("google.user@example.com");
  });

  it("returns the same expense for duplicate idempotency key for the same user", async () => {
    const token = await signupWithOtpUsingMailer(app, mailerService, "bob@example.com");

    const payload = {
      amount: "18.00",
      category: "Transport",
      description: "Train ticket",
      date: "2026-02-15"
    };

    const first = await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "repeatable-key")
      .send(payload);
    const second = await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "repeatable-key")
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it("allows same idempotency key across different users while isolating views", async () => {
    const tokenA = await signupWithOtpUsingMailer(app, mailerService, "charlie@example.com");
    const tokenB = await signupWithOtpUsingMailer(app, mailerService, "dana@example.com");

    const sameKey = "shared-key";
    await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", sameKey)
      .send({
        amount: "10.00",
        category: "Food",
        description: "User A",
        date: "2026-02-10"
      });

    const userBCreate = await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${tokenB}`)
      .set("Idempotency-Key", sameKey)
      .send({
        amount: "20.00",
        category: "Food",
        description: "User B",
        date: "2026-02-11"
      });
    expect(userBCreate.status).toBe(201);

    const userAList = await request(app).get("/expenses").set("Authorization", `Bearer ${tokenA}`);
    const userBList = await request(app).get("/expenses").set("Authorization", `Bearer ${tokenB}`);

    expect(userAList.body.data).toHaveLength(1);
    expect(userAList.body.total).toBe("10.00");
    expect(userBList.body.data).toHaveLength(1);
    expect(userBList.body.total).toBe("20.00");
  });

  it("filters by month/year, sorts oldest, and paginates results", async () => {
    const token = await signupWithOtpUsingMailer(app, mailerService, "eve@example.com");

    const rows = [
      { key: "1", amount: "5.00", category: "Food", description: "A", date: "2026-01-01" },
      { key: "2", amount: "6.00", category: "Food", description: "B", date: "2026-01-05" },
      { key: "3", amount: "7.00", category: "Food", description: "C", date: "2026-01-08" },
      { key: "4", amount: "99.00", category: "Travel", description: "D", date: "2026-02-10" }
    ];

    for (const row of rows) {
      await request(app)
        .post("/expenses")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `k-${row.key}`)
        .send(row);
    }

    const response = await request(app)
      .get("/expenses?category=Food&month=1&year=2026&sort=oldest&page=2&page_size=1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].date).toBe("2026-01-05");
    expect(response.body.total).toBe("18.00");
    expect(response.body.pagination).toEqual({
      page: 2,
      page_size: 1,
      total_items: 3,
      total_pages: 3
    });
  });

  it("matches category search case-insensitively", async () => {
    const token = await signupWithOtpUsingMailer(app, mailerService, "casecat@example.com");

    await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "cat-ci-1")
      .send({
        amount: "9.00",
        category: "Groceries",
        description: "Market",
        date: "2026-02-11"
      });

    const response = await request(app)
      .get("/expenses?category=groc")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].category).toBe("Groceries");
  });

  it("deletes an expense for the owner", async () => {
    const token = await signupWithOtpUsingMailer(app, mailerService, "delete-owner@example.com");

    const created = await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "delete-key-1")
      .send({
        amount: "15.00",
        category: "Food",
        description: "To delete",
        date: "2026-02-12"
      });

    const deleteResponse = await request(app)
      .delete(`/expenses/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(204);

    const listResponse = await request(app).get("/expenses").set("Authorization", `Bearer ${token}`);
    expect(listResponse.body.data).toHaveLength(0);
  });

  it("does not delete another user's expense", async () => {
    const tokenA = await signupWithOtpUsingMailer(app, mailerService, "owner@example.com");
    const tokenB = await signupWithOtpUsingMailer(app, mailerService, "other@example.com");

    const created = await request(app)
      .post("/expenses")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", "delete-key-2")
      .send({
        amount: "30.00",
        category: "Travel",
        description: "Owner row",
        date: "2026-02-13"
      });

    const deleteResponse = await request(app)
      .delete(`/expenses/${created.body.data.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(deleteResponse.status).toBe(404);

    const ownerList = await request(app).get("/expenses").set("Authorization", `Bearer ${tokenA}`);
    expect(ownerList.body.data).toHaveLength(1);
  });
});
