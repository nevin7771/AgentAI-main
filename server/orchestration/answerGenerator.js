// server/orchestration/answerGenerator.js
// Enhanced to prioritize specific ticket information and use structured formatting

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

  const aiSummaryLanguageExampleResponse = `
Example of a good AI Summary Language Issues Response:
## AI Summary Language Issues Found

I've found 5 Jira issues related to incorrect AI summary language:

1. **ZSEE-1623: "Incorrect language in AI meeting summary"**
   * Status: Awaiting Confirmation
   * Assignee: Jane Doe
   * Reported: May 5, 2025

2. **ZSEE-1407: "AI Meeting Summary Generated Wrong Language - French"**
   * Status: Resolved
   * Assignee: John Smith
   * Resolution: Fixed in v2.3.4

3. **ZSEE-1695: "AI summaries of Phone calls revert to English unexpectedly"**
   * Status: Support Pending
   * Assignee: Mike Johnson
   * Priority: High

4. **ZSEE-1632: "AI call summary doesn't work in short call and Japanese"**
   * Status: Support Pending
   * Assignee: Clara Wilson
   * Affects: Japanese language calls under 30 seconds

5. **ZSEE-1598: "Meeting AI summaries coming in Spanish when meeting was in English"**
   * Status: Resolved
   * Assignee: Amy Garcia
   * Fix: Updated language detection algorithm

### Common Patterns
- Issues affecting multiple languages: Japanese, French, Spanish
- Affects both meeting and call summaries
- Several issues were reported this month
`;

  const topIssuesExampleResponse = `
Example of a good Top 10 Issues Response:
## Top 10 Issues in Desktop Clients This Week

I've analyzed the 43 issues in Desktop Clients project created this week. Here are the top 10 by priority:

1. **DESK-4532: "Application crashes when joining meeting with virtual background"**
   * Priority: Critical
   * Status: In Progress
   * Assignee: John Smith
   * Created: May 12, 2025

2. **DESK-4528: "Memory leak when screen sharing with multiple monitors"**
   * Priority: High
   * Status: To Do
   * Assignee: Unassigned
   * Created: May 11, 2025

3. **DESK-4539: "Audio input device not recognized after Windows update"**
   * Priority: High
   * Status: In Progress
   * Assignee: Sarah Johnson
   * Created: May 14, 2025

[Additional issues 4-10 would be listed here...]

### Summary
- 3 Critical priority issues (30%)
- 5 High priority issues (50%)
- 2 Medium priority issues (20%)
- Most issues (60%) relate to audio/video functionality
- 40% of top issues are currently unassigned
`;

  const mttrCalculationExampleResponse = `
Example of a good MTTR Calculation Response:
## MTTR Analysis for Project: Mobile App Team

**Mean Time To Resolution: 3d 14h 22m**

### Details
- 78 issues analyzed (all resolved issues in the Mobile App project)
- Time period: Last 30 days
- Average resolution time: 3 days, 14 hours, 22 minutes

### Resolution Time Breakdown
- Fastest resolution: 4h 12m (MOB-3245: "App icon missing on some Android devices")
- Slowest resolution: 12d 7h 31m (MOB-3201: "Background battery usage optimization")
- Critical issues avg: 1d 8h 17m (9 issues)
- High priority avg: 2d 22h 43m (24 issues)
- Medium priority avg: 4d 15h 32m (45 issues)

### Contributing Factors
- Bug fixes resolved faster (avg 2d 11h) than feature requests (avg 5d 9h)
- UI issues resolved faster than backend integrations
- iOS issues resolved 20% faster than Android issues
`;

  const bugListExampleResponse = `
Example of a good Bug List Response:
## Bug List for Client: Desktop Client v5.2.3

I've found 12 bugs reported for Desktop Client version 5.2.3:

1. **DESK-1234: "Application freezes when changing virtual background"**
   * Status: In Progress
   * Priority: High
   * Assignee: John Smith
   * Reported: May 1, 2025

2. **DESK-1256: "Microphone stays active after leaving meeting"**
   * Status: To Do
   * Priority: Critical
   * Assignee: Jane Doe
   * Reported: May 3, 2025

3. **DESK-1278: "Screen sharing fails on multi-monitor setup"**
   * Status: Resolved
   * Priority: High
   * Resolution: Fixed in v5.2.4
   * Reported: May 5, 2025

[Additional bugs would be listed here...]

### Bug Analysis
- 12 total bugs found for Desktop Client v5.2.3
- 2 Critical, 7 High, 3 Medium priority bugs
- 3 bugs resolved, 5 in progress, 4 to do
- Most impacted area: Audio/Video functionality (58% of bugs)
- Release date: April 28, 2025
`;

  const sentimentAnalysisExampleResponse = `
Example of a good Sentiment Analysis Summary:
## Sentiment Analysis for ZSEE-45678

🆔 Ticket: ZSEE-45678
📊 Overall Sentiment: Negative (-0.32)
🔍 Analysis Based On: 12 text elements (summary, description, comments)

🔑 Key Sentiment Indicators:
✅ Positive Terms: 5 mentions (resolved, working, success)
❌ Negative Terms: 14 mentions (error, issue, broken, failed)

💬 Comment Sentiment Trend:
- Initial comments: Strongly negative (-0.65)
- Recent comments: Slightly improved (-0.28)

🗣️ Most Frequent Terms:
- Negative: "error" (5x), "issue" (4x), "broken" (2x)
- Positive: "fixed" (2x), "working" (2x)

📝 Summary Analysis:
This ticket shows predominantly negative sentiment, which is expected for an issue report. However, there's a slight improvement in the most recent comments, suggesting progress toward resolution. The high frequency of error-related terms indicates a technical problem that has been challenging to resolve.
`;

  const chartDataExampleResponse = `
Example of a good Chart Data Response:
## Issue Distribution by Status for Project ZSEE

I've prepared pie chart data showing the distribution of issues by status for the ZSEE project.

### Chart Data Summary
- **Total issues analyzed: 246**
- **Distribution by status:**
  - In Progress: 87 issues (35.4%)
  - To Do: 56 issues (22.8%)
  - Done: 78 issues (31.7%)
  - Blocked: 25 issues (10.1%)

### Key Insights
- One-third of all issues are already completed (Done status)
- Over one-third of issues are currently being worked on (In Progress)
- Approximately 10% of issues are blocked, potentially requiring management attention
- The ratio of In Progress to To Do issues (1.55:1) suggests good workflow progression

### Recommendation
Focus on resolving Blocked issues to improve overall project velocity. The current workload distribution appears balanced, with a healthy proportion of issues being actively worked on.
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

      // Handle context info
      if (ctx.contextInfo) {
        processedContextStr += `<contextInfo>\n${JSON.stringify(
          ctx.contextInfo,
          null,
          2
        )}\n</contextInfo>\n`;
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

  // Check if the query is about AI summary language issues
  const isAiSummaryLanguageQuery =
    /ai summary.*language|meeting summary.*language|transcript.*language/i.test(
      originalQuery
    );

  // Check if the query is about top N issues
  const isTopNIssuesQuery = /top\s+\d+\s+issues?|top\s+issues?/i.test(
    originalQuery
  );

  // Check if the query is about MTTR
  const isMttrQuery =
    /mttr|mean time to resolution|average resolution time/i.test(originalQuery);

  // Check if the query is about bug list
  const isBugListQuery = /bug\s+list|bugs reported|reported bugs/i.test(
    originalQuery
  );

  // Check if the query is about sentiment analysis
  const isSentimentAnalysisQuery = /sentiment|feeling|emotion|tone/i.test(
    originalQuery
  );

  // Check if the query is about visualization
  const isVisualizationQuery =
    /chart|graph|pie|visualize|table|summarize/i.test(originalQuery);

  const systemPrompt = `You are a helpful AI assistant tasked with synthesizing information from multiple sources to answer a user's query comprehensively. Your goal is to provide a clear, accurate, and well-reasoned answer in Markdown format. The answer should be concise and manager-friendly, generally under 800 words.

General Instructions:
1.  Analyze the user's original query: "${originalQuery}".
2.  Carefully review the provided context, which contains information retrieved from various sources. Pay attention to <context source=...>, <presentationHint>...</presentationHint>, <contextInfo>...</contextInfo> and <raw_jira_data>...</raw_jira_data> tags.
3.  Synthesize the information from ALL relevant context items to construct your answer.
4.  If sources provide conflicting information, acknowledge the discrepancy and present the information clearly.
5.  If the context is insufficient to answer the query fully, state that clearly.
6.  Structure your answer logically using Markdown (headings, lists, bold text, emojis where appropriate for readability).
7.  Provide reasoning for your answer, explaining how the information from the context supports your conclusions.
8.  Cite the sources used within your answer where appropriate, referencing the <context item=...> number (e.g., [Source 1], [Source 3]).
9.  Do NOT invent information not present in the context.
10. Focus on directly answering the user's query.

IMPORTANT: If the context contains a clear, complete answer from an AI Studio agent or other source, prioritize using that content rather than creating a new answer. In such cases, you can simply format the existing answer with proper Markdown and add any missing details from other sources.

PRIORITIZATION INSTRUCTIONS:
- When context contains specific Jira ticket numbers (e.g., ZSEE-1234), ALWAYS include these IDs with their status and assignees in your answer.
- For "Top N issues" queries, ALWAYS structure your response as a numbered list of specific tickets.
- For MTTR calculations, bug lists, and sentiment analysis, focus on the concrete metrics and specific tickets rather than general explanations.
- Keep your responses concise and data-focused - prioritize showing actual tickets over explanations.

Jira-Specific Formatting Instructions:
- If a context item has a <presentationHint>ticket_summary</presentationHint> and contains <raw_jira_data>, you MUST format the answer for that ticket using the following manager-friendly style. Adapt the content based on the actual data in <raw_jira_data>:
${jiraTicketSummaryExample}

- For AI summary language related queries, format your response like this:
${aiSummaryLanguageExampleResponse}

- For Top N issues queries, format your response like this:
${topIssuesExampleResponse}

- For MTTR calculation queries, format your response like this:
${mttrCalculationExampleResponse}

- For bug list queries, format your response like this:
${bugListExampleResponse}

- For sentiment analysis queries, format your response like this:
${sentimentAnalysisExampleResponse}

- For chart/visualization data queries, format your response like this:
${chartDataExampleResponse}

- Always aim for clarity, conciseness, and a professional tone suitable for managers. Ensure the total response is under 800 words.`;

  const userPrompt = `Original Query: ${originalQuery}

Combined Context from Sources:
${processedContextStr}

Based *only* on the provided context and the original query, generate a comprehensive, synthesized, and reasoned answer in Markdown format, adhering to all general and Jira-specific formatting instructions. Ensure the response is manager-friendly and under 800 words.

${
  isAiSummaryLanguageQuery
    ? "IMPORTANT: This query is about AI summary language issues. Format your response to clearly list the specific tickets with their IDs, statuses, and assignees."
    : ""
}
${
  isTopNIssuesQuery
    ? "IMPORTANT: This query is about Top N issues. Format your response to clearly list the specific tickets with their IDs, statuses, and assignees."
    : ""
}
${
  isMttrQuery
    ? "IMPORTANT: This query is about MTTR calculation. Format your response to clearly show the MTTR value and supporting details."
    : ""
}
${
  isBugListQuery
    ? "IMPORTANT: This query is about bug lists. Format your response to clearly list the specific bug tickets with their IDs, statuses, and assignees."
    : ""
}
${
  isSentimentAnalysisQuery
    ? "IMPORTANT: This query is about sentiment analysis. Format your response to clearly show the sentiment scores and key indicators."
    : ""
}
${
  isVisualizationQuery
    ? "IMPORTANT: This query is about data visualization. Format your response to clearly summarize the data that would be shown in the chart/table."
    : ""
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Using a model known for good instruction following and longer context
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more factual and structured output
      max_tokens: 1200, // Allow for slightly more detailed responses when needed
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
