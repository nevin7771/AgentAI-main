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
        next(err);
      });
  } else {
    const ip = req.clientIp;

    user
      .findOne({ ip: ip })
      .then((userData) => {
        if (userData) {
          req.user = userData;
          req.auth = "noauth";
          return next();
        }

        const ip = req.clientIp;
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
        if (!err.statusCode) {
          err.statusCode = 500;
        }
        next(err);
      });
  }
};
