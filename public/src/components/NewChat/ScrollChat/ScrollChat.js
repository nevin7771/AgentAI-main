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

  const userLogo = userImage || commonIcon.avatarIcon;
  const geminiLogo = commonIcon.chatGeminiIcon;
  const agentLogo = commonIcon.advanceGeminiIcon;

  // Enhanced loading text variations - moved outside of useEffect to fix dependency issue
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

  // CRITICAL FIX: Load ALL chat histories when historyId changes
  useEffect(() => {
    // Only load if we have a historyId and it's different from the last loaded one
    if (historyId && historyId !== lastLoadedHistoryId && !isLoadingChat) {
      console.log(`[ScrollChat] Loading chat history: ${historyId}`);

      setIsLoadingChat(true);
      setLastLoadedHistoryId(historyId);

      // Clear existing chat first to prevent mixing
      dispatch(chatAction.getChatHandler({ chats: [] }));

      // Load the chat history
      dispatch(getChat(historyId))
        .then((result) => {
          console.log(
            `[ScrollChat] Successfully loaded chat: ${historyId}`,
            result
          );
          // Update the chatHistoryId in Redux store
          dispatch(
            chatAction.chatHistoryIdHandler({ chatHistoryId: historyId })
          );
        })
        .catch((error) => {
          console.error(`[ScrollChat] Error loading chat: ${historyId}`, error);
          // On error, still set the history ID to prevent infinite reload attempts
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
      // If we have a historyId but no chat messages, try to load them
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

  // Enhanced auto-scroll effect
  useEffect(() => {
    const chatContainer = chatRef.current;
    if (chatContainer && chat.length > 0) {
      const scrollToBottom = () => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      };

      requestAnimationFrame(() => {
        scrollToBottom();
        setShowScrollButton(false);
      });
    }
  }, [chat.length, chat]);

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

  // Effect for rotating loading texts - fixed dependency
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

  // Force scroll to bottom when scroll button is clicked
  const forceScrollToBottom = useCallback(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
      setShowScrollButton(false);
    }
  }, []);

  // Enhanced message content processing with proper HTML cleaning
  const processMessageContent = useCallback(
    (text, queryKeywords = [], isPreformattedHTML = false) => {
      if (text === null || typeof text === "undefined") return "";
      let processedText = String(text);

      // Clean up HTML artifacts first
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

      // Apply markdown processing for non-preformatted content
      processedText = processedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      // Code blocks
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

      // Inline code
      processedText = processedText.replace(
        /`([^`\n]+)`/g,
        '<code class="inline-code">$1</code>'
      );

      // Headers
      processedText = processedText.replace(/^### (.*$)/gim, "<h3>$1</h3>");
      processedText = processedText.replace(/^## (.*$)/gim, "<h2>$1</h2>");
      processedText = processedText.replace(/^# (.*$)/gim, "<h1>$1</h1>");

      // Lists
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

      // Blockquotes
      processedText = processedText.replace(
        /^>\s*(.*)/gm,
        "<blockquote>$1</blockquote>"
      );

      // Bold, Italic, Strikethrough
      processedText = processedText.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
      );
      processedText = processedText.replace(/\*(.*?)\*/g, "<em>$1</em>");
      processedText = processedText.replace(/~~(.*?)~~/g, "<del>$1</del>");

      // Links
      processedText = processedText.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      );

      // Convert newlines to HTML
      processedText = processedText.replace(/\n\s*\n/g, "</p><p>");
      processedText = processedText.replace(/\n(?![^<]*>)/g, "<br>");

      // Wrap in paragraph tags if needed
      if (!processedText.match(/^<(h[1-6]|p|div|ul|ol|blockquote|pre)/)) {
        processedText = `<p>${processedText}</p>`;
      }

      // Apply keyword highlighting
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

  // Enhanced related question click with conversation context
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

  // Enhanced unique key generation to prevent duplicates
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

  // CRITICAL FIX: Move useMemo BEFORE any conditional returns
  const chatSection = useMemo(() => {
    return chat.map((c, chatIndex) => {
      const uniqueKey = generateUniqueKey(c, chatIndex);
      const answerKeywords = getAnswerKeywords(c?.gemini);

      return (
        <Fragment key={uniqueKey}>
          {!c?.error ? (
            <div className={styles["single-chat"]}>
              {c?.user && (
                <div className={styles["user-chat-container"]}>
                  <div className={`${styles.user} ${styles["message-bubble"]}`}>
                    <div className={styles["sender-info"]}>
                      <img src={userLogo} alt="User" />
                    </div>
                    <div className={styles["message-content"]}>
                      <div className={styles["user-text"]}>{c.user}</div>
                    </div>
                  </div>
                </div>
              )}

              {(c?.gemini ||
                c?.isLoader === "yes" ||
                c?.isLoader === "streaming" ||
                c?.isLoader === "partial") && (
                <div className={styles["gemini-chat-container"]}>
                  <div
                    className={`${styles.gemini} ${styles["message-bubble"]}`}>
                    <div className={styles["sender-info"]}>
                      <img
                        src={
                          c?.isLoader === "yes" ||
                          c?.isLoader === "streaming" ||
                          c?.isLoader === "partial"
                            ? commonIcon.geminiLaoder
                            : c?.isSearch || c?.searchType === "agent"
                            ? agentLogo
                            : geminiLogo
                        }
                        alt={
                          c?.isLoader === "yes" ||
                          c?.isLoader === "streaming" ||
                          c?.isLoader === "partial"
                            ? "Loading"
                            : c?.isSearch || c?.searchType === "agent"
                            ? "Agent"
                            : "AI"
                        }
                        className={`${styles["ai-icon"]} ${
                          c?.isLoader === "yes" ||
                          c?.isLoader === "streaming" ||
                          c?.isLoader === "partial"
                            ? styles["loading-animation"]
                            : ""
                        }`}
                      />
                    </div>
                    <div className={styles["message-content-wrapper"]}>
                      <div
                        className={`${styles["message-content"]} ${
                          c?.isSearch ? styles["search-message-content"] : ""
                        } ${
                          c?.isLoader === "streaming" ||
                          c?.isLoader === "partial"
                            ? styles["partial-response"]
                            : ""
                        }`}>
                        {c?.isLoader === "yes" ? (
                          <div className={styles["loading-container-gemini"]}>
                            <div className={styles["loading-dots"]}>
                              <div className={styles["loading-dot"]}></div>
                              <div className={styles["loading-dot"]}></div>
                              <div className={styles["loading-dot"]}></div>
                            </div>
                            <span className={styles["loading-text"]}>
                              {currentLoadingText}
                            </span>
                          </div>
                        ) : c?.isLoader === "streaming" ||
                          c?.isLoader === "partial" ? (
                          <div className={styles["streaming-container"]}>
                            <div
                              className={styles["streaming-content"]}
                              dangerouslySetInnerHTML={{
                                __html:
                                  processMessageContent(
                                    c?.gemini,
                                    c?.queryKeywords,
                                    c?.isPreformattedHTML
                                  ) || "Connecting...",
                              }}
                            />
                            {c?.isLoader === "streaming" && (
                              <span className={styles["typing-indicator"]}>
                                <span className={styles["typing-dot"]}></span>
                                <span className={styles["typing-dot"]}></span>
                                <span className={styles["typing-dot"]}></span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <div
                            className="gemini-answer"
                            dangerouslySetInnerHTML={{
                              __html:
                                processMessageContent(
                                  c?.gemini,
                                  c?.queryKeywords,
                                  c?.isPreformattedHTML
                                ) || "",
                            }}
                          />
                        )}
                      </div>

                      {c.isLoader === "no" && (
                        <>
                          {c.sources && c.sources.length > 0 && (
                            <div className={styles["unified-info-card"]}>
                              <div className={styles["sources-section"]}>
                                <h3 className={styles["section-title"]}>
                                  Sources ({c.sources.length})
                                </h3>
                                <div className={styles["sources-grid"]}>
                                  {c.sources.map((source, idx) => {
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
                                          <div
                                            className={styles["source-header"]}>
                                            {source.favicon && (
                                              <img
                                                src={source.favicon}
                                                alt=""
                                                className={
                                                  styles["source-favicon"]
                                                }
                                              />
                                            )}
                                            {domain && (
                                              <div
                                                className={
                                                  styles["source-domain"]
                                                }>
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
                                                  c.queryKeywords?.join(" ") ||
                                                    ""
                                                )
                                              ),
                                            }}
                                          />
                                          {(source.type === "jira" ||
                                            source.type === "confluence") && (
                                            <span
                                              className={
                                                styles["source-type-badge"]
                                              }>
                                              {source.type.toUpperCase()}
                                            </span>
                                          )}
                                          {source.snippet && (
                                            <div
                                              className={
                                                styles["source-snippet"]
                                              }
                                              dangerouslySetInnerHTML={{
                                                __html: DOMPurify.sanitize(
                                                  highlightKeywords(
                                                    source.snippet,
                                                    c.queryKeywords?.join(
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

                          {c.relatedQuestions &&
                            c.relatedQuestions.length > 0 && (
                              <div className={styles["unified-info-card"]}>
                                <div
                                  className={
                                    styles["related-questions-section"]
                                  }>
                                  <h3 className={styles["section-title"]}>
                                    Related Questions
                                  </h3>
                                  <div
                                    className={
                                      styles["related-questions-list"]
                                    }>
                                    {c.relatedQuestions.map((question, idx) => (
                                      <div
                                        key={`question-${uniqueKey}-${idx}`}
                                        className={
                                          styles["related-question-chip"]
                                        }
                                        onClick={() =>
                                          handleRelatedQuestionClick(
                                            question,
                                            c.searchType,
                                            c.isSearch
                                          )
                                        }>
                                        <span
                                          className={styles["question-text"]}>
                                          {question}
                                        </span>
                                        <span
                                          className={styles["question-icon"]}>
                                          +
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                        </>
                      )}

                      {c?.gemini && c?.isLoader === "no" && !c.error && (
                        <div className={styles["message-actions-toolbar"]}>
                          <CopyBtn data={c?.gemini} />
                          {historyId && (
                            <ShareBtn chatId={historyId} messageId={c?.id} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
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
                        {c.error?.message || c.error || "An error occurred."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Fragment>
      );
    });
  }, [
    chat,
    currentLoadingText,
    getAnswerKeywords,
    processMessageContent,
    handleRelatedQuestionClick,
    historyId,
    userLogo,
    geminiLogo,
    agentLogo,
    generateUniqueKey,
  ]);

  // Show loading indicator while chat is loading - MOVED AFTER ALL HOOKS
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
