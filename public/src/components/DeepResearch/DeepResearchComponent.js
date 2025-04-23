import { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";

function DeepResearchComponent() {
  const [query, setQuery] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [progress, setProgress] = useState({ status: "", message: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [visitedUrls, setVisitedUrls] = useState([]);
  const [depthLevel, setDepthLevel] = useState(2);
  const [breadthLevel, setBreadthLevel] = useState(3);

  const eventSourceRef = useRef(null);

  // Convert markdown to HTML (simple version)
  const markdownToHtml = (markdown) => {
    if (!markdown) return "";

    // Basic markdown conversion - headings, lists, paragraphs, bold, italic
    let html = markdown
      // Replace headers
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      // Replace emphasis (bold and italic)
      .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/gim, "<em>$1</em>")
      // Replace lists
      .replace(/^\s*- (.*$)/gim, "<ul><li>$1</li></ul>")
      .replace(/^\s*\d+\. (.*$)/gim, "<ol><li>$1</li></ol>")
      // Fix the list items (combine consecutive list items)
      .replace(/<\/ul>\s*<ul>/gim, "")
      .replace(/<\/ol>\s*<ol>/gim, "")
      // Replace line breaks
      .replace(/\n/gim, "<br>");

    return html;
  };

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const startResearch = async () => {
    if (!query.trim()) return;

    setIsResearching(true);
    setProgress({ status: "starting", message: "Initiating deep research..." });
    setResult(null);
    setError(null);
    setVisitedUrls([]);

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      // Create EventSource for server-sent events
      const url = "/api/deep-research";
      // eslint-disable-next-line no-unused-vars
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          depth: depthLevel,
          breadth: breadthLevel,
          sources: ["support.zoom.us", "community.zoom.us", "zoom.us"],
        }),
      });

      // Handle server-sent events for streaming response
      const events = new EventSource(url);
      eventSourceRef.current = events;

      events.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "progress") {
          setProgress({
            status: data.status,
            message: data.message,
            details: data.details,
          });

          // Update visited URLs if available
          if (data.details && data.details.visitedUrls) {
            setVisitedUrls(data.details.visitedUrls);
          }
        } else if (data.type === "complete") {
          setResult(data.result);
          setIsResearching(false);
          events.close();
        } else if (data.type === "error") {
          setError(data.error);
          setIsResearching(false);
          events.close();
        }
      };

      events.onerror = (err) => {
        console.error("EventSource error:", err);
        setError("Connection error occurred. Please try again.");
        setIsResearching(false);
        events.close();
      };
    } catch (err) {
      console.error("Error starting research:", err);
      setError(err.message || "An error occurred while initiating research");
      setIsResearching(false);
    }
  };

  const renderProgressIndicator = () => {
    const statusMap = {
      analyzing: "Analyzing Query",
      searching: "Searching Web",
      reading: "Reading Content",
      processing: "Processing Information",
      synthesizing: "Synthesizing Findings",
      reporting: "Generating Report",
    };

    const currentStatus = statusMap[progress.status] || progress.status;

    return (
      <div className="research-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width:
                progress.status === "reporting"
                  ? "90%"
                  : progress.status === "synthesizing"
                  ? "75%"
                  : progress.status === "processing"
                  ? "60%"
                  : progress.status === "reading"
                  ? "40%"
                  : progress.status === "searching"
                  ? "20%"
                  : "10%",
            }}
          />
        </div>
        <div className="progress-status">
          <span className="status-label">{currentStatus}</span>
          <span className="status-message">{progress.message}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="deep-research-container">
      <h2>Deep Research</h2>
      <p className="research-description">
        Deep Research uses advanced AI to explore topics in depth, searching
        multiple sources and synthesizing findings into a comprehensive report.
      </p>

      <div className="research-controls">
        <div className="research-input">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a research question..."
            disabled={isResearching}
            rows={3}
          />
        </div>

        <div className="research-options">
          <div className="option-group">
            <label>Research Depth:</label>
            <select
              value={depthLevel}
              onChange={(e) => setDepthLevel(Number(e.target.value))}
              disabled={isResearching}>
              <option value={1}>Basic (Faster)</option>
              <option value={2}>Standard</option>
              <option value={3}>Deep (Slower)</option>
            </select>
          </div>

          <div className="option-group">
            <label>Research Breadth:</label>
            <select
              value={breadthLevel}
              onChange={(e) => setBreadthLevel(Number(e.target.value))}
              disabled={isResearching}>
              <option value={2}>Narrow</option>
              <option value={3}>Standard</option>
              <option value={5}>Broad (Slower)</option>
            </select>
          </div>
        </div>

        <button
          className="research-button"
          onClick={startResearch}
          disabled={isResearching || !query.trim()}>
          {isResearching ? "Researching..." : "Start Deep Research"}
        </button>
      </div>

      {isResearching && renderProgressIndicator()}

      {error && (
        <div className="research-error">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="research-results">
          <h3>Research Report</h3>
          <div
            className="research-report"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(markdownToHtml(result.report)),
            }}
          />

          {result.enhancedQueries && result.enhancedQueries.length > 0 && (
            <div className="research-queries">
              <h4>Research Directions Explored</h4>
              <ul>
                {result.enhancedQueries.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {result.visitedUrls && result.visitedUrls.length > 0 && (
            <div className="research-sources">
              <h4>Sources Consulted</h4>
              <ul>
                {result.visitedUrls.map((url, i) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noreferrer noopener">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="research-footer">
            <p>
              Research completed in {Math.round(result.executionTimeMs / 1000)}{" "}
              seconds
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeepResearchComponent;
