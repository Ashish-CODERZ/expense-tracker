function createAuthController(authService) {
  return {
    requestOtp: async (req, res, next) => {
      try {
        const result = await authService.requestOtp(req.authInput);
        return res.status(200).json(result);
      } catch (error) {
        return next(error);
      }
    },

    verifyOtp: async (req, res, next) => {
      try {
        const result = await authService.verifyOtp(req.authInput);
        return res.status(200).json(result);
      } catch (error) {
        return next(error);
      }
    },

    loginWithPassword: async (req, res, next) => {
      try {
        const result = await authService.loginWithPassword(req.authInput);
        return res.status(200).json(result);
      } catch (error) {
        return next(error);
      }
    },

    loginWithGoogle: async (req, res, next) => {
      try {
        const result = await authService.loginWithGoogleIdToken(req.authInput);
        return res.status(200).json(result);
      } catch (error) {
        return next(error);
      }
    }
  };
}

module.exports = {
  createAuthController
};
