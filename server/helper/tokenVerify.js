import jwt from "jsonwebtoken";
import { user } from "../model/user.js";

export const tokenVerify = (token) => {
  return new Promise((resolve, reject) => {
    try {
      const secret = process.env.ACCESS_TOKEN_JWT_SECRET;

      if (!secret) {
        throw new Error("JWT secret is not configured");
      }

      const decodeToken = jwt.verify(token, secret);

      if (!decodeToken || !decodeToken.email) {
        const err = new Error("Invalid token format");
        err.statusCode = 401;
        reject(err);
        return;
      }

      const userEmail = decodeToken.email;

      user
        .findOne({ email: userEmail })
        .then((userData) => {
          if (!userData) {
            const error = new Error("User not found");
            error.statusCode = 403;
            reject(error);
            return;
          }

          const isTokenPresent = userData.expireAccessToken.some(
            (blockedToken) => blockedToken === token
          );

          if (isTokenPresent) {
            const error = new Error("Token has been revoked");
            error.statusCode = 401;
            reject(error);
            return;
          }

          resolve(userData);
        })
        .catch((error) => {
          console.error("Error in token verification:", error);
          reject(error);
        });
    } catch (error) {
      console.error("Token verification error:", error);
      if (error.name === "JsonWebTokenError") {
        error.statusCode = 401;
        error.message = "Invalid token";
      } else if (error.name === "TokenExpiredError") {
        error.statusCode = 401;
        error.message = "Token expired";
      }
      reject(error);
    }
  });
};
