// public/src/utils/highlightKeywords.js

/**
 * Highlights keywords in text by wrapping them in <strong> tags
 * @param {string} text - The text to highlight keywords in
 * @param {string} query - The search query containing keywords to highlight
 * @returns {string} Text with highlighted keywords
 */
export const highlightKeywords = (text, query) => {
  if (!text || !query) return text;

  try {
    // Extract keywords from the query (words with 4+ characters)
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length >= 4)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // Escape special regex chars

    if (keywords.length === 0) return text;

    // Create regex to find all instances of these keywords (case insensitive)
    // But avoid highlighting within existing HTML tags
    const regex = new RegExp(`(${keywords.join("|")})(?![^<>]*>)`, "gi");

    // Replace with highlighted version
    return text.replace(regex, "<strong>$1</strong>");
  } catch (error) {
    console.error("Error highlighting keywords:", error);
    return text; // Return original text if error occurs
  }
};

/**
 * Finds and extracts error codes from text
 * @param {string} text - The text to search for error codes
 * @returns {Array} Array of found error codes
 */
export const extractErrorCodes = (text) => {
  if (!text) return [];

  try {
    // Match common error code patterns (number sequences that look like error codes)
    const errorCodePatterns = [
      /Error\s+(\d{3,6})/gi, // "Error 12345"
      /Code\s+(\d{3,6})/gi, // "Code 12345"
      /(\d{3,6})\s+Error/gi, // "12345 Error"
      /#(\d{3,6})/gi, // "#12345"
      /Error:\s*(\d{3,6})/gi, // "Error: 12345"
    ];

    const errorCodes = [];

    // Apply each pattern and collect results
    errorCodePatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        errorCodes.push(match[1]);
      }
    });

    // Remove duplicates and return
    return [...new Set(errorCodes)];
  } catch (error) {
    console.error("Error extracting error codes:", error);
    return [];
  }
};

export default highlightKeywords;
