function createExpenseController(expenseService) {
  return {
    createExpense: async (req, res, next) => {
      try {
        const result = await expenseService.createExpense(
          req.authUser.id,
          req.expenseInput,
          req.idempotencyKey
        );
        const statusCode = result.replayed ? 200 : 201;

        return res.status(statusCode).json({
          data: result.expense,
          replayed: result.replayed
        });
      } catch (error) {
        return next(error);
      }
    },

    getExpenses: async (req, res, next) => {
      try {
        const result = await expenseService.getExpenses(req.authUser.id, req.expenseQuery);

        return res.status(200).json({
          data: result.data,
          total: result.total,
          pagination: result.pagination
        });
      } catch (error) {
        return next(error);
      }
    },

    deleteExpense: async (req, res, next) => {
      try {
        await expenseService.deleteExpense(req.authUser.id, req.expenseId);
        return res.status(204).send();
      } catch (error) {
        return next(error);
      }
    }
  };
}

module.exports = {
  createExpenseController
};
