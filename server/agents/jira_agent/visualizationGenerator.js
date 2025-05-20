// server/agents/jira_agent/visualizationGenerator.js

/**
 * Visualization Generator
 * Generates visualizations (SVG/HTML) from Jira data
 */

import * as d3 from "d3";

class VisualizationGenerator {
  /**
   * Create visualization based on Jira results
   * @param {Array} jiraResults - The raw Jira results
   * @param {string} visualType - Type of visualization (pie_chart, bar_chart, table, etc.)
   * @returns {Object} - Visualization data including SVG content and explanation
   */
  async createVisualization(jiraResults, visualType) {
    if (!jiraResults || jiraResults.length === 0) {
      return {
        error: true,
        message: "No data available for visualization",
      };
    }

    try {
      // Extract visualization data
      const visualizationData = this.extractVisualizationData(
        jiraResults,
        visualType
      );

      // Generate SVG or HTML for the visualization
      const visualContent = this.generateVisualContent(
        visualizationData,
        visualType
      );

      // Generate text explanation
      const textExplanation = this.generateExplanation(
        visualizationData,
        visualType
      );

      return {
        visualizationType: visualType,
        visualContent: visualContent,
        textExplanation: textExplanation,
        rawData: visualizationData,
      };
    } catch (error) {
      console.error(
        `[VisualizationGenerator] Error creating ${visualType}:`,
        error
      );
      return {
        error: true,
        message: `Error generating visualization: ${error.message}`,
      };
    }
  }

  /**
   * Extract data for visualization from Jira results
   * @param {Array} jiraResults - The Jira results
   * @param {string} visualType - Type of visualization
   * @returns {Array|Object} - Formatted data for visualization
   */
  extractVisualizationData(jiraResults, visualType) {
    switch (visualType) {
      case "pie_chart":
      case "bar_chart":
        // Group by status by default
        return this.groupByField(jiraResults, "status");

      case "line_chart":
        // Group by date for line charts
        return this.groupByTimeField(jiraResults, "created", "day");

      case "table":
        return this.formatTableData(jiraResults);

      case "mttr":
        return this.calculateMTTRData(jiraResults);

      default:
        // Default to status grouping
        return this.groupByField(jiraResults, "status");
    }
  }

  /**
   * Group Jira results by a field
   * @param {Array} jiraResults - The Jira results
   * @param {string} fieldName - Field to group by
   * @returns {Array} - Data array for visualization
   */
  groupByField(jiraResults, fieldName) {
    const groupedData = {};

    jiraResults.forEach((issue) => {
      let fieldValue;

      // Handle nested fields with dot notation
      if (fieldName.includes(".")) {
        const fieldParts = fieldName.split(".");
        let current = issue;

        // Navigate through nested objects
        for (const part of fieldParts) {
          if (current && current.fields && current.fields[part]) {
            current = current.fields[part];
          } else if (current && current[part]) {
            current = current[part];
          } else {
            current = null;
            break;
          }
        }

        fieldValue = current;

        // Handle common field types
        if (typeof fieldValue === "object" && fieldValue !== null) {
          if (fieldValue.name) {
            fieldValue = fieldValue.name;
          } else if (fieldValue.displayName) {
            fieldValue = fieldValue.displayName;
          } else if (fieldValue.value) {
            fieldValue = fieldValue.value;
          }
        }
      } else {
        // Handle top-level fields
        if (fieldName === "status") {
          fieldValue = issue.fields?.status?.name || "Unknown";
        } else if (fieldName === "priority") {
          fieldValue = issue.fields?.priority?.name || "None";
        } else if (fieldName === "assignee") {
          fieldValue = issue.fields?.assignee?.displayName || "Unassigned";
        } else if (fieldName === "key") {
          fieldValue = issue.key || "Unknown";
        } else {
          fieldValue = issue.fields?.[fieldName] || "Unknown";
        }
      }

      // Convert to string for grouping
      fieldValue = String(fieldValue || "Unknown");

      // Count occurrences
      groupedData[fieldValue] = (groupedData[fieldValue] || 0) + 1;
    });

    // Convert to array format for visualization
    return Object.entries(groupedData)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => b.value - a.value); // Sort by value descending
  }

  /**
   * Group Jira results by time field
   * @param {Array} jiraResults - The Jira results
   * @param {string} timeField - Field containing time data
   * @param {string} interval - Time interval (day, week, month)
   * @returns {Array} - Time series data
   */
  groupByTimeField(jiraResults, timeField, interval = "day") {
    const timeData = {};

    // Process each issue
    jiraResults.forEach((issue) => {
      let dateValue;

      // Get date from the right field
      if (timeField === "created") {
        dateValue = issue.fields?.created;
      } else if (timeField === "updated") {
        dateValue = issue.fields?.updated;
      } else if (timeField === "resolutiondate") {
        dateValue = issue.fields?.resolutiondate;
      } else {
        dateValue = issue.fields?.[timeField];
      }

      if (!dateValue) return;

      // Parse date
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return;

      // Format date based on interval
      let timeKey;
      if (interval === "day") {
        timeKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
      } else if (interval === "week") {
        // Get the first day of the week (Sunday)
        const day = date.getUTCDay();
        const diff = date.getUTCDate() - day;
        const weekStart = new Date(date);
        weekStart.setUTCDate(diff);
        timeKey = weekStart.toISOString().split("T")[0];
      } else if (interval === "month") {
        timeKey = `${date.getUTCFullYear()}-${String(
          date.getUTCMonth() + 1
        ).padStart(2, "0")}`;
      } else {
        timeKey = date.toISOString().split("T")[0];
      }

      // Count occurrences
      timeData[timeKey] = (timeData[timeKey] || 0) + 1;
    });

    // Convert to array and sort by date
    return Object.entries(timeData)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Format Jira results for table display
   * @param {Array} jiraResults - The Jira results
   * @returns {Object} - Table data with headers and rows
   */
  formatTableData(jiraResults) {
    if (!jiraResults || jiraResults.length === 0) {
      return { headers: [], rows: [] };
    }

    // Define columns to display (customize as needed)
    const columns = [
      { field: "key", label: "Key" },
      { field: "fields.summary", label: "Summary" },
      { field: "fields.status.name", label: "Status" },
      { field: "fields.priority.name", label: "Priority" },
      { field: "fields.assignee.displayName", label: "Assignee" },
      { field: "fields.created", label: "Created" },
    ];

    // Extract row data
    const rows = jiraResults.map((issue) => {
      const row = {};

      columns.forEach((column) => {
        // Handle dot notation
        if (column.field.includes(".")) {
          const fieldParts = column.field.split(".");
          let value = issue;

          for (const part of fieldParts) {
            if (value && value[part]) {
              value = value[part];
            } else {
              value = null;
              break;
            }
          }

          row[column.label] = value || "";
        } else {
          row[column.label] = issue[column.field] || "";
        }
      });

      return row;
    });

    return {
      headers: columns.map((col) => col.label),
      rows: rows,
    };
  }

  /**
   * Calculate MTTR data
   * @param {Array} jiraResults - The Jira issues
   * @returns {Object} - MTTR calculation data
   */
  calculateMTTRData(jiraResults) {
    let totalResolutionTimeMs = 0;
    let resolvedCount = 0;
    const issueData = [];

    jiraResults.forEach((issue) => {
      if (issue.fields && issue.fields.created && issue.fields.resolutiondate) {
        const createdDate = new Date(issue.fields.created);
        const resolvedDate = new Date(issue.fields.resolutiondate);
        const resolutionTimeMs = resolvedDate - createdDate;

        if (resolutionTimeMs > 0) {
          totalResolutionTimeMs += resolutionTimeMs;
          resolvedCount++;

          // Add to issue data
          issueData.push({
            key: issue.key,
            summary: issue.fields.summary || "No summary",
            created: issue.fields.created,
            resolved: issue.fields.resolutiondate,
            timeMs: resolutionTimeMs,
            timeFormatted: this.formatMilliseconds(resolutionTimeMs),
          });
        }
      }
    });

    if (resolvedCount === 0) {
      return {
        mttrMs: 0,
        mttrFormatted: "N/A",
        count: 0,
        issues: [],
      };
    }

    const mttrMs = totalResolutionTimeMs / resolvedCount;

    return {
      mttrMs,
      mttrFormatted: this.formatMilliseconds(mttrMs),
      count: resolvedCount,
      issues: issueData.sort((a, b) => b.timeMs - a.timeMs), // Sort by resolution time
    };
  }

  /**
   * Format milliseconds to human-readable time
   * @param {number} ms - Time in milliseconds
   * @returns {string} - Formatted time string
   */
  formatMilliseconds(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days > 1 ? "s" : ""}, ${hours % 24} hour${
        hours % 24 !== 1 ? "s" : ""
      }`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? "s" : ""}, ${minutes % 60} minute${
        minutes % 60 !== 1 ? "s" : ""
      }`;
    } else {
      return `${minutes} minute${minutes > 1 ? "s" : ""}`;
    }
  }

  /**
   * Generate SVG or HTML content for the visualization
   * @param {Array|Object} data - The visualization data
   * @param {string} visualType - Type of visualization
   * @returns {string} - SVG or HTML content
   */
  generateVisualContent(data, visualType) {
    switch (visualType) {
      case "pie_chart":
        return this.generatePieChartSVG(data);
      case "bar_chart":
        return this.generateBarChartSVG(data);
      case "line_chart":
        return this.generateLineChartSVG(data);
      case "table":
        return this.generateTableHTML(data);
      case "mttr":
        return this.generateMTTRVisualization(data);
      default:
        return `<svg width="400" height="300"><text x="50" y="50">Visualization type '${visualType}' not supported</text></svg>`;
    }
  }

  /**
   * Generate pie chart SVG
   * @param {Array} data - Data for the pie chart
   * @returns {string} - SVG content
   */
  generatePieChartSVG(data) {
    // Simple implementation - in production use actual D3 rendering
    const width = 400;
    const height = 300;
    const radius = Math.min(width, height) / 2;

    // Prepare SVG structure
    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<g transform="translate(${width / 2}, ${height / 2})">`;

    // Generate a color palette
    const colors = [
      "#4e79a7",
      "#f28e2c",
      "#e15759",
      "#76b7b2",
      "#59a14f",
      "#edc949",
      "#af7aa1",
      "#ff9da7",
      "#9c755f",
      "#bab0ab",
    ];

    // Calculate total for percentages
    const total = data.reduce((sum, d) => sum + d.value, 0);

    // Draw pie segments
    let startAngle = 0;
    data.forEach((d, i) => {
      const portion = d.value / total;
      const endAngle = startAngle + portion * Math.PI * 2;

      // Calculate path
      const x1 = Math.sin(startAngle) * radius;
      const y1 = -Math.cos(startAngle) * radius;
      const x2 = Math.sin(endAngle) * radius;
      const y2 = -Math.cos(endAngle) * radius;

      // Determine if the arc is more than 180 degrees
      const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

      // Create pie segment path
      const pathData = [
        `M 0 0`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        "Z",
      ].join(" ");

      // Add path to SVG
      svg += `<path d="${pathData}" fill="${
        colors[i % colors.length]
      }" stroke="white" stroke-width="1"></path>`;

      // Calculate position for label
      const labelAngle = startAngle + (endAngle - startAngle) / 2;
      const labelRadius = radius * 0.7;
      const labelX = Math.sin(labelAngle) * labelRadius;
      const labelY = -Math.cos(labelAngle) * labelRadius;

      // Add percentage label if segment is large enough
      if (portion > 0.05) {
        svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="12px" fill="white">${Math.round(
          portion * 100
        )}%</text>`;
      }

      startAngle = endAngle;
    });

    // Close the SVG elements
    svg += "</g>";

    // Add legend
    svg += `<g transform="translate(10, 10)">`;
    data.forEach((d, i) => {
      svg += `<rect x="0" y="${i * 20}" width="15" height="15" fill="${
        colors[i % colors.length]
      }"></rect>`;
      svg += `<text x="20" y="${i * 20 + 12}" font-size="12px">${d.name} (${
        d.value
      })</text>`;
    });
    svg += "</g>";

    svg += "</svg>";

    return svg;
  }

  /**
   * Generate bar chart SVG
   * @param {Array} data - Data for the bar chart
   * @returns {string} - SVG content
   */
  generateBarChartSVG(data) {
    const width = 500;
    const height = 400;
    const margin = { top: 20, right: 30, bottom: 60, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Prepare SVG structure
    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<g transform="translate(${margin.left}, ${margin.top})">`;

    // Generate a color palette
    const colors = [
      "#4e79a7",
      "#f28e2c",
      "#e15759",
      "#76b7b2",
      "#59a14f",
      "#edc949",
      "#af7aa1",
      "#ff9da7",
      "#9c755f",
      "#bab0ab",
    ];

    // Determine the maximum value for scaling
    const maxValue = Math.max(...data.map((d) => d.value));

    // Bar width and spacing
    const barWidth = (chartWidth / data.length) * 0.8;

    // Draw bars
    data.forEach((d, i) => {
      const barHeight = (d.value / maxValue) * chartHeight;
      const barX =
        i * (chartWidth / data.length) +
        (chartWidth / data.length - barWidth) / 2;
      const barY = chartHeight - barHeight;

      // Add bar
      svg += `<rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="${
        colors[i % colors.length]
      }"></rect>`;

      // Add value label
      svg += `<text x="${barX + barWidth / 2}" y="${
        barY - 5
      }" text-anchor="middle" font-size="12px">${d.value}</text>`;

      // Add category label
      svg += `<text x="${barX + barWidth / 2}" y="${
        chartHeight + 20
      }" text-anchor="middle" font-size="12px" transform="rotate(45, ${
        barX + barWidth / 2
      }, ${chartHeight + 20})">${d.name}</text>`;
    });

    // Draw axes
    svg += `<line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="black"></line>`;
    svg += `<line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="black"></line>`;

    // Add title
    svg += `<text x="${
      chartWidth / 2
    }" y="-5" text-anchor="middle" font-size="16px">Issues by Status</text>`;

    // Close SVG
    svg += "</g></svg>";

    return svg;
  }

  /**
   * Generate line chart SVG
   * @param {Array} data - Time series data for the line chart
   * @returns {string} - SVG content
   */
  generateLineChartSVG(data) {
    const width = 600;
    const height = 400;
    const margin = { top: 20, right: 30, bottom: 50, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Prepare SVG structure
    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<g transform="translate(${margin.left}, ${margin.top})">`;

    // Sort data by date
    data.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Find range of dates and values
    const minDate = new Date(data[0].date);
    const maxDate = new Date(data[data.length - 1].date);
    const maxCount = Math.max(...data.map((d) => d.count));

    // X scale (time)
    const xScale = (date) => {
      const timeRange = maxDate.getTime() - minDate.getTime();
      const dateTime = new Date(date).getTime();
      return ((dateTime - minDate.getTime()) / timeRange) * chartWidth;
    };

    // Y scale (count)
    const yScale = (count) => {
      return chartHeight - (count / maxCount) * chartHeight;
    };

    // Generate path data
    let pathData = "";
    data.forEach((d, i) => {
      const x = xScale(d.date);
      const y = yScale(d.count);

      if (i === 0) {
        pathData += `M ${x} ${y}`;
      } else {
        pathData += ` L ${x} ${y}`;
      }
    });

    // Draw the line
    svg += `<path d="${pathData}" stroke="#4e79a7" fill="none" stroke-width="2"></path>`;

    // Draw data points
    data.forEach((d) => {
      const x = xScale(d.date);
      const y = yScale(d.count);
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="#4e79a7"></circle>`;

      // Add value labels
      svg += `<text x="${x}" y="${
        y - 10
      }" text-anchor="middle" font-size="12px">${d.count}</text>`;
    });

    // Draw X axis (time)
    svg += `<line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="black"></line>`;

    // Draw Y axis (count)
    svg += `<line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="black"></line>`;

    // Add X axis labels
    // Display a subset of dates to avoid overcrowding
    const dateLabels = [];
    const labelCount = Math.min(6, data.length);
    for (let i = 0; i < labelCount; i++) {
      const index = Math.floor((i * (data.length - 1)) / (labelCount - 1));
      dateLabels.push(data[index]);
    }

    dateLabels.forEach((d) => {
      const x = xScale(d.date);
      const formattedDate = new Date(d.date).toLocaleDateString();
      svg += `<text x="${x}" y="${
        chartHeight + 20
      }" text-anchor="middle" font-size="12px">${formattedDate}</text>`;
    });

    // Add Y axis labels
    for (let i = 0; i <= 5; i++) {
      const value = Math.round((maxCount * i) / 5);
      const y = yScale(value);
      svg += `<text x="-5" y="${y}" text-anchor="end" alignment-baseline="middle" font-size="12px">${value}</text>`;
      svg += `<line x1="-3" y1="${y}" x2="0" y2="${y}" stroke="black"></line>`;
    }

    // Add title
    svg += `<text x="${
      chartWidth / 2
    }" y="-5" text-anchor="middle" font-size="16px">Issues Over Time</text>`;

    // Close SVG
    svg += "</g></svg>";

    return svg;
  }

  /**
   * Generate HTML table
   * @param {Object} data - Table data with headers and rows
   * @returns {string} - HTML content
   */
  generateTableHTML(data) {
    if (!data || !data.headers || !data.rows || data.rows.length === 0) {
      return "<p>No data available for table</p>";
    }

    let tableHTML =
      '<table border="1" cellpadding="5" style="width:100%; border-collapse: collapse;">\n<thead>\n<tr>\n';

    // Add headers
    data.headers.forEach((header) => {
      tableHTML += `<th style="text-align: left; background-color: #f2f2f2;">${header}</th>\n`;
    });

    tableHTML += "</tr>\n</thead>\n<tbody>\n";

    // Add rows
    data.rows.forEach((row, rowIndex) => {
      tableHTML += "<tr>\n";
      data.headers.forEach((header) => {
        const value = row[header] || "";

        // Format dates nicely
        let formattedValue = value;
        if (header === "Created" || header === "Updated") {
          try {
            formattedValue = new Date(value).toLocaleString();
          } catch (e) {
            formattedValue = value;
          }
        }

        tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${formattedValue}</td>\n`;
      });
      tableHTML += "</tr>\n";
    });

    tableHTML += "</tbody>\n</table>";

    return tableHTML;
  }

  /**
   * Generate MTTR visualization
   * @param {Object} data - MTTR data
   * @returns {string} - HTML content
   */
  generateMTTRVisualization(data) {
    if (!data || data.count === 0) {
      return "<p>No data available for MTTR calculation</p>";
    }

    // Create a combined visualization with summary and details
    let html = '<div style="font-family: Arial, sans-serif;">';

    // Display the main MTTR metric
    html += `<div style="text-align: center; margin-bottom: 20px;">
      <h2 style="margin-bottom: 5px;">Mean Time To Resolution</h2>
      <div style="font-size: 36px; font-weight: bold; color: #4e79a7;">${data.mttrFormatted}</div>
      <div style="color: #666;">Based on ${data.count} resolved issues</div>
    </div>`;

    // Add bar chart for resolution times of individual issues
    const maxTimeMs = Math.max(...data.issues.map((issue) => issue.timeMs));

    html += '<div style="margin-top: 30px;">';
    html += "<h3>Resolution Times by Issue</h3>";

    // Show top 10 issues only to avoid overwhelming visualization
    const displayIssues = data.issues.slice(0, 10);

    displayIssues.forEach((issue) => {
      const percentage = (issue.timeMs / maxTimeMs) * 100;
      html += `<div style="margin-bottom: 10px;">
        <div style="display: flex; align-items: center;">
          <div style="width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${issue.key}
          </div>
          <div style="flex-grow: 1; margin: 0 10px;">
            <div style="background-color: #eee; height: 20px; width: 100%; border-radius: 3px;">
              <div style="background-color: #4e79a7; height: 20px; width: ${percentage}%; border-radius: 3px;"></div>
            </div>
          </div>
          <div style="width: 120px; text-align: right;">
            ${issue.timeFormatted}
          </div>
        </div>
        <div style="margin-left: 100px; font-size: 12px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400px;">
          ${issue.summary}
        </div>
      </div>`;
    });

    html += "</div>";

    // Close the container
    html += "</div>";

    return html;
  }

  /**
   * Generate text explanation for visualization
   * @param {Array|Object} data - Visualization data
   * @param {string} visualType - Type of visualization
   * @returns {string} - Text explanation
   */
  generateExplanation(data, visualType) {
    switch (visualType) {
      case "pie_chart":
      case "bar_chart": {
        if (!Array.isArray(data) || data.length === 0) {
          return "No data available for analysis.";
        }

        const total = data.reduce((sum, item) => sum + item.value, 0);

        let explanation = `This ${visualType.replace(
          "_",
          " "
        )} shows the distribution of ${total} issues by status:\n\n`;

        data.forEach((item) => {
          const percentage = Math.round((item.value / total) * 100);
          explanation += `* ${item.name}: ${item.value} issues (${percentage}%)\n`;
        });

        // Add insights
        if (data.length > 1) {
          const top = data[0];
          const topPercentage = Math.round((top.value / total) * 100);

          explanation += `\nThe largest category is "${top.name}" with ${top.value} issues (${topPercentage}% of total).\n`;
        }

        return explanation;
      }

      case "line_chart": {
        if (!Array.isArray(data) || data.length === 0) {
          return "No time series data available for analysis.";
        }

        let explanation = `This line chart shows the number of issues over time:\n\n`;

        // Find the range of dates
        const startDate = new Date(data[0].date);
        const endDate = new Date(data[data.length - 1].date);

        // Calculate total issues
        const totalIssues = data.reduce((sum, item) => sum + item.count, 0);

        // Find peak and low points
        let peakPoint = data[0];
        let lowPoint = data[0];

        data.forEach((item) => {
          if (item.count > peakPoint.count) peakPoint = item;
          if (item.count < lowPoint.count) lowPoint = item;
        });

        explanation += `* Date range: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}\n`;
        explanation += `* Total issues: ${totalIssues}\n`;
        explanation += `* Peak: ${peakPoint.count} issues on ${new Date(
          peakPoint.date
        ).toLocaleDateString()}\n`;

        // Add trend analysis
        const firstCount = data[0].count;
        const lastCount = data[data.length - 1].count;
        const change = lastCount - firstCount;

        if (change > 0) {
          explanation += `\nThere has been an increase of ${change} issues over the period.`;
        } else if (change < 0) {
          explanation += `\nThere has been a decrease of ${Math.abs(
            change
          )} issues over the period.`;
        } else {
          explanation += `\nThe number of issues remained stable over the period.`;
        }

        return explanation;
      }

      case "table": {
        if (!data || !data.headers || !data.rows || data.rows.length === 0) {
          return "No data available for table analysis.";
        }

        let explanation = `This table displays ${data.rows.length} issues with the following details:\n\n`;

        // Include headers to show what information is displayed
        explanation += `* Columns: ${data.headers.join(", ")}\n`;

        // Add more details if status is included
        if (data.headers.includes("Status")) {
          // Count issues by status
          const statusCounts = {};
          data.rows.forEach((row) => {
            const status = row["Status"] || "Unknown";
            statusCounts[status] = (statusCounts[status] || 0) + 1;
          });

          explanation += "\nIssue counts by status:\n";

          Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([status, count]) => {
              explanation += `* ${status}: ${count} issues\n`;
            });
        }

        return explanation;
      }

      case "mttr": {
        if (!data || !data.count || data.count === 0) {
          return "No data available for MTTR analysis.";
        }

        let explanation = `The Mean Time To Resolution (MTTR) for the analyzed issues is:\n\n`;
        explanation += `* ${data.mttrFormatted}\n`;
        explanation += `* Based on ${data.count} resolved issues\n\n`;

        // Add insights about resolution times
        if (data.issues && data.issues.length > 0) {
          // Find fastest and slowest resolution
          const fastest = data.issues.reduce((prev, curr) =>
            prev.timeMs < curr.timeMs ? prev : curr
          );

          const slowest = data.issues.reduce((prev, curr) =>
            prev.timeMs > curr.timeMs ? prev : curr
          );

          explanation += `Fastest resolution: ${fastest.key} (${fastest.timeFormatted})\n`;
          explanation += `Slowest resolution: ${slowest.key} (${slowest.timeFormatted})\n\n`;

          // Calculate median resolution time
          const sortedTimes = [...data.issues].sort(
            (a, b) => a.timeMs - b.timeMs
          );
          const medianIndex = Math.floor(sortedTimes.length / 2);
          const medianTime =
            sortedTimes.length % 2 === 0
              ? (sortedTimes[medianIndex - 1].timeMs +
                  sortedTimes[medianIndex].timeMs) /
                2
              : sortedTimes[medianIndex].timeMs;

          explanation += `Median resolution time: ${this.formatMilliseconds(
            medianTime
          )}\n\n`;

          explanation += `The data suggests ${data.mttrFormatted} as a typical time to resolution for these issues.`;
        }

        return explanation;
      }

      default:
        return `Visualization of type "${visualType}" showing ${
          Array.isArray(data) ? data.length : "unknown"
        } data points.`;
    }
  }
}

export default new VisualizationGenerator();
