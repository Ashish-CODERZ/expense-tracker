const express = require("express");
const {
  validateRequestOtp,
  validateVerifyOtp,
  validatePasswordLogin,
  validateGoogleAuth
} = require("../middleware/validateAuth");

function createAuthRouter(authController) {
  const router = express.Router();

  router.post("/request-otp", validateRequestOtp, authController.requestOtp);
  router.post("/verify-otp", validateVerifyOtp, authController.verifyOtp);
  router.post("/login", validatePasswordLogin, authController.loginWithPassword);
  router.post("/google", validateGoogleAuth, authController.loginWithGoogle);

  return router;
}

module.exports = {
  createAuthRouter
};
