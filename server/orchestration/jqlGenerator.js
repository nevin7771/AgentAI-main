// server/orchestration/jqlGenerator.js
// Dynamic JQL generation using an LLM

import OpenAI from "openai";

// Configure OpenAI API key securely via environment variables
const openaiApiKey = process.env.OPENAI_API_KEY;
console.log(`[jqlGenerator] OpenAI API key available: ${openaiApiKey ? 'Yes' : 'No'}`);
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

/**
 * Uses an LLM to convert a natural language query into a JIRA JQL query.
 * @param {string} naturalLanguageQuery - The user's query in natural language.
 * @param {object} options - Optional parameters (e.g., project context).
 * @returns {Promise<string>} - A promise resolving to the generated JQL query string.
 */
const generateJqlQuery = async (naturalLanguageQuery, options = {}) => {
  if (!openai) {
    console.warn(
      "[jqlGenerator] OpenAI API key not configured. Returning basic JQL."
    );
    // Fallback: Basic JQL searching text fields
    return `text ~ "${naturalLanguageQuery.replace(
      /"/g,
      '\\"'
    )}" ORDER BY updated DESC`;
  }

  console.log(
    `[jqlGenerator] Generating JQL for query: "${naturalLanguageQuery}"`
  );

  // Construct a prompt for the LLM
  const systemPrompt = `You are an expert JIRA user who translates natural language questions into JIRA Query Language (JQL) queries.
Given the user's question, provide ONLY the JQL query string, without any explanation or surrounding text.
Focus on searching relevant fields like summary, description, comments, and potentially custom fields if mentioned.
Use standard JQL syntax. Prioritize recent results unless specified otherwise.
Example:
User: high priority bugs in project ABC
JQL: project = ABC AND priority = High AND type = Bug ORDER BY updated DESC`;

  const userPrompt = `User: ${naturalLanguageQuery}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Or a more advanced model if needed
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2, // Low temperature for more deterministic JQL
      max_tokens: 150,
      n: 1,
      stop: null,
    });

    let jqlQuery = response.choices[0]?.message?.content?.trim();

    // Basic validation/cleanup
    if (!jqlQuery || jqlQuery.toLowerCase().includes("sorry")) {
      console.warn(
        "[jqlGenerator] LLM failed to generate valid JQL. Falling back to basic query."
      );
      jqlQuery = `text ~ "${naturalLanguageQuery.replace(
        /"/g,
        '\\"'
      )}" ORDER BY updated DESC`;
    }
    // Remove potential markdown code fences
    jqlQuery = jqlQuery.replace(/```(jql)?/gi, "").replace(/```/, "");

    console.log(`[jqlGenerator] Generated JQL: ${jqlQuery}`);
    return jqlQuery;
  } catch (error) {
    console.error(
      "[jqlGenerator] Error calling OpenAI for JQL generation:",
      error
    );
    // Fallback to basic JQL on error
    return `text ~ "${naturalLanguageQuery.replace(
      /"/g,
      '\\"'
    )}" ORDER BY updated DESC`;
  }
};

export { generateJqlQuery };
