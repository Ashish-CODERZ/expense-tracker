class DuplicateGoogleIdError extends Error {
  constructor(googleId) {
    super("Duplicate Google ID");
    this.name = "DuplicateGoogleIdError";
    this.googleId = googleId;
  }
}

module.exports = {
  DuplicateGoogleIdError
};
