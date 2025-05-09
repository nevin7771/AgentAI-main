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
    // Filter out common words and prepositions
    const stopWords = [
      "about",
      "above",
      "after",
      "again",
      "against",
      "all",
      "and",
      "any",
      "are",
      "because",
      "been",
      "before",
      "being",
      "below",
      "between",
      "both",
      "but",
      "does",
      "doing",
      "down",
      "during",
      "each",
      "few",
      "for",
      "from",
      "further",
      "had",
      "has",
      "have",
      "having",
      "here",
      "how",
      "into",
      "itself",
      "just",
      "more",
      "most",
      "once",
      "only",
      "other",
      "over",
      "same",
      "should",
      "some",
      "such",
      "than",
      "that",
      "the",
      "their",
      "them",
      "then",
      "there",
      "these",
      "they",
      "this",
      "those",
      "through",
      "under",
      "until",
      "very",
      "what",
      "when",
      "where",
      "which",
      "while",
      "who",
      "whom",
      "why",
      "will",
      "with",
      "your",
    ];

    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(
        (word) => word.length >= 4 && !stopWords.includes(word.toLowerCase())
      )
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // Escape special regex chars

    if (keywords.length === 0) return text;

    // Create regex to find all instances of these keywords (case insensitive)
    // But avoid highlighting within existing HTML tags, headers, or Markdown syntax
    const regex = new RegExp(
      `(${keywords.join("|")})(?![^<>]*>|[^#]*#|[^*]*\\*\\*|[^\\[]*\\])`,
      "gi"
    );

    // Replace with highlighted version
    const highlightedText = text.replace(regex, "<strong>$1</strong>");

    // Log debugging info for more severe cases
    if (highlightedText.split("<strong>").length > 15) {
      console.warn(
        "Too many highlights detected, original text might be overly highlighted"
      );
    }

    return highlightedText;
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
