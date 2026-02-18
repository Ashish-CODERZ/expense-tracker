const express = require("express");
const { validateCreateExpense, validateGetExpenses, validateExpenseId } = require("../middleware/validateExpense");

function createExpenseRouter(expenseController) {
  const router = express.Router();

  router.post("/", validateCreateExpense, expenseController.createExpense);
  router.get("/", validateGetExpenses, expenseController.getExpenses);
  router.delete("/:expenseId", validateExpenseId, expenseController.deleteExpense);

  return router;
}

module.exports = {
  createExpenseRouter
};
