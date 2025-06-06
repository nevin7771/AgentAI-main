// Enhanced ScrollChat.js - FIXED CONTENT PROCESSING AND SPACING
import styles from "./ScrollChat.module.css";
import { commonIcon } from "../../../asset";
import { useSelector, useDispatch } from "react-redux";
import React, {
  useRef,
  useEffect,
  Fragment,
  useState,
  useCallback,
  useMemo,
  memo,
} from "react";
import { useParams } from "react-router-dom";
import {
  getChat,
  sendChatData,
  sendDeepSearchRequest,
} from "../../../store/chat-action";
import { chatAction } from "../../../store/chat";
import DOMPurify from "dompurify";
import { highlightChatKeywords } from "../../../utils/highlightKeywords";
import apiHelper from "../../../utils/apiHelper";

// Enhanced error reporting for your backend
const reportError = async (errorType, errorData, context = {}) => {
  try {
    const errorReport = {
      type: errorType,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      error: errorData,
      context: {
        ...context,
        sessionId: localStorage.getItem("sessionId") || `session_${Date.now()}`,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
    };

    console.error(`[Error Report - ${errorType}]:`, errorReport);

    // Send to your backend
    const response = await apiHelper.apiFetch("/error-report", {
      method: "POST",
      body: JSON.stringify(errorReport),
    });

    if (response.ok) {
      console.log("✅ Error report sent to backend");
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (reportingError) {
    console.error("❌ Failed to send error report:", reportingError);
    // Store locally for later retry
    const storedErrors = JSON.parse(
      localStorage.getItem("pendingErrorReports") || "[]"
    );
    storedErrors.push({
      errorType,
      errorData,
      context,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(
      "pendingErrorReports",
      JSON.stringify(storedErrors.slice(-10))
    );
  }
};

// Enhanced feedback submission for your backend
const submitFeedback = async (feedbackData) => {
  try {
    const enhancedFeedback = {
      ...feedbackData,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: localStorage.getItem("sessionId") || `session_${Date.now()}`,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };

    console.log("📤 Submitting feedback:", enhancedFeedback.feedbackType);

    const response = await apiHelper.apiFetch("/feedback", {
      method: "POST",
      body: JSON.stringify(enhancedFeedback),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("✅ Feedback submitted successfully:", result);
    return { success: true, result };
  } catch (error) {
    console.error("❌ Failed to submit feedback:", error);
    await reportError("feedback_submission_failed", error, { feedbackData });
    return { success: false, error: error.message };
  }
};

// FIXED: Simplified Message Actions - No Retry, Simple Buttons
const SimplifiedMessageActions = memo(
  ({ chatItem, messageId, chatHistoryId }) => {
    const [copyState, setCopyState] = useState("idle");
    const [feedbackState, setFeedbackState] = useState(null);

    const handleCopy = useCallback(async () => {
      setCopyState("copying");
      try {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = chatItem?.gemini || "";
        const textContent = tempDiv.textContent || tempDiv.innerText || "";

        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textContent);
        } else {
          // Fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = textContent;
          textArea.style.position = "fixed";
          textArea.style.left = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          textArea.remove();
        }

        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 3000);

        // Submit feedback to your backend
        await submitFeedback({
          type: "copy_action",
          feedbackType: "copy",
          messageId,
          chatHistoryId,
          contentLength: textContent.length,
          success: true,
        });
      } catch (error) {
        setCopyState("error");
        setTimeout(() => setCopyState("idle"), 3000);
        await reportError("copy_failed", error, { messageId, chatHistoryId });
      }
    }, [chatItem?.gemini, messageId, chatHistoryId]);

    const handleFeedback = useCallback(
      async (type) => {
        if (feedbackState === "submitting") return;

        setFeedbackState("submitting");
        try {
          const result = await submitFeedback({
            type: "message_feedback",
            feedbackType: type,
            messageId,
            chatHistoryId,
            messageContent: chatItem?.gemini || "",
            userQuery: chatItem?.user || "",
            searchType: chatItem?.searchType,
            isSearch: chatItem?.isSearch,
            sources: chatItem?.sources || [],
            relatedQuestions: chatItem?.relatedQuestions || [],
          });

          if (result.success) {
            setFeedbackState(type);
            setTimeout(() => setFeedbackState(null), 5000);

            // Show success message
            const messages = {
              positive: "👍 Thanks for your positive feedback!",
              negative: "👎 Thanks for your feedback. We'll work to improve!",
            };
            console.log(messages[type]);
          } else {
            throw new Error(result.error);
          }
        } catch (error) {
          setFeedbackState(null);
          await reportError("feedback_failed", error, {
            messageId,
            chatHistoryId,
            feedbackType: type,
          });
        }
      },
      [chatItem, messageId, chatHistoryId, feedbackState]
    );

    const getCopyText = () => {
      switch (copyState) {
        case "copying":
          return "📋 Copying...";
        case "copied":
          return "✅ Copied!";
        case "error":
          return "❌ Failed";
        default:
          return "📋 Copy";
      }
    };

    const getFeedbackText = (type) => {
      if (feedbackState === "submitting") return "⏳";
      if (feedbackState === type)
        return type === "positive" ? "👍 Thanks!" : "👎 Noted";
      return type === "positive" ? "👍" : "👎";
    };

    return (
      <div className={styles["simple-actions-toolbar"]}>
        <button
          onClick={handleCopy}
          className={styles["simple-action-btn"]}
          disabled={copyState === "copying"}
          title="Copy response">
          {getCopyText()}
        </button>

        <button
          onClick={() => handleFeedback("positive")}
          className={`${styles["simple-action-btn"]} ${
            feedbackState === "positive" ? styles["feedback-given"] : ""
          }`}
          disabled={feedbackState === "submitting"}
          title="Good response">
          {getFeedbackText("positive")}
        </button>

        <button
          onClick={() => handleFeedback("negative")}
          className={`${styles["simple-action-btn"]} ${
            feedbackState === "negative" ? styles["feedback-given"] : ""
          }`}
          disabled={feedbackState === "submitting"}
          title="Poor response">
          {getFeedbackText("negative")}
        </button>
      </div>
    );
  }
);

SimplifiedMessageActions.displayName = "SimplifiedMessageActions";

// FIXED: Optimized streaming content with proper processing detection
const OptimizedStreamingContent = memo(
  ({ chatItem, processMessageContent, currentLoadingText }) => {
    const contentRef = useRef(null);
    const lastContentRef = useRef("");
    const lastProcessedRef = useRef("");

    useEffect(() => {
      if (!contentRef.current) return;

      const content = chatItem?.gemini || "";
      const isStreaming = chatItem?.isLoader === "streaming";
      const isLoading = chatItem?.isLoader === "yes";
      const isComplete = chatItem?.isLoader === "no" && content;

      if (content === lastContentRef.current && !isComplete) {
        return;
      }

      lastContentRef.current = content;

      if (isLoading) {
        const loadingText = currentLoadingText || "Loading...";
        contentRef.current.innerHTML = `<p class="${styles["loading-text"]}">${loadingText}</p>`;
      } else if (isStreaming || isComplete) {
        // CRITICAL FIX: Check if content is already HTML (from Jira agent)
        const isPreformattedHTML =
          chatItem?.isPreformattedHTML === true ||
          chatItem?.searchType === "agent" ||
          content.includes("<h1>") ||
          content.includes("<h2>") ||
          content.includes("<h3>") ||
          content.includes("<p>") ||
          content.includes("<strong>");

        let processedContent;
        if (isPreformattedHTML) {
          // Content is already HTML - just sanitize and highlight
          processedContent = content;
          if (chatItem?.queryKeywords && chatItem.queryKeywords.length > 0) {
            processedContent = highlightChatKeywords(
              processedContent,
              chatItem.queryKeywords
            );
          }
          processedContent = DOMPurify.sanitize(processedContent, {
            USE_PROFILES: { html: true },
          });
        } else {
          // Content is markdown - process normally
          processedContent = processMessageContent(
            content,
            chatItem?.queryKeywords || [],
            false
          );
        }

        if (processedContent !== lastProcessedRef.current) {
          lastProcessedRef.current = processedContent;
          contentRef.current.innerHTML = processedContent;
        }
      }
    }, [
      chatItem?.gemini,
      chatItem?.isLoader,
      chatItem?.queryKeywords,
      chatItem?.isPreformattedHTML,
      chatItem?.searchType,
      currentLoadingText,
      processMessageContent,
    ]);

    return <div ref={contentRef} className={styles["message-content"]} />;
  }
);

OptimizedStreamingContent.displayName = "OptimizedStreamingContent";

// AI Disclaimer with sky blue theme
const AIDisclaimer = memo(() => {
  const [isVisible, setIsVisible] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    localStorage.setItem("disclaimerDismissed", "true");
  }, []);

  useEffect(() => {
    const dismissed = localStorage.getItem("disclaimerDismissed");
    if (dismissed === "true") {
      setIsVisible(false);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={styles["ai-disclaimer"]}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: "rgba(227, 242, 253, 0.95)", // Sky blue background
        backdropFilter: "blur(10px)",
        border: "1px solid #2196f3",
        borderRadius: "12px",
        padding: "12px 16px",
        maxWidth: "320px",
        boxShadow: "0 4px 12px rgba(33, 150, 243, 0.2)",
        zIndex: 1000,
        fontFamily: "'Google Sans', sans-serif",
        transition: "all 0.3s ease",
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: "#1976d2", flexShrink: 0, marginTop: "2px" }}>
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M12 6v6l4 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
        <div style={{ flex: 1 }}>
          <span
            style={{ fontSize: "13px", color: "#0d47a1", lineHeight: "1.4" }}>
            AI responses may contain inaccuracies. Please verify important
            information.
          </span>
          {isHovered && (
            <button
              onClick={handleDismiss}
              style={{
                marginLeft: "8px",
                background: "none",
                border: "none",
                color: "#1976d2",
                cursor: "pointer",
                fontSize: "12px",
                textDecoration: "underline",
              }}
              title="Dismiss">
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

AIDisclaimer.displayName = "AIDisclaimer";
// UPDATED: processJiraContent function in ScrollChat.js

const processJiraContent = (text, queryKeywords = []) => {
  if (!text) return "";

  let processedText = String(text);

  try {
    console.log("[processJiraContent] Processing Jira content");

    // STEP 1: Remove unwanted header patterns and clean HTML attributes
    processedText = processedText
      .replace(/# 🐛 Bug Report - ZOOM Project\s*\n*/g, "")
      .replace(/\*\*Query:\*\*\s*\n*[^\n]*\n*/g, "")
      .replace(/\*\*Project:\*\*\s*\n*ZOOM\s*\n*/g, "")
      .replace(/\*\*Bug Type:\*\*\s*\n*[^\n]*\n*/g, "")
      .replace(/\*\*Search Terms:\*\*\s*\n*[^\n]*\n*/g, "")
      .replace(/\*\*Found:\*\*\s*\n*[^\n]*\n*/g, "")
      // CRITICAL FIX: Remove any stray HTML attributes
      .replace(/"\s*target="_blank"[^>]*>/g, "")
      .replace(/rel="noopener noreferrer"[^>]*>/g, "")
      .replace(/style="[^"]*"[^>]*>/g, "");

    // STEP 2: Fix malformed HTML/markdown patterns FIRST
    processedText = processedText.replace(
      /\*\*([^*"]+)"[^>]*>([^*]+)\*\*:\s*(.*)/g,
      (match, ticketStart, ticketEnd, description) => {
        // Use the cleaner ticket ID
        const ticketId = ticketEnd.trim();
        const cleanDescription = description.trim();
        return `**${ticketId}**: ${cleanDescription}`;
      }
    );

    // STEP 3: Process headers
    processedText = processedText
      .replace(
        /^#{1,3}\s*🚨\s*(.*$)/gim,
        '<h2 class="jira-alert-heading">🚨 $1</h2>'
      )
      .replace(
        /^#{1,3}\s*✨\s*(.*$)/gim,
        '<h2 class="jira-success-heading">✨ $1</h2>'
      )
      .replace(/^#{1,3}\s*(.*$)/gim, '<h3 class="jira-clean-heading">$1</h3>');

    // STEP 4: Handle numbered bug items
    processedText = processedText.replace(
      /^#{1,3}\s*(\d+)\.\s*\*\*([^*]+)\*\*:\s*(.*$)/gim,
      (match, number, ticketId, description) => {
        const cleanDescription = description
          .replace(/target="_blank"[^>]*>/g, "")
          .replace(/rel="noopener noreferrer"[^>]*>/g, "")
          .replace(/style="[^"]*"/g, "")
          .replace(/<[^>]*>/g, "")
          .trim();

        return `<div class="jira-bug-item">
          <span class="jira-bug-number">${number}.</span> 
          <span class="jira-ticket-id">${ticketId}</span>: 
          <span class="jira-bug-description">${cleanDescription}</span>
        </div>`;
      }
    );

    // STEP 5: Handle key-value pairs
    processedText = processedText.replace(
      /^-\s*\n*\s*([A-Za-z\s]+):\s*([^\n]*)/gm,
      '<div class="jira-info-row"><span class="jira-key">$1:</span> <span class="jira-value">$2</span></div>'
    );

    // STEP 6: Handle remaining bold text
    processedText = processedText.replace(
      /\*\*([^*]+)\*\*/g,
      '<strong class="jira-bold">$1</strong>'
    );

    // STEP 7: ENHANCED ticket ID handling with actual links
    const jiraBaseUrl =
      process.env.REACT_APP_JIRA_URL || "https://zoom.atlassian.net";
    processedText = processedText.replace(
      /\b([A-Z]+-\d+)\b/g,
      (match, ticketId) => {
        return `<a href="${jiraBaseUrl}/browse/${ticketId}" target="_blank" rel="noopener noreferrer" class="jira-ticket-link">${ticketId}</a>`;
      }
    );

    // STEP 8: Clean up whitespace and convert to HTML
    processedText = processedText
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .replace(/^\s*\n+/g, "")
      .replace(/\n+\s*$/g, "")
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, '</p><p class="jira-paragraph">')
      .replace(/\n/g, "<br>");

    // STEP 9: Handle emojis
    processedText = processedText.replace(
      /(🐛|🚨|📊|✅|❌|⚠️|📝|🔍|📈|📉|✨)/g,
      '<span class="jira-emoji">$1</span>'
    );

    // STEP 10: Wrap if needed
    if (processedText && !processedText.match(/^<(h[1-6]|p|div)/)) {
      processedText = `<p class="jira-paragraph">${processedText}</p>`;
    }

    // STEP 11: Clean up malformed HTML
    processedText = processedText
      .replace(/<p class="jira-paragraph">\s*<\/p>/g, "")
      .replace(/<p class="jira-paragraph">\s*<h/g, "<h")
      .replace(/<\/h([1-6])>\s*<\/p>/g, "</h$1>")
      .replace(/<p class="jira-paragraph">\s*<div/g, "<div")
      .replace(/<\/div>\s*<\/p>/g, "</div>")
      .trim();

    // STEP 12: Apply keyword highlighting
    if (
      queryKeywords &&
      queryKeywords.length > 0 &&
      typeof highlightChatKeywords === "function"
    ) {
      processedText = highlightChatKeywords(processedText, queryKeywords);
    }

    // STEP 13: Sanitize
    if (typeof DOMPurify !== "undefined") {
      return DOMPurify.sanitize(processedText, {
        USE_PROFILES: { html: true },
        ADD_TAGS: [
          "strong",
          "em",
          "code",
          "pre",
          "h1",
          "h2",
          "h3",
          "p",
          "ul",
          "ol",
          "li",
          "span",
          "br",
          "div",
          "a",
        ],
        ADD_ATTR: ["class", "href", "target", "rel"],
      });
    }

    return processedText;
  } catch (error) {
    console.error("Error processing Jira content:", error);
    return text;
  }
}; // Main ScrollChat component
const ScrollChat = () => {
  const dispatch = useDispatch();
  const { historyId } = useParams();
  const chatRef = useRef(null);

  const chat = useSelector((state) => state.chat.chats);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const userImage = useSelector((state) => state.user.user.profileImg);
  const previousChat = useSelector((state) => state.chat.previousChat);

  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [lastLoadedHistoryId, setLastLoadedHistoryId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const userLogo = userImage || commonIcon.avatarIcon;
  const geminiLogo = commonIcon.chatGeminiIcon;
  const agentLogo = commonIcon.advanceGeminiIcon;

  const loadingTexts = useMemo(
    () => [
      "Generating response...",
      "Processing your request...",
      "Just a moment...",
      "Thinking...",
    ],
    []
  );

  const [currentLoadingText, setCurrentLoadingText] = useState(loadingTexts[0]);

  // FIXED: Enhanced message processing - no double processing
  const processMessageContent = useCallback(
    (text, queryKeywords = [], isPreformattedHTML = false) => {
      if (!text) return "";

      try {
        // ENHANCED: Better Jira content detection
        const isJiraContent =
          text.includes("🐛") ||
          text.includes("🚨") ||
          text.includes("Bug Report") ||
          text.includes("ZOOM Project") ||
          text.includes("**Query:**") ||
          text.includes("**Project:**") ||
          text.includes("**Bug Type:**") ||
          text.includes("**Found:**") ||
          text.includes("Active Bug") ||
          text.includes("ZOOM-") ||
          /\*\*[A-Za-z\s]+:\*\*/.test(text) ||
          /# 🐛/.test(text) ||
          /# 🚨/.test(text) ||
          /## \d+\. \*\*ZOOM-/.test(text);

        // Use Jira processor for detected Jira content
        if (isJiraContent) {
          console.log(
            "[processMessageContent] Using Jira processor for detected content"
          );
          return processJiraContent(text, queryKeywords);
        }

        // Your existing processing for non-Jira content...
        let processedText = String(text);

        if (isPreformattedHTML) {
          if (queryKeywords && queryKeywords.length > 0) {
            processedText = highlightChatKeywords(processedText, queryKeywords);
          }
          return DOMPurify.sanitize(processedText, {
            USE_PROFILES: { html: true },
          });
        }

        // Regular markdown processing (keep your existing logic)
        processedText = processedText
          .replace(/^### (.*$)/gim, "<h3 class='content-heading-3'>$1</h3>")
          .replace(/^## (.*$)/gim, "<h2 class='content-heading-2'>$1</h2>")
          .replace(/^# (.*$)/gim, "<h1 class='content-heading-1'>$1</h1>")
          .replace(/\*\*(.*?)\*\*/g, "<strong class='content-bold'>$1</strong>")
          .replace(/\*(.*?)\*/g, "<em class='content-italic'>$1</em>")
          .replace(
            /```([\s\S]*?)```/g,
            "<pre class='content-code-block'><code>$1</code></pre>"
          )
          .replace(/`([^`]+)`/g, "<code class='content-inline-code'>$1</code>")
          .replace(/^\s*[-*] (.+)$/gm, "<li class='content-list-item'>$1</li>")
          .replace(
            /^\s*\d+\. (.+)$/gm,
            "<li class='content-numbered-item'>$1</li>"
          )
          .replace(
            /(<li class='content-list-item'>.*?<\/li>[\s\n]*)+/gs,
            "<ul class='content-list'>$&</ul>"
          )
          .replace(
            /(<li class='content-numbered-item'>.*?<\/li>[\s\n]*)+/gs,
            "<ol class='content-numbered-list'>$&</ol>"
          )
          .replace(/<\/ul>[\s\n]*<ul>/g, "")
          .replace(/<\/ol>[\s\n]*<ol>/g, "")
          .replace(/\n\s*\n/g, "</p><p class='content-paragraph'>")
          .replace(/\n(?![^<]*>)/g, "<br>");

        if (!processedText.match(/^<(h[1-6]|p|div|ul|ol|blockquote|pre)/)) {
          processedText = `<p class='content-paragraph'>${processedText}</p>`;
        }

        if (queryKeywords && queryKeywords.length > 0) {
          processedText = highlightChatKeywords(processedText, queryKeywords);
        }

        return DOMPurify.sanitize(processedText, {
          USE_PROFILES: { html: true },
        });
      } catch (error) {
        console.error("Error processing message content:", error);
        return text;
      }
    },
    []
  );

  // STEP 3: Fix OptimizedStreamingContent to use the updated processor
  // Find your OptimizedStreamingContent component and make sure it uses processMessageContent:

  const OptimizedStreamingContent = memo(
    ({ chatItem, processMessageContent, currentLoadingText }) => {
      const contentRef = useRef(null);
      const lastContentRef = useRef("");
      const lastProcessedRef = useRef("");

      useEffect(() => {
        if (!contentRef.current) return;

        const content = chatItem?.gemini || "";
        const isStreaming = chatItem?.isLoader === "streaming";
        const isLoading = chatItem?.isLoader === "yes";
        const isComplete = chatItem?.isLoader === "no" && content;

        if (content === lastContentRef.current && !isComplete) {
          return;
        }

        lastContentRef.current = content;

        if (isLoading) {
          const loadingText = currentLoadingText || "Loading...";
          contentRef.current.innerHTML = `<p class="${styles["loading-text"]}">${loadingText}</p>`;
        } else if (isStreaming || isComplete) {
          // CRITICAL FIX: Always use processMessageContent for Jira detection
          console.log(
            "[OptimizedStreamingContent] Processing content:",
            content.substring(0, 100)
          );

          let processedContent = processMessageContent(
            content,
            chatItem?.queryKeywords || [],
            chatItem?.isPreformattedHTML || false // Let the processor decide
          );

          if (processedContent !== lastProcessedRef.current) {
            lastProcessedRef.current = processedContent;
            contentRef.current.innerHTML = processedContent;
            console.log(
              "[OptimizedStreamingContent] Updated content:",
              processedContent.substring(0, 200)
            );
          }
        }
      }, [
        chatItem?.gemini,
        chatItem?.isLoader,
        chatItem?.queryKeywords,
        chatItem?.isPreformattedHTML,
        chatItem?.searchType,
        currentLoadingText,
        processMessageContent,
      ]);

      return <div ref={contentRef} className={styles["message-content"]} />;
    }
  );

  // Chat loading with error reporting
  useEffect(() => {
    if (historyId && historyId !== lastLoadedHistoryId && !isLoadingChat) {
      console.log(`[ScrollChat] Loading chat history: ${historyId}`);
      setIsLoadingChat(true);
      setLastLoadedHistoryId(historyId);
      setLoadError(null);

      dispatch(chatAction.getChatHandler({ chats: [] }));

      dispatch(getChat(historyId))
        .then((result) => {
          console.log(
            `[ScrollChat] Successfully loaded chat: ${historyId}`,
            result
          );
          dispatch(
            chatAction.chatHistoryIdHandler({ chatHistoryId: historyId })
          );
          setLoadError(null);
        })
        .catch(async (error) => {
          console.error(`[ScrollChat] Error loading chat: ${historyId}`, error);
          setLoadError(error.message || "Failed to load conversation");

          if (typeof reportError === "function") {
            await reportError("chat_load_failed", error, {
              historyId,
              chatHistoryId,
              userAgent: navigator.userAgent,
            });
          }
        })
        .finally(() => {
          setIsLoadingChat(false);
        });
    }
  }, [dispatch, historyId, lastLoadedHistoryId, isLoadingChat, chatHistoryId]);

  // Auto-scroll and other effects...
  // PERFECT: Auto-scroll only when user asks new questions
  const prevUserQuestionCount = useRef(0);

  useEffect(() => {
    const chatContainer = chatRef.current;
    if (!chatContainer) return;

    // Count user questions in the chat
    const userQuestions = chat.filter(
      (message) => message?.user && message.user.trim()
    );
    const currentUserQuestionCount = userQuestions.length;

    // Scroll when user asks a new question
    if (currentUserQuestionCount > prevUserQuestionCount.current) {
      console.log(
        `📜 User asked question #${currentUserQuestionCount} - scrolling`
      );

      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 100);
    }

    prevUserQuestionCount.current = currentUserQuestionCount;
  }, [chat]);

  // Also scroll when loading existing conversation
  useEffect(() => {
    const chatContainer = chatRef.current;
    if (chatContainer && chat.length > 0 && !isLoadingChat) {
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 200);
    }
  }, [historyId, chat.length]); // When conversation loads

  // Loading text rotation
  useEffect(() => {
    const hasLoading = chat.some((c) => c.isLoader === "yes");
    let intervalId;
    if (hasLoading) {
      intervalId = setInterval(() => {
        setCurrentLoadingText((prevText) => {
          const currentIndex = loadingTexts.indexOf(prevText);
          const nextIndex = (currentIndex + 1) % loadingTexts.length;
          return loadingTexts[nextIndex];
        });
      }, 2000);
    }
    return () => clearInterval(intervalId);
  }, [chat, loadingTexts]);

  // Scroll button functionality
  const handleScroll = useCallback(() => {
    const chatContainer = chatRef.current;
    if (chatContainer) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainer;
      const isAtBottom = scrollHeight - scrollTop <= clientHeight + 50;
      setShowScrollButton(!isAtBottom);
    }
  }, []);

  useEffect(() => {
    const chatContainer = chatRef.current;
    if (chatContainer) {
      chatContainer.addEventListener("scroll", handleScroll);
      return () => chatContainer.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  const forceScrollToBottom = useCallback(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
      setShowScrollButton(false);
    }
  }, []);

  // Enhanced chat rendering with simplified actions
  const chatSection = useMemo(() => {
    return chat.map((chatItem, chatIndex) => {
      const uniqueKey = `chat-${chatItem?.id || chatIndex}-${
        chatItem?.timestamp || Date.now()
      }`;

      return (
        <Fragment key={uniqueKey}>
          <div className={styles["single-chat"]}>
            {/* User Message */}
            {chatItem?.user && (
              <div className={styles["user-chat-container"]}>
                <div className={`${styles.user} ${styles["message-bubble"]}`}>
                  <div className={styles["sender-info"]}>
                    <img src={userLogo} alt="User" />
                  </div>
                  <div className={styles["message-content"]}>
                    <div className={styles["user-text"]}>{chatItem.user}</div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Message */}
            {(chatItem?.gemini ||
              chatItem?.isLoader === "yes" ||
              chatItem?.isLoader === "streaming") && (
              <div className={styles["gemini-chat-container"]}>
                <div className={`${styles.gemini} ${styles["message-bubble"]}`}>
                  <div className={styles["sender-info"]}>
                    <img
                      src={
                        chatItem?.isLoader === "yes" ||
                        chatItem?.isLoader === "streaming"
                          ? commonIcon.geminiLaoder
                          : chatItem?.isSearch ||
                            chatItem?.searchType === "agent"
                          ? agentLogo
                          : geminiLogo
                      }
                      alt="AI"
                      className={`${styles["ai-icon"]} ${
                        chatItem?.isLoader === "yes" ||
                        chatItem?.isLoader === "streaming"
                          ? styles["loading-animation"]
                          : ""
                      }`}
                    />
                  </div>
                  <div className={styles["message-content-wrapper"]}>
                    <OptimizedStreamingContent
                      chatItem={chatItem}
                      processMessageContent={processMessageContent}
                      currentLoadingText={currentLoadingText}
                    />

                    {/* Sources and Related Questions */}
                    {chatItem.isLoader === "no" && !chatItem.error && (
                      <>
                        {chatItem.sources && chatItem.sources.length > 0 && (
                          <div className={styles["unified-info-card"]}>
                            <div className={styles["sources-section"]}>
                              <h3 className={styles["section-title"]}>
                                Sources ({chatItem.sources.length})
                              </h3>
                              <div className={styles["sources-grid"]}>
                                {chatItem.sources.map((source, idx) => (
                                  <div
                                    key={`source-${idx}`}
                                    className={styles["source-card"]}>
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={styles["source-link"]}>
                                      <div className={styles["source-header"]}>
                                        {source.favicon && (
                                          <img
                                            src={source.favicon}
                                            alt=""
                                            className={styles["source-favicon"]}
                                          />
                                        )}
                                        <div
                                          className={styles["source-domain"]}>
                                          {source.domain ||
                                            new URL(source.url || "").hostname}
                                        </div>
                                      </div>
                                      <div className={styles["source-title"]}>
                                        {source.title || "Untitled Source"}
                                      </div>
                                      {source.snippet && (
                                        <div
                                          className={styles["source-snippet"]}>
                                          {source.snippet}
                                        </div>
                                      )}
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {chatItem.relatedQuestions &&
                          chatItem.relatedQuestions.length > 0 && (
                            <div className={styles["unified-info-card"]}>
                              <div
                                className={styles["related-questions-section"]}>
                                <h3 className={styles["section-title"]}>
                                  Related Questions
                                </h3>
                                <div
                                  className={styles["related-questions-list"]}>
                                  {chatItem.relatedQuestions.map(
                                    (question, idx) => (
                                      <div
                                        key={`question-${idx}`}
                                        className={
                                          styles["related-question-chip"]
                                        }
                                        onClick={() => {
                                          if (chatItem.isSearch) {
                                            const endpoint =
                                              chatItem.searchType === "deep"
                                                ? "/api/deepsearch"
                                                : "/api/simplesearch";
                                            dispatch(
                                              sendDeepSearchRequest({
                                                query: question,
                                                endpoint: endpoint,
                                                chatHistoryId: chatHistoryId,
                                              })
                                            );
                                          } else {
                                            dispatch(
                                              sendChatData({
                                                user: question,
                                                previousChat: previousChat,
                                                chatHistoryId: chatHistoryId,
                                              })
                                            );
                                          }
                                        }}>
                                        <span
                                          className={styles["question-text"]}>
                                          {question}
                                        </span>
                                        <span
                                          className={styles["question-icon"]}>
                                          +
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                        {/* FIXED: Simplified Message Actions */}
                        {chatItem?.gemini && (
                          <SimplifiedMessageActions
                            chatItem={chatItem}
                            messageId={chatItem?.id || uniqueKey}
                            chatHistoryId={historyId}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Fragment>
      );
    });
  }, [
    chat,
    currentLoadingText,
    processMessageContent,
    userLogo,
    geminiLogo,
    agentLogo,
    historyId,
    dispatch,
    chatHistoryId,
    previousChat,
  ]);

  // Loading and error states
  if (isLoadingChat && chat.length === 0) {
    return (
      <div className={styles["scroll-chat-container"]}>
        <div className={styles["scroll-chat-main"]}>
          <div className={styles["loading-container"]}>
            <img
              src={commonIcon.geminiLaoder}
              alt="Loading"
              className={styles["loading-animation"]}
            />
            <p>Loading conversation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError && chat.length === 0) {
    return (
      <div className={styles["scroll-chat-container"]}>
        <div className={styles["scroll-chat-main"]}>
          <div className={styles["error-container"]}>
            <div className={styles["error-content"]}>
              <img
                src={commonIcon.advanceGeminiIcon}
                alt="Error"
                style={{ opacity: 0.5, width: 48, height: 48 }}
              />
              <h3 style={{ color: "#ea4335", margin: "16px 0 8px 0" }}>
                Failed to Load Conversation
              </h3>
              <p style={{ color: "#5f6368", margin: "8px 0" }}>{loadError}</p>
              <button
                onClick={() => {
                  setLastLoadedHistoryId(null);
                  setLoadError(null);
                }}
                style={{
                  background: "#1a73e8",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 20px",
                  cursor: "pointer",
                  marginTop: "16px",
                }}>
                Retry Loading
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles["scroll-chat-container"]}>
      <div className={styles["scroll-chat-main"]} ref={chatRef}>
        {chatSection.length === 0 ? (
          <div className={styles["empty-chat"]}>
            <div className={styles["empty-chat-content"]}>
              <img
                src={commonIcon.chatGeminiIcon}
                alt="Chat"
                className={styles["empty-chat-icon"]}
              />
              <p>Start a conversation by typing a message below.</p>
            </div>
          </div>
        ) : (
          chatSection
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          className={styles["scroll-to-bottom"]}
          onClick={forceScrollToBottom}
          title="Scroll to bottom"
          style={{
            background: "#e3f2fd",
            borderColor: "#2196f3",
            color: "#1976d2",
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M7 14L12 19L17 14H7Z" fill="currentColor" />
          </svg>
        </button>
      )}

      {/* AI Disclaimer with sky blue theme */}
      <AIDisclaimer />
    </div>
  );
};

export default ScrollChat;
