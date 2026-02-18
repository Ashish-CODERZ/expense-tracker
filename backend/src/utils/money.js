function normalizeMoney(value) {
  const rawValue = value === null || value === undefined ? "0" : value.toString();
  const [whole, fraction = ""] = rawValue.split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

module.exports = {
  normalizeMoney
};
