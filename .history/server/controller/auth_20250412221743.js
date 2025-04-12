import { getOktaTokens, getOktaUserInfo } from "../service/okta_service.js";
import { user } from "../model/user.js";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { getCookieValue } from "../helper/cookieHandler.js";
import { tokenVerify } from "../helper/tokenVerify.js";

const clientRedirectUrl = process.env.CLIENT_REDIRECT_URL;
const accessTokenSecret = process.env.ACCESS_TOKEN_JWT_SECRET;
const refreshTokenSecret = process.env.REFRESH_TOKEN_JWT_SECRET;
const accessTokenExpire = process.env.ACCESS_TOKEN_EXPIRETIME;
const refreshTokenExpire = process.env.REFRESH_TOKEN_EXPIRETIME;
const cookieDomain = process.env.COOKIE_DOMAIN || "localhost";

// ✅ 1. Okta callback handler
// In auth.js controller
export const oktaAuthHandler = async (req, res, next) => {
  try {
    const code = req.query.code;
    console.log("Received Okta code:", code);

    const tokenData = await getOktaTokens(code);
    console.log("Okta tokens received");

    const userData = await getOktaUserInfo(tokenData.access_token);
    console.log("User info retrieved:", userData.email);

    const userInfo = {
      email: userData.email,
      name: userData.name,
      profileImg: userData.picture || "",
    };

    // Find or create user
    let existingUser = await user.findOne({ email: userInfo.email });

    if (!existingUser) {
      // Create new user if not found
      console.log("Creating new user with email:", userInfo.email);
      existingUser = new user(userInfo);
      await existingUser.save();
    } else {
      console.log("Found existing user:", existingUser.email);
    }

    // Create JWT token
    const accessToken = jwt.sign(
      { email: existingUser.email, name: existingUser.name },
      accessTokenSecret,
      { expiresIn: accessTokenExpire }
    );

    // Set cookie for cross-origin
    res.cookie("token", accessToken, {
      httpOnly: true,
      sameSite: "lax", // For dev environment
      secure: false, // For dev environment
      domain: cookieDomain,
      path: "/",
      maxAge: 1000 * 60 * 30,
    });

    console.log("Auth cookie set, redirecting to:", clientRedirectUrl);
    res.redirect(clientRedirectUrl);
  } catch (err) {
    console.error("Okta Auth Error:", err);
    res
      .status(500)
      .json({ message: "Authentication failed", error: err.message });
  }
};

// ✅ 2. Provide user info from cookie
export const getUserInfo = async (req, res) => {
  try {
    const token = getCookieValue(req, "token");
    const userData = jwt.verify(token, accessTokenSecret);
    console.log("Verified userData:", userData);
    const dbUser = await user.findOne({ email: userData.email });

    if (!dbUser) return res.status(404).json({ message: "User not found" });

    res.json({
      name: dbUser.name,
      email: dbUser.email,
      profileImg: dbUser.profileImg,
    });
  } catch (err) {
    console.error("JWT verify failed:", err);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

// ✅ 3. Dummy loginValidation (if login endpoint still exists)
export const loginValidation = (req, res) => {
  return res.status(200).json({ message: "Login via Okta only" });
};

// ✅ 4. Logout handler
export const logoutHandler = async (req, res) => {
  try {
    res.clearCookie("token", {
      domain: cookieDomain,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: "Logout error" });
  }
};

// ✅ 5. Refresh token
export const refreshToken = async (req, res) => {
  try {
    const oldToken = getCookieValue(req, "token");
    const userData = jwt.verify(oldToken, accessTokenSecret);

    const newAccessToken = jwt.sign(
      { email: userData.email, name: userData.name },
      accessTokenSecret,
      { expiresIn: accessTokenExpire }
    );

    res.cookie("token", newAccessToken, {
      httpOnly: true,
      secure: false,
      domain: cookieDomain,
      sameSite: "lax",
      maxAge: 1000 * 60 * 30,
    });

    res.status(200).json({ message: "Token refreshed" });
  } catch (err) {
    res.status(401).json({ message: "Token refresh failed" });
  }
};
