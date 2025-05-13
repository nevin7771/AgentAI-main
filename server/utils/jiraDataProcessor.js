// server/utils/jiraDataProcessor.js
// This module will contain functions to process raw Jira data for analytics.

/**
 * Calculates the Mean Time To Resolution (MTTR) for a list of Jira issues.
 * @param {Array<Object>} issues - Array of Jira issue objects. Each issue must have `created` and `resolutiondate` fields.
 *                                  Alternatively, `changelog` can be used if `resolutiondate` is unreliable.
 * @param {boolean} useBusinessHours - (Future enhancement) Whether to calculate MTTR based on business hours.
 * @returns {Object} - An object containing { mttrMillis: number, count: number, mttrFormatted: string }.
 */
function calculateMTTR(issues, useBusinessHours = false) {
  if (!issues || issues.length === 0) {
    return { mttrMillis: 0, count: 0, mttrFormatted: "N/A" };
  }

  let totalResolutionMillis = 0;
  let resolvedCount = 0;

  for (const issue of issues) {
    if (issue.fields && issue.fields.created && issue.fields.resolutiondate) {
      const createdTime = new Date(issue.fields.created).getTime();
      const resolvedTime = new Date(issue.fields.resolutiondate).getTime();

      if (resolvedTime > createdTime) {
        // Simple calculation for now (calendar time)
        // TODO: Implement business hours calculation if useBusinessHours is true
        totalResolutionMillis += resolvedTime - createdTime;
        resolvedCount++;
      } else {
        console.warn(
          `[jiraDataProcessor] Issue ${issue.key} has resolution date before creation date.`
        );
      }
    } else if (
      issue.fields &&
      issue.fields.created &&
      issue.fields.status &&
      issue.fields.status.statusCategory &&
      issue.fields.status.statusCategory.key === "done" &&
      issue.fields.updated
    ) {
      // Fallback for issues that are in a 'done' status category but might lack a specific resolutiondate
      // Using 'updated' as a proxy for resolution date in this specific case. This is an approximation.
      // A more accurate way would be to parse the changelog for the transition to a resolved status.
      const createdTime = new Date(issue.fields.created).getTime();
      const approxResolvedTime = new Date(issue.fields.updated).getTime(); // Using last updated time
      if (approxResolvedTime > createdTime) {
        console.warn(
          `[jiraDataProcessor] Issue ${issue.key} using updated date as proxy for resolution for MTTR.`
        );
        totalResolutionMillis += approxResolvedTime - createdTime;
        resolvedCount++;
      }
    } else {
      console.warn(
        `[jiraDataProcessor] Issue ${issue.key} is missing created or resolutiondate for MTTR calculation.`
      );
    }
  }

  const averageMillis =
    resolvedCount > 0 ? totalResolutionMillis / resolvedCount : 0;

  return {
    mttrMillis: averageMillis,
    count: resolvedCount,
    mttrFormatted: formatMillisToDaysHoursMinutes(averageMillis),
  };
}

/**
 * Formats milliseconds into a human-readable string (Xd Yh Zm).
 * @param {number} millis - Duration in milliseconds.
 * @returns {string} - Formatted string.
 */
function formatMillisToDaysHoursMinutes(millis) {
  if (millis === 0) return "0m";
  let seconds = Math.floor(millis / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  let days = Math.floor(hours / 24);

  seconds %= 60;
  minutes %= 60;
  hours %= 24;

  let result = "";
  if (days > 0) result += `${days}d `;
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m `;
  // if (seconds > 0 && days === 0 && hours === 0 && minutes === 0) result += `${seconds}s`; // Optional: include seconds for very short durations

  return result.trim() || "<1m"; // Handle very short durations
}

/**
 * Groups issues by a specified field and counts occurrences.
 * Useful for Top N issues or data for pie charts.
 * @param {Array<Object>} issues - Array of Jira issue objects.
 * @param {string} groupByField - The field path to group by (e.g., "fields.assignee.displayName", "fields.priority.name", "fields.status.name").
 * @param {string} countField - (Optional) If provided, sums this numeric field instead of counting issues.
 * @returns {Array<Object>} - Array of objects like [{ label: "FieldValue", value: countOrSum, issues: [issueKey1, ...] }].
 */
function groupAndCount(issues, groupByField, countField = null) {
  if (!issues || issues.length === 0) return [];

  const groups = {};

  issues.forEach((issue) => {
    let fieldValue = "Unassigned"; // Default for fields like assignee
    try {
      // Access nested properties using a helper or by splitting the path
      const pathParts = groupByField.split(".");
      let current = issue;
      for (const part of pathParts) {
        if (current && typeof current === "object" && part in current) {
          current = current[part];
        } else {
          current = null; // Path does not exist or is not an object
          break;
        }
      }
      if (current !== null && current !== undefined) {
        fieldValue = String(current);
      }
    } catch (e) {
      console.warn(
        `[jiraDataProcessor] Error accessing groupByField "${groupByField}" for issue ${issue.key}:`,
        e
      );
      // fieldValue remains "Unassigned" or its previous value
    }

    if (!groups[fieldValue]) {
      groups[fieldValue] = { label: fieldValue, value: 0, issues: [] };
    }

    if (countField) {
      let countVal = 0;
      try {
        const pathParts = countField.split(".");
        let current = issue;
        for (const part of pathParts) {
          if (current && typeof current === "object" && part in current) {
            current = current[part];
          } else {
            current = null;
            break;
          }
        }
        if (typeof current === "number") {
          countVal = current;
        }
      } catch (e) {
        /* ignore */
      }
      groups[fieldValue].value += countVal;
    } else {
      groups[fieldValue].value++;
    }
    groups[fieldValue].issues.push(issue.key);
  });

  return Object.values(groups).sort((a, b) => b.value - a.value); // Sort by value descending
}

/**
 * Prepares data for a table display.
 * @param {Array<Object>} issues - Array of Jira issue objects.
 * @param {Array<string>} fieldsToShow - Array of field paths to include in the table (e.g., ["key", "fields.summary", "fields.assignee.displayName", "fields.status.name"]).
 * @returns {Array<Object>} - Array of objects, where each object represents a row with keys corresponding to the last part of field paths.
 */
function formatDataForTable(issues, fieldsToShow) {
  if (!issues || issues.length === 0) return [];

  return issues.map((issue) => {
    const row = {};
    fieldsToShow.forEach((fieldPath) => {
      let value = "N/A";
      try {
        const pathParts = fieldPath.split(".");
        let current = issue;
        for (const part of pathParts) {
          if (current && typeof current === "object" && part in current) {
            current = current[part];
          } else {
            current = null;
            break;
          }
        }
        if (current !== null && current !== undefined) {
          value = current;
        }
      } catch (e) {
        console.warn(
          `[jiraDataProcessor] Error accessing fieldPath "${fieldPath}" for issue ${issue.key}:`,
          e
        );
      }
      const fieldName = fieldPath.split(".").pop(); // Use the last part of the path as the column header
      row[fieldName] = value;
    });
    return row;
  });
}

/**
 * Analyzes linked issues to find related bugs or other specified issue types.
 * @param {Object} sourceIssue - The source Jira issue object (must include `fields.issuelinks`).
 * @param {string} targetIssueType - The issue type to look for in linked issues (e.g., "Bug").
 * @param {Array<string>} linkTypes - (Optional) Specific link descriptions to filter by (e.g., ["is caused by", "blocks"]). If empty, considers all links.
 * @returns {Array<Object>} - Array of linked issue summaries { key, summary, status, type, linkDescription }.
 */
function analyzeLinkedIssues(
  sourceIssue,
  targetIssueType = "Bug",
  linkTypes = []
) {
  const linkedBugs = [];
  if (
    !sourceIssue ||
    !sourceIssue.fields ||
    !sourceIssue.fields.issuelinks ||
    !Array.isArray(sourceIssue.fields.issuelinks)
  ) {
    return linkedBugs;
  }

  sourceIssue.fields.issuelinks.forEach((link) => {
    const linkDescription = link.type ? link.type.name : "Unknown Link";
    let linkedIssueDetail = null;

    if (link.inwardIssue) {
      // Issue is linked TO the sourceIssue
      linkedIssueDetail = link.inwardIssue;
    } else if (link.outwardIssue) {
      // sourceIssue links TO this issue
      linkedIssueDetail = link.outwardIssue;
    }

    if (
      linkedIssueDetail &&
      linkedIssueDetail.fields &&
      linkedIssueDetail.fields.issuetype &&
      linkedIssueDetail.fields.issuetype.name === targetIssueType
    ) {
      if (
        linkTypes.length === 0 ||
        linkTypes.includes(linkDescription.toLowerCase()) ||
        linkTypes.includes(link.type.inward?.toLowerCase()) ||
        linkTypes.includes(link.type.outward?.toLowerCase())
      ) {
        linkedBugs.push({
          key: linkedIssueDetail.key,
          summary: linkedIssueDetail.fields.summary,
          status: linkedIssueDetail.fields.status
            ? linkedIssueDetail.fields.status.name
            : "N/A",
          type: linkedIssueDetail.fields.issuetype.name,
          linkDescription: linkDescription,
          linkDirection: link.inwardIssue ? "inward" : "outward",
        });
      }
    }
  });
  return linkedBugs;
}

export {
  calculateMTTR,
  groupAndCount,
  formatDataForTable,
  analyzeLinkedIssues,
  formatMillisToDaysHoursMinutes,
};
