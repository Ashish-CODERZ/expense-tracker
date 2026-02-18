# Expense Tracker (Multi-User, OTP + JWT, Idempotent)

Production-minded full-stack expense tracker built for reliability under retries, duplicate submits, refreshes, and high request volume.

## Stack
- Backend: Node.js + Express
- Database: PostgreSQL (Neon-compatible)
- ORM: Prisma
- Frontend: React + Vite
- Testing: Jest + Supertest

## Key Capabilities
- Email OTP based signup.
- Password login.
- Forgot-password reset via email OTP.
- Google OAuth login/signup.
- JWT authenticated API.
- Strict per-user data isolation (each user sees only their own expenses).
- Idempotent `POST /expenses` (per-user idempotency keys).
- Server-side filtering, sorting, date/month/year search, and pagination.
- Rate limiting on auth + API routes.
- Layered backend architecture with centralized error handling.

## Project Structure
```text
expense-tracker/
  backend/
    prisma/
    src/
      controllers/
      middleware/
      repositories/
      routes/
      services/
      errors/
      utils/
    tests/
  frontend/
    src/
```

## Quick Start
1. Copy env files:
   - `backend/.env.example` -> `backend/.env`
   - `frontend/.env.example` -> `frontend/.env`
2. If using Neon:
   - `DATABASE_URL` = pooled URL (`...-pooler...`) for runtime.
   - `DIRECT_URL` = direct non-pooler URL for Prisma migration engine.
3. Install dependencies:
   - `cd backend && npm install`
   - `cd frontend && npm install`
4. Run Prisma:
   - `cd backend`
   - `npx prisma generate`
   - `npx prisma migrate deploy`
5. Run apps:
   - Backend: `npm run dev` in `backend/`
   - Frontend: `npm run dev` in `frontend/`
6. Run tests:
   - `cd backend && npm test`

## Environment Variables (Backend)
- `DATABASE_URL`, `DIRECT_URL`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, `PASSWORD_HASH_ROUNDS`
- `GOOGLE_CLIENT_ID`
- SMTP (both styles supported):
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - `SMTP_MAIL`, `SMTP_SERVICE`, `SECURE` (alias style)
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_API_MAX`

If SMTP is unset, OTP is logged server-side (dev fallback).

## API

### Auth
`POST /auth/request-otp`
```json
{
  "email": "user@example.com",
  "intent": "signup"
}
```
or
```json
{
  "email": "user@example.com",
  "intent": "forgot_password"
}
```

`POST /auth/verify-otp`
```json
{
  "email": "user@example.com",
  "intent": "signup",
  "otp": "123456",
  "password": "StrongPass123"
}
```
Returns JWT access token.

`POST /auth/login`
```json
{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

`POST /auth/google`
```json
{
  "id_token": "<google-id-token>"
}
```

Frontend env:
- `VITE_API_URL`
- `VITE_GOOGLE_CLIENT_ID`

### Protected Expense APIs
All require:
- `Authorization: Bearer <token>`

`POST /expenses`
- Requires `Idempotency-Key` header.
- First submit: `201`.
- Same key + same user retry: `200` replay with original expense.
- Same key across different users is allowed.

`DELETE /expenses/:expenseId`
- Deletes one expense permanently.
- User can only delete their own records.
- Returns `204 No Content` when deleted, `404` if not found/owned.

`GET /expenses`
- Query params:
  - `category` (case-insensitive contains search)
  - `sort=newest|oldest` (also supports `date_desc|date_asc`)
  - `date=YYYY-MM-DD` (exact date search)
  - `month=1..12&year=YYYY` (month-wise search)
  - `year=YYYY` (year-wise search)
  - `page` (default 1)
  - `page_size` (default 20, max 100)

Response:
```json
{
  "data": [],
  "total": "0.00",
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 0,
    "total_pages": 1
  }
}
```

## Why `DECIMAL(12,2)` for Money
Money must be exact. Binary floating types can introduce rounding drift, so expenses use `DECIMAL(12,2)` to guarantee deterministic financial values.

## Idempotency Strategy
- `idempotency_key` is required on create.
- Database constraint is scoped per user: `UNIQUE (user_id, idempotency_key)`.
- On unique conflict, API returns the original expense instead of inserting duplicates.
- Frontend persists pending submission key per user in `localStorage` so retry/refresh stays safe.

## Architecture Decisions
- **Routes**: endpoint wiring.
- **Controllers**: HTTP IO mapping.
- **Services**: business rules (OTP flow, JWT issuance, idempotent create semantics).
- **Repositories**: all Prisma/SQL access.
- **Middleware**: validation, authentication, rate limiting, error handling.

This keeps concerns isolated and testable under change.

## Performance and Concurrency Measures
- Pagination by default to avoid returning unbounded lists.
- SQL-side filtering/sorting/aggregation (not frontend post-processing).
- Category search is case-insensitive and optimized with `pg_trgm` index on `LOWER(category)`.
- Indexed access paths:
  - `(user_id, date)`
  - `(user_id, category, date)`
  - `(user_id, idempotency_key)` unique
- Rate limiting for auth and authenticated API routes.
- Stateless JWT auth for horizontal scaling.
- Idempotent write handling for duplicate/retry traffic spikes.

## Validation and Error Handling
- Rejects invalid amount/date/query params.
- Rejects negative amount formats.
- Requires `Idempotency-Key` for writes.
- Requires valid JWT for expense APIs.
- Centralized JSON error responses with correct HTTP codes.
- OTP values are never returned in API responses.

## Frontend Behavior for Real-World Conditions
- OTP-based signup and forgot-password reset.
- Password login for email accounts.
- Google OAuth sign-in support (Google Identity Services).
- JWT session persistence.
- Per-user pending idempotency state persistence.
- Submit button lock + disabled state (double-click safe).
- Timeout/error states for slow or failed API calls.
- Filter/search/sort/pagination controls that call backend query params.
- Per-row delete action with browser confirmation popup for permanent deletion.

## Tradeoffs
- Rate limiter is in-memory (works for single-instance deployment). Multi-instance production should move this to Redis.
- OTP email delivery depends on SMTP envs; fallback is dev-only console output.
- Access tokens are short-lived but refresh token flow is not yet implemented.

## Next Production Additions
- Refresh tokens + token revocation lists.
- Redis-backed distributed rate limiting and OTP state.
- Audit logs and structured observability.
- Admin controls and account recovery flows.
- Optional category normalization / tagging.

## Deploying on Render + Vercel
Render (backend):
1. Create a Web Service pointing to `backend/`.
2. Build command: `npm install && npx prisma generate`.
3. Start command: `npx prisma migrate deploy && npm start`.
4. Set all backend env vars in Render dashboard (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, SMTP vars, etc.).
5. Set `FRONTEND_URL` to your primary Vercel domain.
6. Optional: set `FRONTEND_URLS` as comma-separated additional domains (custom domains, staging).
7. Keep `ALLOW_VERCEL_PREVIEW=true` to allow `*.vercel.app` preview URLs.

Vercel (frontend):
1. Import repo and set project root to `frontend/`.
2. Build command: `npm run build`.
3. Output directory: `dist`.
4. Set `VITE_API_URL` to your Render backend URL.
5. Set `VITE_GOOGLE_CLIENT_ID` to the same Google OAuth client ID.
6. In Google Cloud Console, add your Vercel domain to Authorized JavaScript origins.

SMTP note:
- For Gmail, set `SMTP_PASS` to a Gmail App Password (not your normal account password).

CORS behavior:
- Local works by default for `http://localhost:5173` and `http://127.0.0.1:5173`.
- Production allows configured frontend origins plus optional Vercel preview domains.

Repository deployment helpers:
- `render.yaml` includes backend build/start/env scaffolding for Render.
- `frontend/vercel.json` includes Vite build output and SPA rewrite for Vercel.
