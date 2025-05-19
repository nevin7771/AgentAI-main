// public/src/utils/agentResponseFormatter.js
import { marked } from "marked"; // Use a proper Markdown parser
import DOMPurify from "dompurify"; // Sanitize HTML

// Helper function to highlight keywords in text
const highlightKeywordsInText = (text, keywords = []) => {
  if (!text || !keywords || keywords.length === 0) {
    return text;
  }
  // Create a regex to match keywords (case-insensitive, whole words)
  const regex = new RegExp(`\\b(${keywords.join("|")})\\b`, "gi");
  return text.replace(
    regex,
    (match) => `<strong class="highlighted-keyword">${match}</strong>`
  );
};

/**
 * Formats the structured agent response into Gemini-style HTML.
 * @param {object} responseData - The structured response object from the backend API.
 * @returns {string} Formatted and sanitized HTML.
 */
export const formatAgentResponseGeminiStyle = (responseData) => {
  if (!responseData || !responseData.success) {
    return DOMPurify.sanitize(`
      <div class="gemini-results-container error">
        <h3>Error</h3>
        <p>${
          responseData.error ||
          "An error occurred while processing your request."
        }</p>
      </div>
    `);
  }

  const {
    query,
    searchMode,
    structuredAnswer,
    keywords = [],
    sources = [],
    followUpQuestions = [], // Will be used in Step 6
    usedCache = false,
  } = responseData;

  // 1. Process the main answer (Markdown to HTML + Keyword Highlighting)
  let formattedAnswerHtml = "";
  if (structuredAnswer) {
    try {
      // Convert Markdown to HTML using marked
      let rawHtml = marked.parse(structuredAnswer, { breaks: true, gfm: true });
      // Highlight keywords in the generated HTML
      formattedAnswerHtml = highlightKeywordsInText(rawHtml, keywords);
    } catch (e) {
      console.error("Error parsing Markdown:", e);
      // Fallback: treat as plain text and highlight
      formattedAnswerHtml = `<p>${highlightKeywordsInText(
        structuredAnswer,
        keywords
      )}</p>`;
    }
  } else {
    formattedAnswerHtml = "<p>No answer content available.</p>";
  }

  // 2. Process Sources (Highlight keywords in snippets)
  const formattedSourcesHtml = sources
    .map((source, index) => {
      const hostname = source.url
        ? new URL(source.url).hostname
        : "Unknown source";
      const highlightedSnippet = highlightKeywordsInText(
        source.snippet,
        source.keywordsInSnippet || keywords
      );

      return `
      <li class="source-item" id="citation-${index + 1}">
        <a href="${
          source.url || "#"
        }" target="_blank" rel="noopener noreferrer" class="source-link">
          <span class="source-favicon"></span> 
          <div class="source-details">
            <span class="source-title">${source.title || "Untitled"}</span>
            <span class="source-url">${hostname}</span>
            ${
              highlightedSnippet
                ? `<p class="source-snippet">${highlightedSnippet}</p>`
                : ""
            }
          </div>
        </a>
      </li>
    `;
    })
    .join("");

  // 3. Process Follow-up Questions (Placeholder for now - Step 6)
  // We will generate actual chips later
  const formattedFollowUpHtml = `
    <div class="gemini-chips-container">
      <h4>Follow-up Questions</h4>
      <div class="gemini-chips">
        ${
          followUpQuestions.length > 0
            ? followUpQuestions
                .map(
                  (q) =>
                    `<button class="gemini-chip" onclick="/* TODO: Implement click handler */">
                 <span class="gemini-chip-icon">?</span> 
                 <span class="gemini-chip-text">${q}</span>
               </button>`
                )
                .join("")
            : `<p><small>No specific follow-up questions generated.</small></p>`
        }
        <!-- Example static chip -->
        <button class="gemini-chip" onclick="/* TODO: Implement click handler */">
          <span class="gemini-chip-icon">?</span> 
          <span class="gemini-chip-text">Tell me more about ${
            keywords[0] || query
          }</span>
        </button>
      </div>
    </div>
  `;

  // 4. Assemble the final HTML structure (Gemini Style)
  const finalHtml = `
    <div class="gemini-results-container ${searchMode}-search-results">
      ${
        usedCache
          ? `<div class="cache-indicator"><small>Result from cache</small></div>`
          : ``
      }
      <div class="gemini-results-main">
        <div class="gemini-answer">
          ${formattedAnswerHtml}
        </div>
        ${formattedFollowUpHtml} 
      </div>
      
      ${
        sources.length > 0
          ? `
        <div class="gemini-results-sidebar">
          <div class="gemini-sources">
            <h4>Sources</h4>
            <ul>
              ${formattedSourcesHtml}
            </ul>
          </div>
        </div>
      `
          : ``
      }
    </div>
  `;

  // 5. Sanitize the final HTML before returning
  return DOMPurify.sanitize(finalHtml);
};

// Keep the old formatter for potential compatibility or reference, but mark as deprecated
/**
 * @deprecated Use formatAgentResponseGeminiStyle instead.
 */
export const formatAgentResponses = (
  question,
  agentResponses,
  selectedAgents = []
) => {
  console.warn("Using deprecated formatAgentResponses function.");
  // ... (keep old implementation or return a basic message)
  return `<p><i>[Old formatter - Please update to use formatAgentResponseGeminiStyle]</i></p>`;
};

// Keep getAgentName if it's used elsewhere, otherwise it can be removed
export const getAgentName = (agentId) => {
  const agentNames = {
    MRlQT_lhFw: "Client Agent",
    zr_ag: "ZR Agent",
    jira_ag: "Jira Agent",
    conf_ag: "Confluence Agent",
    monitor_ag: "Monitor Agent",
    zp_ag: "ZP Agent",
    "search-with-ai": "Search Agent",
    "deep-search": "Deep Search Agent",
    "rag-search": "RAG Agent",
  };
  return agentNames[agentId] || agentId;
};
