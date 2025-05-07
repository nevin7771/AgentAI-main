/**
 * API Helper utility to handle proxied requests
 */

// Get endpoint from environment or use direct URL
const serverEndpoint =
  process.env.REACT_APP_SERVER_ENDPOINT || "https://vista.nklab.ltd";
const useProxy = process.env.REACT_APP_USE_PROXY === "true";

/**
 * Constructs the API URL with proxy consideration
 *
 * @param {string} path - The API path (without /api prefix)
 * @returns {string} - The full URL
 */
export const getApiUrl = (path) => {
  // Clean up the path to ensure proper formatting
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // If using proxy, API paths are relative
  if (useProxy) {
    return `/api${cleanPath}`;
  }

  // Otherwise use the full server endpoint
  return `${serverEndpoint}/api${cleanPath}`;
};

/**
 * Wrapper for fetch with appropriate CORS and credentials settings
 *
 * @param {string} path - API path (without /api prefix)
 * @param {Object} options - Fetch options
 * @returns {Promise} - Fetch promise
 */
export const apiFetch = (path, options = {}) => {
  const url = getApiUrl(path);

  // Ensure credentials are included for cookies
  const fetchOptions = {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };

  console.log(`API Request: ${options.method || "GET"} ${url}`);
  return fetch(url, fetchOptions);
};

const apiHelper = {
  getApiUrl,
  apiFetch,
};

export default apiHelper;
