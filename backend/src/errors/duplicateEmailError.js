class DuplicateEmailError extends Error {
  constructor(email) {
    super("Duplicate email");
    this.name = "DuplicateEmailError";
    this.email = email;
  }
}

module.exports = {
  DuplicateEmailError
};
