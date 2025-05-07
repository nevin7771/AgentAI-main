// server/agents/utils/agentUtils.js

import axios from "axios";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import fetch from "node-fetch";

// --- Simulated Web Search ---
export const performWebSearch = async (query, sources, maxResults) => {
  console.log(`[Util] Simulating web search for "${query}"`);
  // Simulate search results
  const results = [];
  for (let i = 0; i < maxResults; i++) {
    const source = sources[i % sources.length];
    results.push({
      title: `Simulated Result ${i + 1} for ${query} on ${source}`,
      url: `https://${source}/search?q=${encodeURIComponent(query)}&result=${
        i + 1
      }`,
      snippet: `This is a simulated snippet for search result ${
        i + 1
      } about ${query} from ${source}.`,
      source: source,
    });
  }
  return results;
};

// --- Simulated Web Content Fetching ---
export const fetchWebContent = async (url) => {
  console.log(`[Util] Simulating fetching content from ${url}`);
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return `Simulated content for ${url}. This page discusses various aspects related to the search query, providing details and examples.`;
  } catch (error) {
    console.error(`[Util] Error fetching ${url}: ${error.message}`);
    throw new Error(`Failed to fetch content from ${url}`);
  }
};

// --- Simulated Summarization ---
export const summarizeText = async (text, openaiInstance, maxLength = 500) => {
  console.log(`[Util] Simulating summarization for text length ${text.length}`);
  if (!openaiInstance) {
    console.warn(
      "[Util] OpenAI instance not provided for summarization, returning truncated text."
    );
    return (
      text.substring(0, maxLength) + (text.length > maxLength ? "..." : "")
    );
  }
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const summary = `Simulated summary: ${text.substring(0, 150)}...`;
    return summary.substring(0, maxLength);
  } catch (error) {
    console.error(`[Util] Error during summarization: ${error.message}`);
    return (
      text.substring(0, maxLength) + (text.length > maxLength ? "..." : "")
    );
  }
};

// --- Generate Follow-Up Questions ---
export const generateFollowUpQuestions = async (
  originalQuery,
  generatedAnswer,
  openaiInstance,
  count = 3
) => {
  if (!generatedAnswer || !openaiInstance) {
    return [];
  }
  console.log("[Util] Generating follow-up questions...");
  const systemPrompt = `You are an assistant that suggests relevant follow-up questions. Based on the original query and the provided answer, generate ${count} distinct and insightful follow-up questions a user might ask next. Focus on questions that explore related aspects, ask for more detail, or clarify points made in the answer. Do not repeat the original query. Return ONLY the questions, each on a new line.`;
  const userPrompt = `Original Query: "${originalQuery}"\n\nGenerated Answer:\n${generatedAnswer.substring(
    0,
    1500
  )}...\n\nSuggest ${count} relevant follow-up questions:`;
  try {
    const response = await openaiInstance.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 150,
      n: 1,
    });
    const questionsText = response.choices[0].message.content;
    const questions = questionsText
      .split("\n")
      .map((q) => q.trim().replace(/^\d+\.\s*/, ""))
      .filter((q) => q.length > 5);
    console.log("[Util] Generated follow-up questions:", questions);
    return questions.slice(0, count);
  } catch (error) {
    console.error("[Util] Error generating follow-up questions:", error);
    return [];
  }
};

// --- UPDATED FUNCTION FOR FORMATTING SEARCH RESULTS ---
export const formatSearchResultHTML = (result, query, searchSources) => {
  // Ensure result and result.answer exist
  const answer =
    result && result.answer
      ? String(result.answer).replace(/\n/g, "<br>")
      : "No answer found.";
  const sources = result && Array.isArray(result.sources) ? result.sources : [];
  const relatedQuestions =
    result && Array.isArray(result.relatedQuestions)
      ? result.relatedQuestions
      : [];

  // Sanitize inputs to prevent XSS if they are directly embedded.
  // For simplicity here, we assume they are safe or will be handled by DOMPurify on frontend if re-parsed.
  const sanitizedQuery = query
    ? String(query).replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : "your query";

  // Start the HTML structure with search-results-container
  let html = `<div class="search-results-container">`;

  // Add the main answer with proper styling
  html += `<div class="gemini-answer">
            ${answer || "<p>No answer found for your query.</p>"}
          </div>`;

  // Add sources section if there are any sources
  if (sources.length > 0) {
    html += `<div class="sources-section">
               <h3 class="section-title">Sources</h3>
               <div class="gemini-sources-grid">`;
    sources.forEach((source) => {
      const Surl = source.url || source.link || "#";
      const Stitle = source.title || Surl;
      const Ssnippet = source.snippet || "";
      const Sfavicon = source.favicon || "";
      let hostname = "N/A";
      try {
        hostname = new URL(Surl).hostname;
      } catch (e) {
        /* ignore invalid URL */
      }

      html += `<div class="source-card">
                 <a href="${Surl}" target="_blank" rel="noopener noreferrer" class="source-card-link">
                   <div class="source-card-title">${Stitle.replace(
                     /</g,
                     "&lt;"
                   ).replace(/>/g, "&gt;")}</div>
                   ${
                     Ssnippet
                       ? `<div class="source-card-snippet">${Ssnippet.replace(
                           /</g,
                           "&lt;"
                         ).replace(/>/g, "&gt;")}</div>`
                       : ""
                   }
                   <div class="source-card-footer">
                     ${
                       Sfavicon
                         ? `<img src="${Sfavicon}" alt="favicon" class="source-favicon" />`
                         : ""
                     }
                     <span class="source-url">${hostname}</span>
                   </div>
                 </a>
               </div>`;
    });
    html += `    </div>
             </div>`;
  }

  // Add related questions section if there are any
  if (relatedQuestions.length > 0) {
    html += `<div class="related-questions-section">
               <h3 class="section-title">Related Questions</h3>
               <div class="gemini-chips-list">`;
    relatedQuestions.forEach((q) => {
      html += `<button class="gemini-chip">${String(q)
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</button>`;
    });
    html += `    </div>
             </div>`;
  }

  // Close the main container
  html += `</div>`; // Close search-results-container

  // Add a console log for debugging if needed
  console.log("Generated HTML:", html);

  return html;
};
