const { AppError } = require("../errors/appError");

function createRateLimiter({
  windowMs,
  maxRequests,
  keyBuilder,
  message = "Too many requests. Please retry later."
}) {
  const entries = new Map();

  return function rateLimiter(req, res, next) {
    try {
      const now = Date.now();
      const key = keyBuilder(req);
      const bucket = entries.get(key);

      if (!bucket || bucket.resetAt <= now) {
        entries.set(key, {
          count: 1,
          resetAt: now + windowMs
        });
        return next();
      }

      if (bucket.count >= maxRequests) {
        const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
        res.set("Retry-After", String(Math.max(1, retryAfter)));
        throw new AppError(429, message);
      }

      bucket.count += 1;
      entries.set(key, bucket);

      if (entries.size > 10000) {
        for (const [entryKey, entryValue] of entries.entries()) {
          if (entryValue.resetAt <= now) {
            entries.delete(entryKey);
          }
        }
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  createRateLimiter
};
