import styles from "./ScrollChat.module.css";
import { commonIcon } from "../../../asset";
import { useSelector, useDispatch } from "react-redux";
import React, { useRef, useEffect, Fragment, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
    "for",
    "not",
  ]);
  return String(text)
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, "")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));
};

const ScrollChat = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { historyId } = useParams();
  const chatRef = useRef(null);
  const chat = useSelector((state) => state.chat.chats);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const userImage = useSelector((state) => state.user.user.profileImg);

  const userLogo = userImage || commonIcon.avatarIcon;
  const geminiLogo = commonIcon.chatGeminiIcon;
  const agentLogo = commonIcon.advanceGeminiIcon;

  // Enhanced loading text variations - more Claude-like
  const loadingTexts = [
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
  ];

  const [currentLoadingText, setCurrentLoadingText] = useState(loadingTexts[0]);

  useEffect(() => {
    if (historyId && historyId !== chatHistoryId) {
      dispatch(getChat(historyId));
      dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: historyId }));
    }
  }, [dispatch, historyId, chatHistoryId, navigate]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chat]);

  useEffect(() => {
    // Check for different loading indicators - standard or streaming
    const hasStandardLoadingMessage = chat.some(
      (c) =>
        c.isLoader === "yes" &&
        (c.searchType === "agent" ||
          c.searchType === "deep" ||
          c.searchType === "simple")
    );

    // If there's a standard loading message, rotate the loading text
    let intervalId;
    if (hasStandardLoadingMessage) {
      setCurrentLoadingText(loadingTexts[0]); // Reset to first message when loading starts
      intervalId = setInterval(() => {
        setCurrentLoadingText((prevText) => {
          const currentIndex = loadingTexts.indexOf(prevText);
          const nextIndex = (currentIndex + 1) % loadingTexts.length;
          return loadingTexts[nextIndex];
        });
      }, 2500); // Change text every 2.5 seconds
    }

    return () => clearInterval(intervalId);
  }, [chat]);

  // In ScrollChat.js - ensure processMessageContent handles Markdown properly

  const processMessageContent = (
    text,
    queryKeywords = [],
    isUserMessage = false
  ) => {
    if (text === null || typeof text === "undefined") return "";
    let processedText = String(text);

    // Only process non-user messages that don't already have HTML tags
    if (!isUserMessage) {
      const containsHtmlTags = /<\/?[a-z][\s\S]*>/i.test(processedText);

      if (!containsHtmlTags) {
        // First replace Markdown links with HTML links
        processedText = processedText.replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer" class="link-styled">$1</a>'
        );

        // Format headers with proper styling and spacing
        processedText = processedText.replace(
          /^### (.*$)/gim,
          '<h3 style="margin-top: 16px; margin-bottom: 8px; font-size: 1.2em;">$1</h3>'
        );
        processedText = processedText.replace(
          /^## (.*$)/gim,
          '<h2 style="margin-top: 20px; margin-bottom: 10px; font-size: 1.4em;">$1</h2>'
        );
        processedText = processedText.replace(
          /^# (.*$)/gim,
          '<h1 style="margin-top: 24px; margin-bottom: 12px; font-size: 1.6em;">$1</h1>'
        );

        // Format lists with proper indentation and spacing
        processedText = processedText.replace(
          /^\s*[-*+] (.*)/gim,
          '<li style="margin-bottom: 4px;">$1</li>'
        );
        processedText = processedText.replace(
          /(<li[^>]*>.*<\/li>\s*)+/g,
          '<ul style="margin-top: 8px; margin-bottom: 8px; padding-left: 20px;">$&</ul>'
        );

        // Add styling to emoji sections to make them stand out better
        processedText = processedText.replace(
          /([\uD800-\uDBFF][\uDC00-\uDFFF])\s+([^:\n]+):/g,
          '<div style="display: flex; align-items: center; margin: 12px 0; font-weight: bold;"><span style="font-size: 1.2em; margin-right: 8px;">$1</span><span>$2:</span></div>'
        );

        // Process code blocks
        processedText = processedText.replace(
          /```([\s\S]*?)```/gs,
          (match, codeBlock) => {
            const escapedCode = codeBlock
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            return `<pre style="background-color: #f6f8fa; padding: 12px; border-radius: 4px; overflow-x: auto;"><code>${escapedCode.trim()}</code></pre>`;
          }
        );

        // Add paragraph spacing to remaining line breaks
        processedText = processedText.replace(
          /\n\n/g,
          '</p><p style="margin-top: 12px;">'
        );

        // Convert single newlines to <br> for formatting
        processedText = processedText.replace(
          /\n(?!<\/?(ul|li|h[1-6]|pre|code|strong|em|br))/g,
          "<br />"
        );

        // Wrap the entire content in a div with proper spacing
        processedText = `<div style="line-height: 1.5; color: inherit;"><p>${processedText}</p></div>`;
      }
    }

    // Skip highlighting for user messages or if no keywords
    if (isUserMessage || !queryKeywords || queryKeywords.length === 0) {
      return processedText;
    }

    // Only highlight if there are keywords and it's not a user message
    // Use gentle highlighting to avoid over-highlighting
    if (Array.isArray(queryKeywords)) {
      // Combine keywords for highlighting
      const keywordString = queryKeywords.join(" ");
      return highlightKeywords(processedText, keywordString);
    } else if (typeof queryKeywords === "string") {
      return highlightKeywords(processedText, queryKeywords);
    }

    return processedText;
  };

  const getAnswerKeywords = (geminiText) => {
    if (!geminiText) return [];
    const tempDiv = document.createElement("div");
    // Use processMessageContent to convert markdown to HTML before extracting text
    // Pass empty array for queryKeywords and false for isUserMessage to get base HTML
    tempDiv.innerHTML = processMessageContent(geminiText, [], false);
    return extractKeywords(tempDiv.textContent || tempDiv.innerText || "");
  };

  const handleRelatedQuestionClick = (
    question,
    originalSearchType,
    originalIsSearch
  ) => {
    let endpoint = "/api/simplesearch";
    if (originalIsSearch) {
      if (originalSearchType === "simple") endpoint = "/api/simplesearch";
      else if (
        ["deep", "deepSearchAgent", "deepResearchAgent", "agent"].includes(
          originalSearchType
        )
      )
        endpoint = "/api/deepsearch";
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
          previousChat: [],
          chatHistoryId: chatHistoryId,
        })
      );
    }
  };

  const chatSection = chat.map((c) => {
    // Calculate answerKeywords directly here
    const answerKeywords = getAnswerKeywords(c?.gemini);

    return (
      <Fragment key={c?.id || Math.random()}>
        {!c?.error ? (
          <div className={styles["single-chat"]}>
            {c?.user && (
              // ... user chat bubble ...
              <div className={styles["user-chat-container"]}>
                <div className={`${styles.user} ${styles["message-bubble"]}`}>
                  <div className={styles["sender-info"]}>
                    <img src={userLogo} alt="User" />
                  </div>
                  <div className={styles["message-content"]}>
                    <p>{c.user}</p>
                  </div>
                </div>
              </div>
            )}

            {(c?.gemini ||
              c?.isLoader === "yes" ||
              c?.isLoader === "streaming") && (
              // ... AI chat bubble ...
              <div className={styles["gemini-chat-container"]}>
                <div className={`${styles.gemini} ${styles["message-bubble"]}`}>
                  <div className={styles["sender-info"]}>
                    <img
                      src={
                        c?.isLoader === "yes" &&
                        (c?.searchType === "agent" ||
                          c?.searchType === "deep" ||
                          c?.searchType === "simple")
                          ? commonIcon.geminiLaoder
                          : c?.isLoader === "streaming"
                          ? commonIcon.geminiLaoder // Use the same loader icon for streaming
                          : c?.isSearch || c?.searchType === "agent"
                          ? agentLogo
                          : geminiLogo
                      }
                      alt={
                        c?.isLoader === "yes" || c?.isLoader === "streaming"
                          ? "Loading"
                          : c?.isSearch || c?.searchType === "agent"
                          ? "Agent"
                          : "AI"
                      }
                      className={`${styles["ai-icon"]} ${
                        (c?.isLoader === "yes" ||
                          c?.isLoader === "streaming") &&
                        (c?.searchType === "agent" ||
                          c?.searchType === "deep" ||
                          c?.searchType === "simple")
                          ? styles.sparkleAnimation
                          : ""
                      }`}
                    />
                  </div>
                  <div className={styles["message-content-wrapper"]}>
                    <div
                      className={`${styles["message-content"]} ${
                        c?.isSearch ? styles["search-message-content"] : ""
                      }`}>
                      {c?.isLoader === "yes" ? (
                        <div className={styles["loading-container-gemini"]}>
                          <span className={styles["loading-text"]}>
                            {currentLoadingText}
                          </span>
                        </div>
                      ) : c?.isLoader === "streaming" ? (
                        // Handle streaming messages with a typing animation
                        <div className={styles["streaming-container"]}>
                          <div
                            className={styles["streaming-content"]}
                            dangerouslySetInnerHTML={{
                              __html:
                                processMessageContent(
                                  c?.gemini,
                                  c?.queryKeywords
                                ) || "",
                            }}
                          />

                          {/* Only show typing indicator if still streaming */}
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
                                c?.queryKeywords
                              ) || "",
                          }}
                        />
                      )}
                    </div>

                    {/* Show sources and related questions for completed messages only */}
                    {!c.isLoader && (
                      <>
                        {c.sources && c.sources.length > 0 && (
                          <div className="sources-container">
                            <h3 className={styles.unifiedCardSectionTitle}>
                              Sources
                            </h3>
                            <ul>
                              {c.sources.map((source, idx) => {
                                const sourceTextForMatching = `${
                                  source.title || ""
                                } ${source.snippet || ""}`.toLowerCase();
                                const isHighlighted = answerKeywords.some(
                                  (keyword) =>
                                    sourceTextForMatching.includes(keyword)
                                );
                                const sourceClass = isHighlighted
                                  ? "source-item highlighted-source"
                                  : "source-item";

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
                                  <li
                                    key={source.id || idx}
                                    className={sourceClass}>
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={source.title || source.url}>
                                      {source.favicon && (
                                        <img
                                          src={source.favicon}
                                          alt=""
                                          className="source-icon"
                                        />
                                      )}
                                      <div className="source-card-content">
                                        {domain && (
                                          <div className="source-domain">
                                            {domain}
                                          </div>
                                        )}
                                        <div
                                          className="source-title"
                                          dangerouslySetInnerHTML={{
                                            __html: DOMPurify.sanitize(
                                              highlightKeywords(
                                                displayTitle,
                                                c.queryKeywords
                                              )
                                            ),
                                          }}
                                        />
                                        {(source.type === "jira" ||
                                          source.type === "confluence") && (
                                          <span className="source-type-badge">
                                            {source.type.toUpperCase()}
                                          </span>
                                        )}
                                        {source.snippet && (
                                          <div
                                            className="source-snippet"
                                            dangerouslySetInnerHTML={{
                                              __html: DOMPurify.sanitize(
                                                highlightKeywords(
                                                  source.snippet,
                                                  c.queryKeywords
                                                )
                                              ),
                                            }}
                                          />
                                        )}
                                      </div>
                                    </a>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {c.relatedQuestions &&
                          c.relatedQuestions.length > 0 && (
                            <div className="follow-up-questions-container">
                              <p className="related-title">Related</p>
                              {c.relatedQuestions.map((question, idx) => (
                                <div
                                  key={idx}
                                  className="follow-up-question-card"
                                  onClick={() =>
                                    handleRelatedQuestionClick(
                                      question,
                                      c.searchType,
                                      c.isSearch
                                    )
                                  }>
                                  <span>{question}</span>
                                  <span className="follow-up-plus-icon">+</span>
                                </div>
                              ))}
                            </div>
                          )}
                      </>
                    )}

                    {/* Show copy and share buttons only for completed messages */}
                    {c?.gemini &&
                      c?.isLoader !== "yes" &&
                      c?.isLoader !== "streaming" &&
                      !c.error && (
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
          // ... error display ...
          <div className={styles["single-chat"]}>
            <div className={styles["gemini-chat-container"]}>
              <div
                className={`${styles.gemini} ${styles["message-bubble"]} ${styles.errorBubble}`}>
                <div className={styles["sender-info"]}>
                  <img
                    src={agentLogo}
                    alt="Error"
                    className={styles["ai-icon"]}
                  />
                </div>
                <div
                  className={`${styles["message-content"]} ${styles["error-message"]}`}>
                  <p>{c.error.message || "An error occurred."}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Fragment>
    );
  });

  return (
    <div className={styles["scroll-chat-main"]} ref={chatRef}>
      {chatSection}
    </div>
  );
};

export default ScrollChat;
