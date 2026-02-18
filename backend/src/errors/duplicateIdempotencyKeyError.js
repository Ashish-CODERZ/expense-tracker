class DuplicateIdempotencyKeyError extends Error {
  constructor(userId, idempotencyKey) {
    super("Duplicate idempotency key");
    this.name = "DuplicateIdempotencyKeyError";
    this.userId = userId;
    this.idempotencyKey = idempotencyKey;
  }
}

module.exports = {
  DuplicateIdempotencyKeyError
};
