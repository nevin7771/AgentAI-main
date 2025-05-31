// public/src/utils/highlightKeywords.js - Simple Google AI Style Highlighting

/**
 * Simple keyword highlighting with single sky blue color (Google AI style)
 * @param {string} text - The text to highlight keywords in
 * @param {string|Array} query - The search query or array of keywords to highlight
 * @returns {string} Text with highlighted keywords
 */
export const highlightKeywords = (text, query) => {
  if (!text || !query) return text;

  try {
    // Extract keywords from query
    let keywords = [];
    if (Array.isArray(query)) {
      keywords = query.filter((k) => k && k.length > 2);
    } else {
      keywords = String(query)
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 2)
        .slice(0, 5); // Limit to 5 keywords max
    }

    if (keywords.length === 0) return text;

    let highlightedText = text;

    // Simple Google AI style highlighting - single sky blue color
    keywords.forEach((keyword) => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b(${escapedKeyword})\\b`, "gi");

      // Single sky blue highlight style (Google AI style)
      highlightedText = highlightedText.replace(regex, (match) => {
        return `<mark style="
          background-color: #e8f0fe;
          color: #1967d2;
          padding: 2px 4px;
          border-radius: 3px;
          font-weight: 500;
          text-decoration: none;
          border: none;
          box-shadow: none;
        " data-keyword="${keyword}">${match}</mark>`;
      });
    });

    return highlightedText;
  } catch (error) {
    console.error("Error highlighting keywords:", error);
    return text;
  }
};

/**
 * Simple chat keyword highlighting (Google AI style)
 * @param {string} text - Text to highlight
 * @param {Array} keywords - Keywords to highlight
 * @returns {string} Highlighted text
 */
export const highlightChatKeywords = (text, keywords = []) => {
  return highlightKeywords(text, keywords);
};

/**
 * Initialize simple highlighting system
 */
export const initializeKeywordHighlighting = () => {
  if (typeof document === "undefined") return;

  console.log(
    "🎨 Initializing simple keyword highlighting (Google AI style)..."
  );

  // Add simple click handler for keyword copying
  document.addEventListener("click", (event) => {
    if (
      event.target.tagName === "MARK" &&
      event.target.hasAttribute("data-keyword")
    ) {
      const keyword = event.target.getAttribute("data-keyword");

      // Copy to clipboard
      if (navigator.clipboard) {
        navigator.clipboard.writeText(keyword).then(() => {
          console.log(`Keyword "${keyword}" copied to clipboard`);

          // Simple visual feedback
          const original = event.target.style.backgroundColor;
          event.target.style.backgroundColor = "#c8e6c9";
          setTimeout(() => {
            event.target.style.backgroundColor = original;
          }, 500);
        });
      }
    }
  });

  console.log("✅ Simple keyword highlighting initialized");
};

// Default export
export default highlightKeywords;
