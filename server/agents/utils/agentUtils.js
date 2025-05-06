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
// Placeholder for existing fetchWebContent
export const fetchWebContent = async (url) => {
  console.log(`[Util] Simulating fetching content from ${url}`);
  // Simulate fetching content
  try {
    // In a real scenario, you might use axios or fetch
    // const response = await axios.get(url, { timeout: 5000 });
    // const $ = cheerio.load(response.data);
    // const textContent = $("body").text(); // Basic text extraction
    // return textContent.replace(/\s\s+/g, " ").trim().substring(0, 10000); // Limit length

    // Simple simulation
    await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate network delay
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
  // Simulate summarization API call
  try {
    // const response = await openaiInstance.chat.completions.create({...
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate API delay
    const summary = `Simulated summary: ${text.substring(0, 150)}...`;
    return summary.substring(0, maxLength);
  } catch (error) {
    console.error(`[Util] Error during summarization: ${error.message}`);
    // Fallback to simple truncation
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

  const userPrompt = `Original Query: "${originalQuery}"

Generated Answer:
${generatedAnswer.substring(0, 1500)}...

Suggest ${count} relevant follow-up questions:`;

  try {
    const response = await openaiInstance.chat.completions.create({
      model: "gpt-3.5-turbo", // Use a faster model for this potentially less critical task
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
      .map((q) => q.trim().replace(/^\d+\.\s*/, "")) // Remove numbering
      .filter((q) => q.length > 5); // Filter out empty or very short lines

    console.log("[Util] Generated follow-up questions:", questions);
    return questions.slice(0, count); // Ensure we return the requested count
  } catch (error) {
    console.error("[Util] Error generating follow-up questions:", error);
    return []; // Return empty array on error
  }
};

// --- Format Search Result HTML ---
export const formatSearchResultHTML = (responseData, query, sources) => {
  if (!responseData || !responseData.answer) {
    return `
      <div class="search-results-container">
        <div class="search-content-wrapper">
          <div class="search-main-content">
            <h2>Search Error</h2>
            <p>There was an error processing your request.</p>
            <p>Please try again or refine your search query.</p>
          </div>
        </div>
      </div>
    `;
  }

  // Extract the answer from the response data
  const { answer } = responseData;

  // Convert answer to HTML with simple markdown-like formatting
  const formattedAnswer = answer
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
    .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>') // Links
    .replace(/^#{1}\s+(.*?)$/gm, '<h1>$1</h1>') // H1
    .replace(/^#{2}\s+(.*?)$/gm, '<h2>$1</h2>') // H2
    .replace(/^#{3}\s+(.*?)$/gm, '<h3>$1</h3>') // H3
    .replace(/^#{4}\s+(.*?)$/gm, '<h4>$1</h4>') // H4
    .replace(/^#{5}\s+(.*?)$/gm, '<h5>$1</h5>') // H5
    .replace(/^#{6}\s+(.*?)$/gm, '<h6>$1</h6>') // H6
    .replace(/\n\n/g, '</p><p>') // Paragraphs
    .replace(/\n/g, '<br>'); // Line breaks

  // Handle citation tags
  const answeredHTML = formattedAnswer.replace(
    /\[\[citation:(\d+)\]\]/g,
    '<sup><a href="#source-$1" class="citation-link">[$1]</a></sup>'
  );

  // Build source citations HTML
  let sourcesHTML = '';
  if (sources && sources.length > 0) {
    sourcesHTML = `
      <div class="search-sources">
        <h3>Sources</h3>
        <ol>
          ${sources.map((source, index) => `
            <li id="source-${index + 1}">
              <a href="${source}" target="_blank" rel="noopener noreferrer">${source}</a>
            </li>
          `).join('')}
        </ol>
      </div>
    `;
  }

  // Add sparkle animation
  const sparkleAnimation = `
    <div class="sparkle-container">
      <div class="sparkle-animation">
        <img src="/build/static/media/gemini_sparkle_blue_33c17e77c4ebbdd9490b683b9812247e257b6f70.svg" class="sparkle-blue" alt="" />
        <img src="/build/static/media/gemini_sparkle_red_4ed1cbfcbc6c9e84c31b987da73fc4168aec8445.svg" class="sparkle-red" alt="" />
      </div>
    </div>
  `;

  // Construct full HTML
  return `
    <div class="search-results-container">
      ${sparkleAnimation}
      <div class="search-content-wrapper">
        <div class="search-main-content">
          <h2>Results for: ${query}</h2>
          <div class="search-answer">
            <p>${answeredHTML}</p>
          </div>
        </div>
        ${sourcesHTML}
      </div>
    </div>
  `;
};
