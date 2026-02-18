const { AppError } = require("../errors/appError");
const { verifyAccessToken } = require("../utils/jwt");

function createAuthenticateJwt(userRepository) {
  return async function authenticateJwt(req, res, next) {
    try {
      const authorization = req.header("Authorization") || "";
      const [scheme, token] = authorization.split(" ");

      if (scheme !== "Bearer" || !token) {
        throw new AppError(401, "Authorization token is required");
      }

      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch (error) {
        throw new AppError(401, "Invalid or expired token");
      }

      const user = await userRepository.findById(payload.sub);
      if (!user) {
        throw new AppError(401, "Invalid user token");
      }

      req.authUser = {
        id: user.id,
        email: user.email
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  createAuthenticateJwt
};
