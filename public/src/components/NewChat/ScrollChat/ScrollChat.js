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
import CopyBtn from "../../Ui/CopyBtn";
import ShareBtn from "../../Ui/ShareBtn";
import DOMPurify from "dompurify";
import { highlightKeywords } from "../../../utils/highlightKeywords";

// Helper function to extract keywords
const extractKeywords = (text) => {
  if (!text) return [];
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "should",
    "can",
    "could",
    "may",
    "might",
    "must",
    "and",
    "but",
    "or",
    "nor",
    "for",
    "so",
    "yet",
    "in",
    "on",
    "at",
    "by",
    "from",
    "to",
    "with",
    "about",
    "as",
    "if",
    "it",
    "this",
    "that",
    "then",
    "thus",
    "of",
    "not",
  ]);
  return String(text)
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s+]/gu, " ")
    .split(" ")
    .filter((word) => word.length > 3 && !stopWords.has(word));
};

// CRITICAL FIX: Ultra-stable streaming component that never changes structure
const StreamingContent = memo(
  ({ chatItem, processMessageContent, currentLoadingText }) => {
    const contentRef = useRef(null);
    const lastContentRef = useRef("");
    const lastProcessedContentRef = useRef("");
    const isInitializedRef = useRef(false);

    // CRITICAL FIX: Initialize stable DOM structure once and never change it
    useEffect(() => {
      if (!contentRef.current || isInitializedRef.current) return;

      // Create stable DOM structure that never changes
      contentRef.current.innerHTML = `
      <div class="${styles["streaming-container"]}" data-streaming="true">
        <div class="${styles["streaming-content"]}" data-content="true">
          <div class="${styles["loading-container-gemini"]}" data-loading="true" style="display: none;">
            <div class="${styles["loading-dots"]}">
              <div class="${styles["loading-dot"]}"></div>
              <div class="${styles["loading-dot"]}"></div>
              <div class="${styles["loading-dot"]}"></div>
            </div>
            <span class="${styles["loading-text"]}"></span>
          </div>
          <div class="gemini-answer" data-answer="true" style="display: none;"></div>
        </div>
        <span class="${styles["typing-indicator"]}" data-typing="true" style="display: none;">
          <span class="${styles["typing-dot"]}"></span>
          <span class="${styles["typing-dot"]}"></span>
          <span class="${styles["typing-dot"]}"></span>
        </span>
      </div>
    `;

      isInitializedRef.current = true;
    }, []);

    // CRITICAL FIX: Update content without changing DOM structure
    useEffect(() => {
      if (!contentRef.current || !isInitializedRef.current) return;

      const container = contentRef.current.querySelector(
        '[data-streaming="true"]'
      );
      const loadingDiv = contentRef.current.querySelector(
        '[data-loading="true"]'
      );
      const loadingText = contentRef.current.querySelector(
        `.${styles["loading-text"]}`
      );
      const answerDiv = contentRef.current.querySelector(
        '[data-answer="true"]'
      );
      const typingIndicator = contentRef.current.querySelector(
        '[data-typing="true"]'
      );

      if (!container || !loadingDiv || !answerDiv || !typingIndicator) return;

      const isStreaming =
        chatItem?.isLoader === "streaming" || chatItem?.isLoader === "partial";
      const isLoading = chatItem?.isLoader === "yes";
      const content = chatItem?.gemini || "";

      // Handle loading state
      if (isLoading) {
        loadingDiv.style.display = "block";
        answerDiv.style.display = "none";
        typingIndicator.style.display = "none";

        if (loadingText) {
          loadingText.textContent = currentLoadingText;
        }
        return;
      }

      // Handle streaming or completed state
      if (content && content !== lastContentRef.current) {
        const processedContent = processMessageContent(
          content,
          chatItem?.queryKeywords,
          chatItem?.isPreformattedHTML
        );

        // Only update if processed content actually changed
        if (processedContent !== lastProcessedContentRef.current) {
          // CRITICAL FIX: Update content without changing structure
          answerDiv.innerHTML = processedContent || "Connecting...";
          lastProcessedContentRef.current = processedContent;
        }

        lastContentRef.current = content;
      }

      // CRITICAL FIX: Show/hide elements without changing structure
      if (isStreaming) {
        // Streaming state
        loadingDiv.style.display = "none";
        answerDiv.style.display = "block";
        typingIndicator.style.display = "inline-block";
      } else if (content) {
        // Completed state - just hide typing indicator, keep everything else
        loadingDiv.style.display = "none";
        answerDiv.style.display = "block";
        typingIndicator.style.display = "none";
      } else {
        // Default state
        loadingDiv.style.display = "none";
        answerDiv.style.display = "none";
        typingIndicator.style.display = "none";
      }
    }, [
      chatItem?.gemini,
      chatItem?.isLoader,
      chatItem?.queryKeywords,
      chatItem?.isPreformattedHTML,
      processMessageContent,
      currentLoadingText,
    ]);

    // Return stable container - never changes
    return (
      <div
        ref={contentRef}
        className={styles["message-content"]}
        style={{ minHeight: "20px" }} // Prevent layout shifts
      />
    );
  }
);

StreamingContent.displayName = "StreamingContent";

// CRITICAL FIX: Prevent any re-renders during streaming completion
const ChatMessage = memo(
  ({
    chatItem,
    index,
    userLogo,
    geminiLogo,
    agentLogo,
    currentLoadingText,
    processMessageContent,
    handleRelatedQuestionClick,
    historyId,
    generateUniqueKey,
    getAnswerKeywords,
  }) => {
    const uniqueKey = generateUniqueKey(chatItem, index);

    // CRITICAL FIX: Prevent expensive computations during streaming
    const answerKeywords = useMemo(() => {
      if (
        chatItem?.isLoader === "streaming" ||
        chatItem?.isLoader === "yes" ||
        chatItem?.isLoader === "partial"
      ) {
        return []; // Skip during streaming to prevent re-renders
      }
      return getAnswerKeywords(chatItem?.gemini);
    }, [chatItem?.gemini, chatItem?.isLoader, getAnswerKeywords]);

    // CRITICAL FIX: Stable icon selection
    const messageIcon = useMemo(() => {
      if (
        chatItem?.isLoader === "yes" ||
        chatItem?.isLoader === "streaming" ||
        chatItem?.isLoader === "partial"
      ) {
        return commonIcon.geminiLaoder;
      }
      return chatItem?.isSearch || chatItem?.searchType === "agent"
        ? agentLogo
        : geminiLogo;
    }, [
      chatItem?.isLoader,
      chatItem?.isSearch,
      chatItem?.searchType,
      agentLogo,
      geminiLogo,
    ]);

    const iconAlt = useMemo(() => {
      if (
        chatItem?.isLoader === "yes" ||
        chatItem?.isLoader === "streaming" ||
        chatItem?.isLoader === "partial"
      ) {
        return "Loading";
      }
      return chatItem?.isSearch || chatItem?.searchType === "agent"
        ? "Agent"
        : "AI";
    }, [chatItem?.isLoader, chatItem?.isSearch, chatItem?.searchType]);

    const iconClass = useMemo(() => {
      const baseClass = styles["ai-icon"];
      const loadingClass =
        chatItem?.isLoader === "yes" ||
        chatItem?.isLoader === "streaming" ||
        chatItem?.isLoader === "partial"
          ? styles["loading-animation"]
          : "";
      return `${baseClass} ${loadingClass}`.trim();
    }, [chatItem?.isLoader]);

    if (chatItem?.error) {
      return (
        <div className={styles["single-chat"]}>
          <div className={styles["gemini-chat-container"]}>
            <div
              className={`${styles.gemini} ${styles["message-bubble"]} ${styles["error-bubble"]}`}>
              <div className={styles["sender-info"]}>
                <img
                  src={agentLogo}
                  alt="Error"
                  className={styles["ai-icon"]}
                />
              </div>
              <div className={styles["message-content-wrapper"]}>
                <div
                  className={`${styles["message-content"]} ${styles["error-message"]}`}>
                  <p>
                    {chatItem.error?.message ||
                      chatItem.error ||
                      "An error occurred."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles["single-chat"]}>
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

        {(chatItem?.gemini ||
          chatItem?.isLoader === "yes" ||
          chatItem?.isLoader === "streaming" ||
          chatItem?.isLoader === "partial") && (
          <div className={styles["gemini-chat-container"]}>
            <div className={`${styles.gemini} ${styles["message-bubble"]}`}>
              <div className={styles["sender-info"]}>
                <img src={messageIcon} alt={iconAlt} className={iconClass} />
              </div>
              <div className={styles["message-content-wrapper"]}>
                {/* CRITICAL FIX: Ultra-stable streaming content */}
                <div
                  className={`${
                    chatItem?.isSearch ? styles["search-message-content"] : ""
                  } ${
                    chatItem?.isLoader === "streaming" ||
                    chatItem?.isLoader === "partial"
                      ? styles["partial-response"]
                      : ""
                  }`}>
                  <StreamingContent
                    chatItem={chatItem}
                    processMessageContent={processMessageContent}
                    currentLoadingText={currentLoadingText}
                  />
                </div>

                {/* CRITICAL FIX: Only render when completely done streaming */}
                {chatItem.isLoader === "no" && !chatItem.error && (
                  <>
                    {chatItem.sources && chatItem.sources.length > 0 && (
                      <div className={styles["unified-info-card"]}>
                        <div className={styles["sources-section"]}>
                          <h3 className={styles["section-title"]}>
                            Sources ({chatItem.sources.length})
                          </h3>
                          <div className={styles["sources-grid"]}>
                            {chatItem.sources.map((source, idx) => {
                              const sourceKey = source.id
                                ? `source-${source.id}`
                                : `source-${uniqueKey}-${idx}`;

                              const sourceTextForMatching = `${
                                source.title || ""
                              } ${source.snippet || ""}`.toLowerCase();
                              const isHighlighted = answerKeywords.some(
                                (keyword) =>
                                  sourceTextForMatching.includes(keyword)
                              );

                              let displayTitle =
                                source.title || "Untitled Source";
                              let domain = "";
                              if (source.url) {
                                try {
                                  domain = new URL(source.url).hostname;
                                } catch (e) {
                                  /* ignore invalid URL */
                                }
                              } else {
                                domain = source.domain || "";
                              }

                              if (
                                source.type === "jira" ||
                                source.type === "confluence"
                              ) {
                                displayTitle =
                                  source.citationLabel ||
                                  source.title ||
                                  "Untitled Link";
                              }

                              return (
                                <div
                                  key={sourceKey}
                                  className={`${styles["source-card"]} ${
                                    isHighlighted
                                      ? styles["highlighted-source"]
                                      : ""
                                  }`}>
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles["source-link"]}
                                    title={source.title || source.url}>
                                    <div className={styles["source-header"]}>
                                      {source.favicon && (
                                        <img
                                          src={source.favicon}
                                          alt=""
                                          className={styles["source-favicon"]}
                                        />
                                      )}
                                      {domain && (
                                        <div
                                          className={styles["source-domain"]}>
                                          {domain}
                                        </div>
                                      )}
                                    </div>
                                    <div
                                      className={styles["source-title"]}
                                      dangerouslySetInnerHTML={{
                                        __html: DOMPurify.sanitize(
                                          highlightKeywords(
                                            displayTitle,
                                            chatItem.queryKeywords?.join(" ") ||
                                              ""
                                          )
                                        ),
                                      }}
                                    />
                                    {(source.type === "jira" ||
                                      source.type === "confluence") && (
                                      <span
                                        className={styles["source-type-badge"]}>
                                        {source.type.toUpperCase()}
                                      </span>
                                    )}
                                    {source.snippet && (
                                      <div
                                        className={styles["source-snippet"]}
                                        dangerouslySetInnerHTML={{
                                          __html: DOMPurify.sanitize(
                                            highlightKeywords(
                                              source.snippet,
                                              chatItem.queryKeywords?.join(
                                                " "
                                              ) || ""
                                            )
                                          ),
                                        }}
                                      />
                                    )}
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {chatItem.relatedQuestions &&
                      chatItem.relatedQuestions.length > 0 && (
                        <div className={styles["unified-info-card"]}>
                          <div className={styles["related-questions-section"]}>
                            <h3 className={styles["section-title"]}>
                              Related Questions
                            </h3>
                            <div className={styles["related-questions-list"]}>
                              {chatItem.relatedQuestions.map(
                                (question, idx) => (
                                  <div
                                    key={`question-${uniqueKey}-${idx}`}
                                    className={styles["related-question-chip"]}
                                    onClick={() =>
                                      handleRelatedQuestionClick(
                                        question,
                                        chatItem.searchType,
                                        chatItem.isSearch
                                      )
                                    }>
                                    <span className={styles["question-text"]}>
                                      {question}
                                    </span>
                                    <span className={styles["question-icon"]}>
                                      +
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                    {chatItem?.gemini && (
                      <div className={styles["message-actions-toolbar"]}>
                        <CopyBtn data={chatItem?.gemini} />
                        {historyId && (
                          <ShareBtn
                            chatId={historyId}
                            messageId={chatItem?.id}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // CRITICAL FIX: Ultra-aggressive memo to prevent completion re-renders
    const prev = prevProps.chatItem;
    const next = nextProps.chatItem;

    // CRITICAL FIX: Never re-render during streaming completion transition
    const isCompletingTransition =
      (prev?.isLoader === "streaming" && next?.isLoader === "no") ||
      (prev?.isLoader === "partial" && next?.isLoader === "no");

    if (isCompletingTransition) {
      console.log(
        `[ChatMessage] Preventing completion re-render for ${next?.id}`
      );
      return true; // Prevent re-render during completion
    }

    // For active streaming, only re-render if significant content change
    if (next?.isLoader === "streaming" || next?.isLoader === "partial") {
      const contentLengthDiff = Math.abs(
        (next?.gemini?.length || 0) - (prev?.gemini?.length || 0)
      );
      return contentLengthDiff < 100; // Prevent re-render for small changes
    }

    // For other states, do minimal comparison
    return (
      prev?.id === next?.id &&
      prev?.isLoader === next?.isLoader &&
      prev?.error === next?.error &&
      (prev?.gemini?.length || 0) === (next?.gemini?.length || 0)
    );
  }
);

ChatMessage.displayName = "ChatMessage";

const ScrollChat = () => {
  const dispatch = useDispatch();
  const { historyId } = useParams();
  const chatRef = useRef(null);

  const chat = useSelector((state) => state.chat.chats);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const userImage = useSelector((state) => state.user.user.profileImg);
  const previousChat = useSelector((state) => state.chat.previousChat);
  const streamingInProgress = useSelector(
    (state) => state.chat.streamingInProgress
  );

  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [lastLoadedHistoryId, setLastLoadedHistoryId] = useState(null);

  const userLogo = userImage || commonIcon.avatarIcon;
  const geminiLogo = commonIcon.chatGeminiIcon;
  const agentLogo = commonIcon.advanceGeminiIcon;

  const loadingTexts = useMemo(
    () => [
      "Generating response...",
      "Just a moment...",
      "Processing your request...",
      "Thinking...",
      "Searching for information...",
      "Reading relevant documents...",
      "Reviewing sources...",
      "Crafting a response...",
      "Almost ready...",
      "Synthesizing information...",
      "Organizing thoughts...",
      "Connecting ideas...",
    ],
    []
  );

  const [currentLoadingText, setCurrentLoadingText] = useState(loadingTexts[0]);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Load chat histories when historyId changes
  useEffect(() => {
    if (historyId && historyId !== lastLoadedHistoryId && !isLoadingChat) {
      console.log(`[ScrollChat] Loading chat history: ${historyId}`);
      setIsLoadingChat(true);
      setLastLoadedHistoryId(historyId);
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
        })
        .catch((error) => {
          console.error(`[ScrollChat] Error loading chat: ${historyId}`, error);
          dispatch(
            chatAction.chatHistoryIdHandler({ chatHistoryId: historyId })
          );
        })
        .finally(() => {
          setIsLoadingChat(false);
        });
    } else if (
      historyId &&
      historyId === chatHistoryId &&
      chat.length === 0 &&
      !isLoadingChat
    ) {
      console.log(
        `[ScrollChat] No messages found, attempting to load: ${historyId}`
      );
      setIsLoadingChat(true);

      dispatch(getChat(historyId))
        .then((result) => {
          console.log(
            `[ScrollChat] Loaded missing messages for: ${historyId}`,
            result
          );
        })
        .catch((error) => {
          console.error(
            `[ScrollChat] Error loading missing messages: ${historyId}`,
            error
          );
        })
        .finally(() => {
          setIsLoadingChat(false);
        });
    }
  }, [
    dispatch,
    historyId,
    lastLoadedHistoryId,
    isLoadingChat,
    chatHistoryId,
    chat.length,
  ]);

  // CRITICAL FIX: Stable auto-scroll without re-renders
  useEffect(() => {
    const chatContainer = chatRef.current;
    if (chatContainer && chat.length > 0) {
      // Use setTimeout to prevent scroll during DOM updates
      setTimeout(() => {
        const { scrollTop, scrollHeight, clientHeight } = chatContainer;
        const isNearBottom = scrollHeight - scrollTop <= clientHeight + 100;

        if (isNearBottom || streamingInProgress) {
          chatContainer.scrollTop = scrollHeight;
          setShowScrollButton(false);
        }
      }, 50); // Small delay to ensure DOM is stable
    }
  }, [chat.length, streamingInProgress]);

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
      return () => {
        chatContainer.removeEventListener("scroll", handleScroll);
      };
    }
  }, [handleScroll]);

  useEffect(() => {
    const hasStandardLoadingMessage = chat.some(
      (c) =>
        c.isLoader === "yes" &&
        (c.searchType === "agent" ||
          c.searchType === "deep" ||
          c.searchType === "simple")
    );

    let intervalId;
    if (hasStandardLoadingMessage) {
      setCurrentLoadingText(loadingTexts[0]);
      intervalId = setInterval(() => {
        setCurrentLoadingText((prevText) => {
          const currentIndex = loadingTexts.indexOf(prevText);
          const nextIndex = (currentIndex + 1) % loadingTexts.length;
          return loadingTexts[nextIndex];
        });
      }, 2500);
    }

    return () => clearInterval(intervalId);
  }, [chat, loadingTexts]);

  const forceScrollToBottom = useCallback(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
      setShowScrollButton(false);
    }
  }, []);

  const processMessageContent = useCallback(
    (text, queryKeywords = [], isPreformattedHTML = false) => {
      if (text === null || typeof text === "undefined") return "";
      let processedText = String(text);

      if (
        isPreformattedHTML ||
        processedText.includes('<div class="llm-gateway-search-results">')
      ) {
        processedText = processedText
          .replace(/<div class="llm-gateway-search-results">/g, "")
          .replace(/<div class="search-answer-container">/g, "")
          .replace(
            /<\/div>\s*<div class="search-sources">/g,
            '<div class="search-sources">'
          )
          .replace(/^<div class="search-answer-container">\s*/g, "")
          .replace(/\s*<\/div>$/g, "");

        processedText = processedText
          .replace(/^# /gm, "")
          .replace(/^## /gm, "")
          .replace(/^### /gm, "")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\*([^*]+)\*/g, "<em>$1</em>")
          .replace(/```[\s\S]*?```/g, "")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        if (
          !processedText.includes("<p>") &&
          !processedText.includes("<div>")
        ) {
          processedText = processedText
            .split("\n\n")
            .filter((para) => para.trim().length > 0)
            .map((para) => `<p>${para.trim()}</p>`)
            .join("");
        }

        return DOMPurify.sanitize(processedText, {
          USE_PROFILES: { html: true },
          ALLOW_DATA_ATTR: true,
        });
      }

      // Apply markdown processing
      processedText = processedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      processedText = processedText.replace(
        /```(\w+)?\n?([\s\S]*?)```/g,
        (match, lang, code) => {
          const escapedCode = DOMPurify.sanitize(code.trim(), {
            USE_PROFILES: { html: false },
          })
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<pre><code class="language-${
            lang || ""
          }">${escapedCode}</code></pre>`;
        }
      );

      processedText = processedText.replace(
        /`([^`\n]+)`/g,
        '<code class="inline-code">$1</code>'
      );
      processedText = processedText.replace(/^### (.*$)/gim, "<h3>$1</h3>");
      processedText = processedText.replace(/^## (.*$)/gim, "<h2>$1</h2>");
      processedText = processedText.replace(/^# (.*$)/gim, "<h1>$1</h1>");
      processedText = processedText.replace(
        /^\s*[-*+]\s+(.*)/gm,
        "<li>$1</li>"
      );
      processedText = processedText.replace(
        /^\s*\d+\.\s+(.*)/gm,
        "<li>$1</li>"
      );
      processedText = processedText.replace(
        /(<li>.*?<\/li>\s*)+/gs,
        (match) => `<ul>${match}</ul>`
      );
      processedText = processedText.replace(
        /^>\s*(.*)/gm,
        "<blockquote>$1</blockquote>"
      );
      processedText = processedText.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
      );
      processedText = processedText.replace(/\*(.*?)\*/g, "<em>$1</em>");
      processedText = processedText.replace(/~~(.*?)~~/g, "<del>$1</del>");
      processedText = processedText.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      );
      processedText = processedText.replace(/\n\s*\n/g, "</p><p>");
      processedText = processedText.replace(/\n(?![^<]*>)/g, "<br>");

      if (!processedText.match(/^<(h[1-6]|p|div|ul|ol|blockquote|pre)/)) {
        processedText = `<p>${processedText}</p>`;
      }

      if (queryKeywords && queryKeywords.length > 0) {
        try {
          processedText = highlightKeywords(
            processedText,
            queryKeywords.join(" ")
          );
        } catch (highlightError) {
          console.error("Error applying keyword highlighting:", highlightError);
        }
      }

      return DOMPurify.sanitize(processedText, {
        USE_PROFILES: { html: true },
        ALLOW_DATA_ATTR: true,
      });
    },
    []
  );

  const getAnswerKeywords = useCallback(
    (geminiText) => {
      if (!geminiText) return [];
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = processMessageContent(geminiText, [], false);
      return extractKeywords(tempDiv.textContent || tempDiv.innerText || "");
    },
    [processMessageContent]
  );

  const handleRelatedQuestionClick = useCallback(
    (question, originalSearchType, originalIsSearch) => {
      console.log(`[ScrollChat] Related question clicked: ${question}`);

      if (originalIsSearch) {
        let endpoint = "/api/simplesearch";
        if (
          ["deep", "deepSearchAgent", "deepResearchAgent", "agent"].includes(
            originalSearchType
          )
        ) {
          endpoint = "/api/deepsearch";
        }
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
    },
    [dispatch, chatHistoryId, previousChat]
  );

  const generateUniqueKey = useCallback((chatItem, index) => {
    const baseId = chatItem?.id || chatItem?._id || `msg_${index}`;
    const timestamp = chatItem?.timestamp || Date.now();
    const userHash = chatItem?.user
      ? chatItem.user.substring(0, 10).replace(/\s/g, "")
      : "empty";
    const geminiHash = chatItem?.gemini
      ? chatItem.gemini.substring(0, 10).replace(/\s/g, "")
      : "empty";
    const streamingId = chatItem?.streamingId || "nostream";

    return `chat-${baseId}-${timestamp}-${userHash}-${geminiHash}-${streamingId}-${index}`;
  }, []);

  // CRITICAL FIX: Stable chat section
  const chatSection = useMemo(() => {
    return chat.map((c, chatIndex) => (
      <Fragment key={generateUniqueKey(c, chatIndex)}>
        <ChatMessage
          chatItem={c}
          index={chatIndex}
          userLogo={userLogo}
          geminiLogo={geminiLogo}
          agentLogo={agentLogo}
          currentLoadingText={currentLoadingText}
          processMessageContent={processMessageContent}
          handleRelatedQuestionClick={handleRelatedQuestionClick}
          historyId={historyId}
          generateUniqueKey={generateUniqueKey}
          getAnswerKeywords={getAnswerKeywords}
        />
      </Fragment>
    ));
  }, [
    chat,
    currentLoadingText,
    processMessageContent,
    handleRelatedQuestionClick,
    historyId,
    userLogo,
    geminiLogo,
    agentLogo,
    generateUniqueKey,
    getAnswerKeywords,
  ]);

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

      {showScrollButton && (
        <button
          className={styles["scroll-to-bottom"]}
          onClick={forceScrollToBottom}
          title="Scroll to bottom">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M7 14L12 19L17 14H7Z" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ScrollChat;
