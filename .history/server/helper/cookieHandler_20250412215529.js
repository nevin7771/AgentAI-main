// Fixed version
export const getCookieValue = (cookieString, cookieName) => {
  try {
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
