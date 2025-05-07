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

const highlightTextReturningHTML = (
  text,
  keywords,
  globalHighlightClassName
) => {
  if (!text || typeof text !== "string") return text; // Ensure text is a string
  if (!keywords || keywords.length === 0) return text;

  const validKeywords = Array.isArray(keywords)
    ? keywords.filter((kw) => typeof kw === "string" && kw.trim() !== "")
    : [];

  if (validKeywords.length === 0) return text;

  const className = globalHighlightClassName || "highlighted-keyword";
  // Escape keywords for regex and create a case-insensitive regex
  const regex = new RegExp(
    `(${validKeywords
      .map((kw) => kw.replace(/[.*+?^${}()|[\\\]]/g, "\\$&"))
      .join("|")})`,
    "gi"
  );

  const result = text.replace(regex, `<span class="${className}">$1</span>`);

  // For debugging: Log if keywords were provided but no replacements were made
  // This might indicate an issue with keyword matching or the text content itself.
  if (text === result && validKeywords.length > 0) {
    // console.warn("[highlightText] Keywords provided but no matches found in text:", { text, keywords: validKeywords });
    // This console.warn can be very noisy if keywords often don't match parts of titles/snippets.
    // It's better to rely on visual inspection and correct queryKeywords in the store.
  }
  return result;
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

  const loadingTexts = [
    "Generating...",
    "Just a sec...",
    "Working on it...",
    "Almost there...",
    "Fetching details...",
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
    const isLoading = chat.some(
      (c) =>
        c.isLoader === "yes" &&
        (c.searchType === "agent" ||
          c.searchType === "deep" ||
          c.searchType === "simple")
    );
    let intervalId;
    if (isLoading) {
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

  const processMessageContent = (
    text,
    queryKeywords = [],
    isUserMessage = false
  ) => {
    if (text === null || typeof text === "undefined") return "";
    let processedText = String(text);

    if (!isUserMessage) {
      processedText = processedText.replace(
        /```([\s\S]*?)```/gs,
        (match, codeBlock) => {
          const escapedCode = codeBlock
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<br><pre class="${
            styles.codeBlock
          }"><code>${escapedCode.trim()}\n</code></pre><br>`;
        }
      );
      processedText = processedText.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
      );
      processedText = processedText.replace(/\*(.*?)\*/g, "<em>$1</em>");
      processedText = processedText.replace(/^### (.*$)/gim, "<h3>$1</h3>");
      processedText = processedText.replace(/^## (.*$)/gim, "<h2>$1</h2>");
      processedText = processedText.replace(/^# (.*$)/gim, "<h1>$1</h1>");
      processedText = processedText.replace(/^\s*[-*+] (.*)/gim, "<li>$1</li>");
      processedText = processedText.replace(
        /(<li>.*<\/li>\s*)+/g,
        "<ul>$&</ul>"
      );
      // Convert newlines to <br /> only if they are not part of the above structures or already <br>
      // This is a simplification; a full markdown parser would be more robust.
      processedText = processedText.replace(
        /\n(?!<\/?(ul|li|h[1-6]|pre|code|strong|em|br))/g,
        "<br />"
      );
    }

    if (isUserMessage || !queryKeywords || queryKeywords.length === 0) {
      return processedText;
    }

    if (!isUserMessage) {
      processedText = highlightTextReturningHTML(
        processedText,
        queryKeywords,
        "highlighted-keyword"
      );
    }
    return processedText;
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

  const chatSection = chat.map((c) => (
    <Fragment key={c?.id || Math.random()}>
      {!c?.error ? (
        <div className={styles["single-chat"]}>
          {c?.user && (
            <div className={styles["user-chat-container"]}>
              <div className={`${styles.user} ${styles["message-bubble"]}`}>
                <div className={styles["sender-info"]}>
                  <img src={userLogo} alt="User" />
                </div>
                <div className={styles["message-content"]}>
                  {/* User messages are typically plain text, no need for dangerouslySetInnerHTML unless they can contain HTML */}
                  <p>{c.user}</p>
                </div>
              </div>
            </div>
          )}

          {(c?.gemini || c?.isLoader === "yes") && (
            <div className={styles["gemini-chat-container"]}>
              <div className={`${styles.gemini} ${styles["message-bubble"]}`}>
                <div className={styles["sender-info"]}>
                  <img
                    src={
                      c?.isLoader === "yes" &&
                      (c?.searchType === "agent" ||
                        c?.searchType === "deep" ||
                        c?.searchType === "simple")
                        ? commonIcon.geminiSparkle
                        : c?.isSearch || c?.searchType === "agent"
                        ? agentLogo
                        : geminiLogo
                    }
                    alt={
                      c?.isLoader === "yes"
                        ? "Loading"
                        : c?.isSearch || c?.searchType === "agent"
                        ? "Agent"
                        : "AI"
                    }
                    className={`${styles["ai-icon"]} ${
                      c?.isLoader === "yes" &&
                      (c?.searchType === "agent" ||
                        c?.searchType === "deep" ||
                        c?.searchType === "simple")
                        ? styles.sparkleAnimation
                        : ""
                    }`}
                  />
                </div>
                <div className={styles["message-content-wrapper"]}>
                  {" "}
                  {/* Added wrapper */}
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
                  {c?.isSearch &&
                    (c?.sources?.length > 0 ||
                      c?.relatedQuestions?.length > 0) &&
                    !c.isLoader && (
                      <div className={styles.unifiedInfoCard}>
                        {c.sources && c.sources.length > 0 && (
                          <div className={styles.sourcesContainerInUnifiedCard}>
                            <h3 className={styles.unifiedCardSectionTitle}>
                              Sources and related content
                            </h3>{" "}
                            {/* Updated title based on image */}
                            <div className="gemini-sources-grid">
                              {c.sources.map((source, idx) => (
                                <div className="source-card" key={idx}>
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="source-card-link">
                                    <div className="source-card-content">
                                      <div
                                        className="source-card-title"
                                        dangerouslySetInnerHTML={{
                                          __html: processMessageContent(
                                            source.title,
                                            c.queryKeywords
                                          ),
                                        }}
                                      />
                                      {source.snippet && (
                                        <div
                                          className="source-card-snippet"
                                          dangerouslySetInnerHTML={{
                                            __html: processMessageContent(
                                              source.snippet,
                                              c.queryKeywords
                                            ),
                                          }}
                                        />
                                      )}
                                    </div>
                                    <div className="source-card-footer">
                                      {source.favicon && (
                                        <img
                                          src={source.favicon}
                                          alt=""
                                          className="source-favicon"
                                        />
                                      )}
                                      <span className="source-url">
                                        {source.url
                                          ? new URL(source.url).hostname
                                          : ""}
                                      </span>
                                      {/* Add three-dot menu icon if needed, requires additional logic and styling */}
                                      {/* <span className={styles.sourceCardMenu}>&#8942;</span> */}
                                    </div>
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {c.relatedQuestions &&
                          c.relatedQuestions.length > 0 && (
                            <div
                              className={
                                styles.relatedQuestionsContainerInUnifiedCard
                              }>
                              <h3 className={styles.unifiedCardSectionTitle}>
                                Related Questions
                              </h3>
                              <div className="gemini-chips-list">
                                {c.relatedQuestions.map((question, idx) => (
                                  <button
                                    key={idx}
                                    className="gemini-chip"
                                    onClick={() =>
                                      handleRelatedQuestionClick(
                                        question,
                                        c.searchType,
                                        c.isSearch
                                      )
                                    }>
                                    <span
                                      className="gemini-chip-text"
                                      dangerouslySetInnerHTML={{
                                        __html: processMessageContent(
                                          question,
                                          c.queryKeywords
                                        ),
                                      }}
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    )}
                  {c?.gemini && c?.isLoader !== "yes" && !c.error && (
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
  ));

  return (
    <div className={styles["scroll-chat-main"]} ref={chatRef}>
      {chatSection}
    </div>
  );
};

export default ScrollChat;
