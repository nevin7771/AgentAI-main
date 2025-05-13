// server/services/advancedJiraQueryService.js
// This service handles advanced Jira analytical queries.

import jiraClient from "../clients/jiraClient.js"; // Assuming path
import { generateJqlQuery } from "../orchestration/jqlGenerator.js"; // Assuming path
import {
  calculateMTTR,
  groupAndCount,
  formatDataForTable,
  analyzeLinkedIssues,
  formatMillisToDaysHoursMinutes,
} from "../utils/jiraDataProcessor.js"; // Assuming path

// Placeholder for Jira Query Understanding Module (this might be a separate service or integrated logic)
async function understandJiraQuery(naturalLanguageQuery, chatHistory) {
  // This function will eventually implement the logic from jira_query_understanding_design.md
  // For now, it might do basic keyword spotting or pass through to a more complex JQL generator.
  console.log(
    `[advancedJiraQueryService] Understanding query: ${naturalLanguageQuery}`
  );
  // TODO: Implement full query understanding logic
  // Example: based on keywords, determine type and extract params
  if (naturalLanguageQuery.toLowerCase().includes("summary of jira-")) {
    const issueKey = naturalLanguageQuery.match(/JIRA-\d+/i);
    if (issueKey) {
      return {
        analyticsType: "TICKET_SUMMARY",
        parameters: { issueKey: issueKey[0] },
      };
    }
  }
  if (naturalLanguageQuery.toLowerCase().includes("mttr")) {
    return {
      analyticsType: "MTTR_CALCULATION",
      parameters: { jqlQuery: "status = Resolved" },
    }; // Simplified
  }
  // Fallback or more sophisticated logic needed here
  return {
    analyticsType: "GENERAL_JQL_QUERY",
    parameters: { naturalLanguageQuery },
  };
}

async function getTicketSummary(issueKey) {
  console.log(
    `[advancedJiraQueryService] Getting summary for ticket: ${issueKey}`
  );
  try {
    // Expand to get more details like comments, attachments, links as per design
    const issue = await jiraClient.getIssue(issueKey, {
      expand:
        "changelog,renderedFields,names,schema,operations,editmeta,changelog,versionedRepresentations,issuelinks,comments,attachments",
    });
    if (!issue) {
      return { success: false, error: `Ticket ${issueKey} not found.` };
    }
    // Basic summary, can be enhanced with LLM for conciseness if needed
    const summary = {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      assignee: issue.fields.assignee
        ? issue.fields.assignee.displayName
        : "Unassigned",
      reporter: issue.fields.reporter
        ? issue.fields.reporter.displayName
        : "N/A",
      created: issue.fields.created,
      updated: issue.fields.updated,
      description: issue.fields.description, // Or renderedFields.description
      priority: issue.fields.priority ? issue.fields.priority.name : "N/A",
      resolution: issue.fields.resolution
        ? issue.fields.resolution.name
        : "N/A",
      comments: issue.fields.comment
        ? issue.fields.comment.comments
            .map((c) => ({
              author: c.author.displayName,
              created: c.created,
              body: c.body,
            }))
            .slice(0, 5)
        : [], // Example: first 5 comments
      attachments: issue.fields.attachment
        ? issue.fields.attachment
            .map((a) => ({
              filename: a.filename,
              size: a.size,
              author: a.author.displayName,
              created: a.created,
            }))
            .slice(0, 5)
        : [],
      linkedIssues: issue.fields.issuelinks
        ? issue.fields.issuelinks.map((link) => {
            const direction = link.inwardIssue ? "inward" : "outward";
            const linkedIssue = link.inwardIssue || link.outwardIssue;
            return {
              type: link.type.name,
              direction,
              key: linkedIssue.key,
              summary: linkedIssue.fields.summary,
              status: linkedIssue.fields.status.name,
            };
          })
        : [],
    };
    return { success: true, data: summary, presentationHint: "ticket_summary" };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error fetching ticket ${issueKey}:`,
      error
    );
    return { success: false, error: error.message };
  }
}

async function getMTTR(params) {
  // Params: { jqlQuery, project, issueType, priority, dateRange, issueKey }
  console.log(
    `[advancedJiraQueryService] Calculating MTTR with params:`,
    params
  );
  let issues = [];
  try {
    if (params.issueKey) {
      const issue = await jiraClient.getIssue(params.issueKey, {
        fields: "created,resolutiondate,status,updated",
      });
      if (issue) issues.push(issue);
    } else if (params.jqlQuery) {
      // Ensure JQL targets resolved issues and includes necessary fields
      const jql = `${params.jqlQuery} AND statusCategory = Done`; // Assuming statusCategory Done implies resolved
      const searchResults = await jiraClient.searchIssues({
        jql,
        fields: ["created", "resolutiondate", "status", "updated"],
        maxResults: 250,
      }); // Limit for now
      issues = searchResults.issues || [];
    } else {
      return {
        success: false,
        error: "MTTR calculation requires an issue key or JQL query.",
      };
    }

    if (issues.length === 0) {
      return {
        success: true,
        data: {
          mttrFormatted: "N/A",
          count: 0,
          message: "No resolved issues found for the given criteria.",
        },
        presentationHint: "mttr_result",
      };
    }

    const mttrData = calculateMTTR(issues);
    return { success: true, data: mttrData, presentationHint: "mttr_result" };
  } catch (error) {
    console.error(`[advancedJiraQueryService] Error calculating MTTR:`, error);
    return { success: false, error: error.message };
  }
}

async function getTopNIssues(params) {
  // Params: { N, entityType, aggregationField, project, issueArea, componentName, dateRange, otherJqlCriteria }
  console.log(
    `[advancedJiraQueryService] Getting Top N issues with params:`,
    params
  );
  try {
    // Construct JQL based on params - this needs to be robust
    let jql = params.otherJqlCriteria || "";
    if (params.project) jql += ` project = "${params.project}"`;
    // Add more criteria for issueArea, componentName, dateRange etc.
    // For now, a placeholder JQL if not provided
    if (!jql && !params.jqlQueryFromUnderstanding)
      jql = "ORDER BY created DESC";
    else if (params.jqlQueryFromUnderstanding)
      jql = params.jqlQueryFromUnderstanding;

    const fieldsToFetch = [
      "summary",
      "status",
      "assignee",
      "priority",
      params.aggregationField,
    ]
      .filter(Boolean)
      .reduce(
        (acc, field) => {
          if (!acc.includes(field) && field.startsWith("fields."))
            acc.push(field.substring(7));
          // Jira client might expect field names without "fields."
          else if (!acc.includes(field) && !field.startsWith("fields."))
            acc.push(field);
          return acc;
        },
        ["key"]
      );

    const searchResults = await jiraClient.searchIssues({
      jql,
      fields: fieldsToFetch,
      maxResults: 250,
    }); // Fetch more to allow accurate top N
    const issues = searchResults.issues || [];

    if (issues.length === 0) {
      return {
        success: true,
        data: [],
        message: "No issues found for the given criteria.",
        presentationHint: "list_result",
      };
    }

    const groupedData = groupAndCount(
      issues,
      `fields.${params.aggregationField}`
    ); // Ensure field path is correct
    const topN = groupedData.slice(0, params.N || 10);

    return {
      success: true,
      data: topN,
      presentationHint: "top_n_list",
      N: params.N || 10,
      aggregatedBy: params.aggregationField,
    };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error getting Top N issues:`,
      error
    );
    return { success: false, error: error.message };
  }
}

async function getBugGenerationAnalysis(params) {
  // Params: { sourceType ("issue" | "version"), sourceIssueKey, productName, versionName, linkType }
  console.log(
    `[advancedJiraQueryService] Analyzing bug generation with params:`,
    params
  );
  let sourceIssues = [];
  try {
    if (params.sourceType === "issue" && params.sourceIssueKey) {
      const issue = await jiraClient.getIssue(params.sourceIssueKey, {
        expand: "issuelinks",
      });
      if (issue) sourceIssues.push(issue);
    } else if (
      params.sourceType === "version" &&
      params.productName &&
      params.versionName
    ) {
      // This requires mapping productName to Jira project and then searching by fixVersion
      // Simplified: Assume productName is project key for now
      const jql = `project = "${params.productName}" AND fixVersion = "${params.versionName}" AND issuetype = Feature`; // Example: find features in version
      const searchResults = await jiraClient.searchIssues({
        jql,
        expand: "issuelinks",
        maxResults: 50,
      });
      sourceIssues = searchResults.issues || [];
    } else {
      return {
        success: false,
        error:
          "Bug generation analysis requires a source issue or product/version.",
      };
    }

    if (sourceIssues.length === 0) {
      return {
        success: true,
        data: [],
        message: "No source issues found for bug generation analysis.",
        presentationHint: "list_result",
      };
    }

    let allLinkedBugs = [];
    for (const sourceIssue of sourceIssues) {
      const linkedBugs = analyzeLinkedIssues(
        sourceIssue,
        "Bug",
        params.linkType ? [params.linkType] : []
      );
      allLinkedBugs.push(
        ...linkedBugs.map((b) => ({ ...b, source: sourceIssue.key }))
      );
    }

    // Deduplicate if multiple source issues link to the same bug
    const uniqueBugs = Array.from(
      new Map(allLinkedBugs.map((bug) => [bug.key, bug])).values()
    );

    return {
      success: true,
      data: uniqueBugs,
      presentationHint: "bug_list_result",
    };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error analyzing bug generation:`,
      error
    );
    return { success: false, error: error.message };
  }
}

async function getDataForChartOrTable(params) {
  // Params: { visualizationType ("pie_chart" | "bar_chart" | "table"), jqlQuery, project, groupByField, valueField, tableFields, dateRange }
  console.log(
    `[advancedJiraQueryService] Getting data for chart/table with params:`,
    params
  );
  try {
    let jql = params.jqlQuery;
    if (!jql) {
      // Attempt to build JQL if not fully provided
      jql = params.project ? `project = "${params.project}"` : "";
      // Add other criteria like dateRange
      if (!jql)
        return {
          success: false,
          error: "JQL query is required for chart/table data.",
        };
    }

    const fieldsToFetch = new Set(["key"]);
    if (params.groupByField)
      fieldsToFetch.add(
        params.groupByField.startsWith("fields.")
          ? params.groupByField.substring(7)
          : params.groupByField
      );
    if (params.valueField)
      fieldsToFetch.add(
        params.valueField.startsWith("fields.")
          ? params.valueField.substring(7)
          : params.valueField
      );
    if (params.tableFields && Array.isArray(params.tableFields)) {
      params.tableFields.forEach((f) =>
        fieldsToFetch.add(f.startsWith("fields.") ? f.substring(7) : f)
      );
    }

    const searchResults = await jiraClient.searchIssues({
      jql,
      fields: Array.from(fieldsToFetch),
      maxResults: 500,
    }); // Higher limit for charts
    const issues = searchResults.issues || [];

    if (issues.length === 0) {
      return {
        success: true,
        data: [],
        message: "No issues found for the given JQL.",
        presentationHint: params.visualizationType,
      };
    }

    let chartData;
    if (params.visualizationType === "table") {
      chartData = formatDataForTable(
        issues,
        params.tableFields || ["key", "fields.summary", "fields.status.name"]
      );
    } else if (
      params.visualizationType === "pie_chart" ||
      params.visualizationType === "bar_chart"
    ) {
      if (!params.groupByField)
        return {
          success: false,
          error: "groupByField is required for charts.",
        };
      chartData = groupAndCount(
        issues,
        `fields.${params.groupByField}`,
        params.valueField ? `fields.${params.valueField}` : null
      );
    } else {
      return {
        success: false,
        error: `Unsupported visualization type: ${params.visualizationType}`,
      };
    }

    return {
      success: true,
      data: chartData,
      presentationHint: params.visualizationType,
      query: jql,
    };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error getting data for chart/table:`,
      error
    );
    return { success: false, error: error.message };
  }
}

export default {
  getTicketSummary,
  getMTTR,
  getTopNIssues,
  getBugGenerationAnalysis,
  getDataForChartOrTable,
  understandJiraQuery, // Exposing this for OrchestrationService to use initially
};
