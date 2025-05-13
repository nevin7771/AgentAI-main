// server/orchestration/answerGenerator.js
// Updated to correctly extract and use context information

import OpenAI from "openai";

// TODO: Configure OpenAI API key securely (e.g., via environment variables)
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

/**
 * Uses an LLM (like GPT-4-turbo) to generate a final, synthesized answer based on the user query,
 * processed context from multiple sources (direct APIs, AI Studio), and query analysis.
 *
 * @param {object|string} payload - Either the full payload object or the original query string
 * @param {Array} [processedContext] - Only used if first parameter is a string
 * @param {object} [queryAnalysis] - Only used if first parameter is a string
 * @returns {Promise<string>} - A promise resolving to the final generated answer (in Markdown).
 */
const generateAnswer = async (payload, processedContext, queryAnalysis) => {
  // Handle both old and new parameter formats
  let originalQuery, contexts, routingDecision;

  if (typeof payload === "string") {
    // Old format: separate parameters
    originalQuery = payload;
    contexts = processedContext || [];
    // queryAnalysis remains as passed
  } else if (typeof payload === "object" && payload !== null) {
    // New format: single payload object
    originalQuery = payload.query;
    contexts = payload.contexts || [];
    routingDecision = payload.routing_decision;
    queryAnalysis = payload.queryAnalysis; // If included in payload
  } else {
    console.error("[answerGenerator] Invalid payload format:", payload);
    return "Error generating answer: Invalid payload format";
  }

  if (!openai) {
    console.warn(
      "[answerGenerator] OpenAI API key not configured. Returning basic answer."
    );
    return `OpenAI not configured. Query: ${originalQuery}. Raw context preview:\n${
      contexts.length > 0
        ? JSON.stringify(contexts[0]).substring(0, 1000)
        : "No contexts available"
    }...`;
  }

  // Log the query in a safe way that will work regardless of the type
  console.log(
    `[answerGenerator] Generating synthesized answer for query: "${
      typeof originalQuery === "string"
        ? originalQuery
        : JSON.stringify(originalQuery)
    }"`
  );

  // IMPROVED: Better context extraction and logging
  console.log(`[answerGenerator] Processing ${contexts.length} context items`);

  // Direct check for AI Studio response content first before any other processing
  if (contexts.length > 0) {
    // Look for AI Studio result that has clear answer content
    const aiStudioResult = contexts.find(
      (ctx) =>
        ctx.source &&
        ctx.source.includes("aistudio") &&
        (ctx.result?.answer || ctx.summary || ctx.answer)
    );

    if (aiStudioResult) {
      const directAnswer =
        aiStudioResult.result?.answer ||
        aiStudioResult.summary ||
        aiStudioResult.answer;
      if (
        directAnswer &&
        typeof directAnswer === "string" &&
        directAnswer.length > 100
      ) {
        console.log(
          `[answerGenerator] Found complete AI Studio answer (${directAnswer.length} chars), returning directly`
        );
        return directAnswer;
      }
    }
  }

  const jiraTicketSummaryExample = `
Example of a good Jira Ticket Summary (AI-Generated for Manager):
🆔 Ticket: JIRA-45678
📋 Summary: Users unable to upload files on portal (Error 503)
🎯 Priority: High
🛠 Status: In Progress
👤 Assignee: John Doe

🔍 Issue Overview
Users reported a recurring error 503 - Service Unavailable while attempting to upload files larger than 5MB through the client portal. The issue started after the last platform update (v2.3.1).

🔑 Key Activities & Findings
✅ Logs analyzed by support indicated backend API timeout.
✅ Confirmed the issue only affects files > 5MB.
🔄 Load tests revealed a bottleneck in the API Gateway timeout configuration.
🔄 Related issue identified: JIRA-45655 (Backend Scaling Bug).

🚧 Blockers (if any)
Awaiting infrastructure team to increase API Gateway timeout settings (ETA: 2 days).

🔄 Next Steps
Infra team to update timeout to 60s.
Retest uploads post-fix.
Notify affected customers.

📅 Timeline Summary
Date\tActivity
2024-05-12\tIssue reported by customers
2024-05-13\tLogs analyzed; API bottleneck found
2024-05-14\tInfra change requested

🔗 Linked Issues:
JIRA-45655 (Backend scaling bug)
JIRA-45700 (Customer complaint ticket)

✨ Notes for Management
Issue impacting VIP customer accounts.
Target resolution within 2 business days.
Escalated to L3 support.
`;

  // IMPROVED: Better context extraction with more detailed debugging
  let processedContextStr = "";
  let hasActualContent = false;

  if (Array.isArray(contexts)) {
    contexts.forEach((ctx, index) => {
      processedContextStr += `<context item=${index}>\n`;

      // IMPROVED: Extract and log all possible content fields
      const possibleContentFields = [
        "result.answer",
        "summary",
        "answer",
        "content",
        "result",
      ];

      let contextContent = "";

      // Check for direct answer fields first
      if (ctx.result && typeof ctx.result === "object" && ctx.result.answer) {
        contextContent = ctx.result.answer;
        console.log(
          `[answerGenerator] Found context[${index}].result.answer (${contextContent.length} chars)`
        );
      } else if (ctx.summary) {
        contextContent = ctx.summary;
        console.log(
          `[answerGenerator] Found context[${index}].summary (${contextContent.length} chars)`
        );
      } else if (ctx.answer) {
        contextContent = ctx.answer;
        console.log(
          `[answerGenerator] Found context[${index}].answer (${contextContent.length} chars)`
        );
      } else if (ctx.content) {
        contextContent = ctx.content;
        console.log(
          `[answerGenerator] Found context[${index}].content (${contextContent.length} chars)`
        );
      } else if (typeof ctx.result === "string") {
        contextContent = ctx.result;
        console.log(
          `[answerGenerator] Found context[${index}].result as string (${contextContent.length} chars)`
        );
      }

      if (contextContent && contextContent.length > 50) {
        hasActualContent = true;
      }

      // Add the content fields
      if (ctx.title) processedContextStr += `Title: ${ctx.title}\n`;

      // Add the content we found
      if (contextContent) {
        processedContextStr += `Content: ${contextContent}\n`;
      }

      if (ctx.source) processedContextStr += `Source: ${ctx.source}\n`;
      if (ctx.url) processedContextStr += `URL: ${ctx.url}\n`;

      // Handle raw Jira data if present
      if (ctx.raw_data) {
        processedContextStr += `<raw_jira_data>\n${JSON.stringify(
          ctx.raw_data,
          null,
          2
        )}\n</raw_jira_data>\n`;
      }

      // Handle presentation hint
      if (ctx.presentation_hint) {
        processedContextStr += `<presentationHint>${ctx.presentation_hint}</presentationHint>\n`;
      }

      // For debugging - include sources array
      if (ctx.sources && Array.isArray(ctx.sources)) {
        processedContextStr += `Sources: ${ctx.sources.length} items\n`;
        ctx.sources.forEach((source, sidx) => {
          if (source.title) {
            processedContextStr += `  Source ${sidx}: ${source.title}\n`;
          }
        });
      }

      processedContextStr += `</context>\n\n`;
    });
  } else {
    processedContextStr = "No context data available.";
    console.warn("[answerGenerator] Invalid or empty contexts:", contexts);
  }

  // SHORTCUT: If we have no real content, return a clear message
  if (!hasActualContent) {
    console.warn("[answerGenerator] No substantial content found in contexts!");
    return `I'm sorry, but I don't have sufficient information to answer about "${originalQuery}". The retrieved data didn't contain specific details about this topic.`;
  }

  const systemPrompt = `You are a helpful AI assistant tasked with synthesizing information from multiple sources to answer a user's query comprehensively. Your goal is to provide a clear, accurate, and well-reasoned answer in Markdown format. The answer should be concise and manager-friendly, generally under 800 words.

General Instructions:
1.  Analyze the user's original query: "${originalQuery}".
2.  Carefully review the provided context, which contains information retrieved from various sources. Pay attention to <context source=...>, <presentationHint>...</presentationHint>, and <raw_jira_data>...</raw_jira_data> tags.
3.  Synthesize the information from ALL relevant context items to construct your answer.
4.  If sources provide conflicting information, acknowledge the discrepancy and present the information clearly.
5.  If the context is insufficient to answer the query fully, state that clearly.
6.  Structure your answer logically using Markdown (headings, lists, bold text, emojis where appropriate for readability).
7.  Provide reasoning for your answer, explaining how the information from the context supports your conclusions.
8.  Cite the sources used within your answer where appropriate, referencing the <context item=...> number (e.g., [Source 1], [Source 3]).
9.  Do NOT invent information not present in the context.
10. Focus on directly answering the user's query.

IMPORTANT: If the context contains a clear, complete answer from an AI Studio agent or other source, prioritize using that content rather than creating a new answer. In such cases, you can simply format the existing answer with proper Markdown and add any missing details from other sources.

Jira-Specific Formatting Instructions:
- If a context item has a <presentationHint>ticket_summary</presentationHint> and contains <raw_jira_data>, you MUST format the answer for that ticket using the following manager-friendly style. Adapt the content based on the actual data in <raw_jira_data>:
${jiraTicketSummaryExample}
- For other Jira-related <presentationHint> values (e.g., <presentationHint>mttr_calculation</presentationHint>, <presentationHint>top_n_issues</presentationHint>, <presentationHint>bug_generation_analysis</presentationHint>, <presentationHint>chart_table_data</presentationHint>) and their corresponding <raw_jira_data>, create a similarly well-structured, concise, and manager-friendly summary. Use clear headings, bullet points, and highlight key information. For example:
    - For MTTR: Clearly state the MTTR, the scope, and any contributing factors or number of issues considered.
    - For Top N Issues: List the top issues clearly, perhaps as a numbered or bulleted list with relevant details (e.g., count, key fields).
    - For Bug Analysis: Summarize the findings, list key bugs with IDs, and any patterns observed.
    - For Chart/Table Data: Provide a textual summary of what the data represents, highlight key insights, and mention the type of data prepared (e.g., "Data for a pie chart showing issue distribution by status...").
- Always aim for clarity, conciseness, and a professional tone suitable for managers. Ensure the total response is under 800 words.`;

  const userPrompt = `Original Query: ${originalQuery}

Combined Context from Sources:
${processedContextStr}

Based *only* on the provided context and the original query, generate a comprehensive, synthesized, and reasoned answer in Markdown format, adhering to all general and Jira-specific formatting instructions. Ensure the response is manager-friendly and under 800 words.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Using a model known for good instruction following and longer context
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more factual and structured output
      max_tokens: 800, // Enforce word limit at generation time as well
      n: 1,
      stop: null,
    });

    const finalAnswer = response.choices[0]?.message?.content?.trim();

    if (!finalAnswer) {
      console.warn("[answerGenerator] LLM returned an empty answer.");
      return "I found some information, but I couldn't synthesize a final answer. Please review the raw context.";
    }

    console.log(
      "[answerGenerator] Successfully generated synthesized answer with manager-friendly formatting."
    );
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
