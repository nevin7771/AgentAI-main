// public/src/utils/highlightKeywords.js

/**
 * Highlights keywords in text by wrapping them in <strong> tags
 * @param {string} text - The text to highlight keywords in
 * @param {string} query - The search query containing keywords to highlight
 * @returns {string} Text with highlighted keywords
 */
export const highlightKeywords = (text, query) => {
  if (!text || !query) return text;

  // Extract keywords from the query (words with 4+ characters)
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // Escape special regex chars

  if (keywords.length === 0) return text;

  // Create regex to find all instances of these keywords (case insensitive)
  const regex = new RegExp(`(${keywords.join("|")})`, "gi");

  // Replace with highlighted version
  return text.replace(regex, "<strong>$1</strong>");
};

export default highlightKeywords;
