export const getCookieValue = (req, cookieName) => {
  try {
    // Make it work with both string and request object
    const cookieString =
      typeof req === "string"
        ? req
        : req.headers && req.headers.cookie
        ? req.headers.cookie
        : "";

    if (!cookieString) return null;

    const cookies = cookieString.split(";").map((cookie) => cookie.trim());

    for (const cookie of cookies) {
      const [name, value] = cookie.split("=");
      if (name === cookieName) {
        return value;
      }
    }

    return null;
  } catch (err) {
    console.error("Cookie parsing error:", err);
    return null;
  }
};
