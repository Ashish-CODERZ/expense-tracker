const { AppError } = require("../errors/appError");

function notFoundHandler(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details
      }
    });
  }

  if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, "body")) {
    return res.status(400).json({
      error: {
        message: "Invalid JSON payload",
        details: null
      }
    });
  }

  return res.status(500).json({
    error: {
      message: "Internal server error",
      details: process.env.NODE_ENV === "production" ? null : error.message
    }
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
