import { getCookieValue } from "../helper/cookieHandler.js";
import { tokenVerify } from "../helper/tokenVerify.js";
import { user } from "../model/user.js";

export const authMiddleware = (req, res, next) => {
  console.log("Auth middleware triggered");
  const cookieHeader = req.headers.cookie || "";
  console.log("Cookies received:", cookieHeader);
  const token = getCookieValue(cookieHeader, "token");
  console.log("Token extracted:", token ? "Token found" : "No token");

  if (token) {
    tokenVerify(token)
      .then((userData) => {
        req.user = userData;
        req.auth = "auth";
        next();
      })
      .catch((err) => {
        console.error("[JWT Error]", err.message);
        // Fall back to IP-based authentication
        handleIpBasedAuth(req, res, next);
      });
  } else {
    handleIpBasedAuth(req, res, next);
  }
};

// Helper function to handle IP-based authentication
function handleIpBasedAuth(req, res, next) {
  const ip = req.clientIp;
  console.log("Falling back to IP-based auth with IP:", ip);

  user
    .findOne({ ip: ip })
    .then((userData) => {
      if (userData) {
        console.log("Found existing user by IP:", ip);
        req.user = userData;
        req.auth = "noauth";
        return next();
      }

      console.log("No user found for IP, creating new user");
      const url = `https://api.ipgeolocation.io/ipgeo?apiKey=${process.env.GEO_API_KEY}&ip=${ip}&fields=geo`;

      return fetch(url)
        .then((response) => {
          return response.json();
        })
        .then((data) => {
          let location;

          if (data.city) {
            location =
              data.city + ", " + data.state_prov + ", " + data.country_name;
          } else {
            location = ip;
          }

          console.log("Creating new user with location:", location);
          const newUser = new user({
            ip: ip,
            location: location,
          });

          return newUser
            .save()
            .then((result) => {
              return user.findOne({ ip: ip });
            })
            .then((userData) => {
              if (!userData) {
                const error = new Error("User not found");
                error.statusCode = 403;
                throw error;
              }
              req.user = userData;
              req.auth = "noauth";
              return next();
            });
        });
    })
    .catch((err) => {
      console.error("IP auth error:", err);
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
}
