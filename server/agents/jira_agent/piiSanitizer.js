// piiSanitizer.js - Handles PII sanitization

/**
 * Sanitizes a query to remove PII before sending to LLM
 */
function sanitizeQuery(query) {
  // Replace emails
  let sanitized = query.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL]"
  );

  // Replace account numbers (assuming common formats)
  sanitized = sanitized.replace(/\b\d{6,12}\b/g, "[ACCOUNT_ID]");

  // Don't sanitize ticket numbers as they're needed for queries

  return sanitized;
}

/**
 * Sanitizes response data to remove PII
 */
function sanitizeResponse(response) {
  if (typeof response === "string") {
    // Replace emails
    let sanitized = response.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[EMAIL]"
    );

    // Replace account numbers
    sanitized = sanitized.replace(/\b\d{6,12}\b/g, "[ACCOUNT_ID]");

    // Don't sanitize ticket numbers in responses

    return sanitized;
  } else if (typeof response === "object" && response !== null) {
    // For object responses, recursively sanitize
    const sanitizedObj = {};

    for (const [key, value] of Object.entries(response)) {
      if (typeof value === "string") {
        sanitizedObj[key] = sanitizeResponse(value);
      } else if (Array.isArray(value)) {
        sanitizedObj[key] = value.map((item) => sanitizeResponse(item));
      } else if (typeof value === "object" && value !== null) {
        sanitizedObj[key] = sanitizeResponse(value);
      } else {
        sanitizedObj[key] = value;
      }
    }

    return sanitizedObj;
  }

  return response;
}

export default {
  sanitizeQuery,
  sanitizeResponse,
};
