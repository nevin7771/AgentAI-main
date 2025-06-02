// Fixed highlightKeywords.js - Prevent Duplicate Word Artifacts

/**
 * CRITICAL FIX: Clean keyword highlighting that prevents word">word artifacts
 * @param {string} text - The text to highlight keywords in
 * @param {string|Array} query - The search query or array of keywords to highlight
 * @returns {string} Text with highlighted keywords
 */
export const highlightKeywords = (text, query) => {
  if (!text || !query) return text;

  try {
    // CRITICAL FIX: If text already contains HTML highlighting, don't process again
    if (
      text.includes('class="keyword-highlight"') ||
      text.includes("data-keyword=") ||
      text.includes('">')
    ) {
      console.log("[highlightKeywords] Text already processed, skipping");
      return text;
    }

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

    // CRITICAL FIX: Only process plain text, avoid HTML content
    keywords.forEach((keyword) => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // CRITICAL FIX: More restrictive regex to avoid HTML attributes
      const wholeWordRegex = new RegExp(`\\b(${escapedKeyword})\\b`, "gi");

      highlightedText = highlightedText.replace(
        wholeWordRegex,
        (match, p1, offset, string) => {
          // CRITICAL FIX: Don't highlight if inside HTML tags or attributes
          const beforeMatch = string.substring(0, offset);
          const afterMatch = string.substring(offset + match.length);

          // Check if we're inside an HTML tag
          const lastOpenTag = beforeMatch.lastIndexOf("<");
          const lastCloseTag = beforeMatch.lastIndexOf(">");
          const nextCloseTag = afterMatch.indexOf(">");

          // If we're inside an HTML tag, skip highlighting
          if (lastOpenTag > lastCloseTag && nextCloseTag !== -1) {
            return match;
          }

          // Check if already highlighted
          if (
            beforeMatch.includes('class="keyword-highlight"') &&
            !afterMatch.includes("</strong>")
          ) {
            return match;
          }

          // CRITICAL FIX: Simple bold highlighting without complex attributes
          return `<strong style="font-weight: 700; color: inherit;">${match}</strong>`;
        }
      );
    });

    return highlightedText;
  } catch (error) {
    console.error("Error highlighting keywords:", error);
    return text;
  }
};

/**
 * CRITICAL FIX: Safe chat keyword highlighting that prevents duplicates
 * @param {string} text - Text to highlight
 * @param {Array} keywords - Keywords to highlight
 * @returns {string} Highlighted text
 */
export const highlightChatKeywords = (text, keywords = []) => {
  if (!text || !keywords || keywords.length === 0) return text;

  // CRITICAL FIX: Skip if already processed
  if (
    text.includes("font-weight: 700") ||
    text.includes("keyword-highlight") ||
    text.includes('">')
  ) {
    console.log("[highlightChatKeywords] Text already highlighted, skipping");
    return text;
  }

  return highlightKeywords(text, keywords);
};

/**
 * CRITICAL FIX: Clean text preprocessor to remove artifacts
 * @param {string} text - Text that may contain artifacts
 * @returns {string} Cleaned text
 */
export const cleanTextArtifacts = (text) => {
  if (!text || typeof text !== "string") return text;

  try {
    let cleanedText = text;

    // CRITICAL FIX: Remove word">word patterns
    cleanedText = cleanedText.replace(/(\w+)">(\w+)/g, "$1 $2");

    // CRITICAL FIX: Remove stray "> characters
    cleanedText = cleanedText.replace(/\s*">\s*/g, " ");

    // CRITICAL FIX: Remove quotes before > characters
    cleanedText = cleanedText.replace(/"\s*>/g, " ");

    // CRITICAL FIX: Clean up multiple spaces
    cleanedText = cleanedText.replace(/\s{2,}/g, " ");

    // CRITICAL FIX: Remove malformed HTML attribute patterns
    cleanedText = cleanedText.replace(/\w+="[^"]*">/g, " ");

    return cleanedText.trim();
  } catch (error) {
    console.error("Error cleaning text artifacts:", error);
    return text;
  }
};

/**
 * CRITICAL FIX: Safe highlight function that prevents all artifacts
 * @param {string} text - Text to process
 * @param {Array} keywords - Keywords to highlight
 * @returns {string} Safely highlighted text
 */
export const safeHighlightKeywords = (text, keywords = []) => {
  if (!text || !keywords || keywords.length === 0) return text;

  try {
    // STEP 1: Clean any existing artifacts first
    let cleanText = cleanTextArtifacts(text);

    // STEP 2: Skip if already highlighted
    if (cleanText.includes("<strong") || cleanText.includes("font-weight")) {
      return cleanText;
    }

    // STEP 3: Only highlight plain text
    keywords.forEach((keyword) => {
      if (!keyword || keyword.length < 2) return;

      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b(${escapedKeyword})\\b`, "gi");

      cleanText = cleanText.replace(regex, (match) => {
        // CRITICAL FIX: Very simple highlighting
        return `<strong style="font-weight: 700;">${match}</strong>`;
      });
    });

    return cleanText;
  } catch (error) {
    console.error("Error in safe highlighting:", error);
    return text;
  }
};

/**
 * Initialize simple highlighting system
 */
export const initializeKeywordHighlighting = () => {
  if (typeof document === "undefined") return;

  console.log("🎨 Initializing safe keyword highlighting...");

  // Add simple CSS for keyword highlighting
  const style = document.createElement("style");
  style.textContent = `
    .keyword-highlight,
    strong[style*="font-weight: 700"] {
      font-weight: 700 !important;
      color: inherit !important;
      background: none !important;
      border: none !important;
      margin: 0 !important;
      padding: 0 !important;
      display: inline !important;
      line-height: inherit !important;
    }
  `;
  document.head.appendChild(style);

  console.log("✅ Safe keyword highlighting initialized");
};

/**
 * Remove all highlighting from text
 * @param {string} text - Text with highlighting
 * @returns {string} Clean text without highlighting
 */
export const removeHighlighting = (text) => {
  if (!text) return text;

  try {
    let cleanText = text;

    // Remove strong tags with font-weight styling
    cleanText = cleanText.replace(
      /<strong[^>]*style="font-weight: 700[^"]*"[^>]*>(.*?)<\/strong>/gi,
      "$1"
    );

    // Remove any remaining keyword highlight elements
    cleanText = cleanText.replace(
      /<strong[^>]*class="keyword-highlight"[^>]*>(.*?)<\/strong>/gi,
      "$1"
    );

    // Clean up any remaining artifacts
    cleanText = cleanTextArtifacts(cleanText);

    return cleanText;
  } catch (error) {
    console.error("Error removing highlighting:", error);
    return text;
  }
};

/**
 * CRITICAL FIX: Process content safely without creating artifacts
 * @param {string} content - Content to process
 * @param {Array} keywords - Keywords to highlight
 * @param {boolean} isPreformattedHTML - If content is already HTML
 * @returns {string} Safely processed content
 */
export const processContentSafely = (
  content,
  keywords = [],
  isPreformattedHTML = false
) => {
  if (!content) return content;

  try {
    // CRITICAL FIX: If it's preformatted HTML, don't process keywords
    if (isPreformattedHTML) {
      console.log(
        "[processContentSafely] Content is preformatted HTML, skipping keyword processing"
      );
      return cleanTextArtifacts(content);
    }

    // CRITICAL FIX: Clean first, then highlight safely
    let processedContent = cleanTextArtifacts(content);

    if (keywords && keywords.length > 0) {
      processedContent = safeHighlightKeywords(processedContent, keywords);
    }

    return processedContent;
  } catch (error) {
    console.error("Error in safe content processing:", error);
    return content;
  }
};

// Default export
export default safeHighlightKeywords;
