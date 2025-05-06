// server/orchestration/answerGenerator.js
// Updated for enhanced result combination and reasoning

import OpenAI from "openai";

// TODO: Configure OpenAI API key securely (e.g., via environment variables)
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

/**
 * Uses an LLM (like GPT-4) to generate a final, synthesized answer based on the user query,
 * processed context from multiple sources (direct APIs, AI Studio), and query analysis.
 *
 * @param {string} originalQuery - The original user query.
 * @param {string} processedContext - Combined and processed context from all retrieved sources.
 * @param {object} queryAnalysis - Output from the initial query analysis LLM call.
 * @returns {Promise<string>} - A promise resolving to the final generated answer (in Markdown).
 */
const generateAnswer = async (
  originalQuery,
  processedContext,
  queryAnalysis
) => {
  if (!openai) {
    console.warn(
      "[answerGenerator] OpenAI API key not configured. Returning basic answer."
    );
    // Fallback: Return context directly or a simple message
    return `OpenAI not configured. Raw context preview:\n${processedContext.substring(
      0,
      1000
    )}...`;
  }

  console.log(
    `[answerGenerator] Generating synthesized answer for query: "${originalQuery}"`
  );

  // Construct a more sophisticated prompt for synthesis and reasoning
  const systemPrompt = `You are a helpful AI assistant tasked with synthesizing information from multiple sources to answer a user's query comprehensively.
Sources might include direct API results (Jira, Confluence) and responses from other AI agents (AI Studio).
Your goal is to provide a clear, accurate, and well-reasoned answer in Markdown format.

Instructions:
1.  Analyze the user's original query: "${originalQuery}".
2.  Carefully review the provided context, which contains information retrieved from various sources. Pay attention to the <context source=...> tags.
3.  Synthesize the information from ALL relevant context items to construct your answer.
4.  If sources provide conflicting information, acknowledge the discrepancy and present the information clearly.
5.  If the context is insufficient to answer the query fully, state that clearly.
6.  Structure your answer logically using Markdown (headings, lists, bold text).
7.  Provide reasoning for your answer, explaining how the information from the context supports your conclusions.
8.  Cite the sources used within your answer where appropriate, referencing the <context item=...> number (e.g., [Source 1], [Source 3]).
9.  Do NOT invent information not present in the context.
10. Focus on directly answering the user's query.`;

  const userPrompt = `Original Query: ${originalQuery}

Combined Context from Sources:
${processedContext}

Based *only* on the provided context and the original query, generate a comprehensive, synthesized, and reasoned answer in Markdown format, citing sources as [Source X].`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4", // Use a powerful model for synthesis and reasoning
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5, // Moderate temperature for balance between creativity and accuracy
      max_tokens: 1000, // Allow for a reasonably detailed answer
      n: 1,
      stop: null,
    });

    const finalAnswer = response.choices[0]?.message?.content?.trim();

    if (!finalAnswer) {
      console.warn("[answerGenerator] LLM returned an empty answer.");
      return "I found some information, but I couldn't synthesize a final answer. Please review the raw context."; // Fallback message
    }

    console.log("[answerGenerator] Successfully generated synthesized answer.");
    return finalAnswer;
  } catch (error) {
    console.error(
      "[answerGenerator] Error calling OpenAI for answer generation:",
      error
    );
    return `Error generating final answer: ${error.message}`;
  }
};

export { generateAnswer };
