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
import { getLoadingIconUrl } from "../../../utils/agentLoadingHelper";

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

  if (text === result && validKeywords.length > 0) {
    // console.warn("[highlightText] Keywords provided but no matches found in text:", { text, keywords: validKeywords });
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

  // Effect to handle scrolling when chat updates
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }

    const newLoaderItems = document.querySelectorAll(".loader-animation");
    newLoaderItems.forEach((img) => {
      const originalSrc = img.src;
      setTimeout(() => {
        img.src =
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        setTimeout(() => {
          img.src = originalSrc;
        }, 10);
      }, 0);
    });
  }, [chat]);

  useEffect(() => {
    const isLoading = chat.some((c) => c.isLoader === "yes");
    let intervalId;
    if (isLoading) {
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
  }, [chat, loadingTexts]); // Merged: Added loadingTexts to dependency array

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
      processedText = processedText.replace(/^## (.*$)/gim, "<h3>$1</h3>");
      processedText = processedText.replace(/^# (.*$)/gim, "<h3>$1</h3>");
      processedText = processedText.replace(/^\s*[-*+] (.*)/gim, "<li>$1</li>");
      processedText = processedText.replace(
        /(<li>.*<\/li>\s*)+/g,
        "<ul>$&</ul>"
      );
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
                      c?.isLoader === "yes"
                        ? getLoadingIconUrl()
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
                      c?.isLoader === "yes" ? "loader-animation" : ""
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
                    ) : (
                      <div
                        className="gemini-answer"
                        dangerouslySetInnerHTML={{
                          __html:
                            c.isPreformattedHTML === true
                              ? c.gemini // Merged: Added isPreformattedHTML check
                              : processMessageContent(
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
                            </h3>
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
                              <h2 className={styles.unifiedCardSectionTitle}>
                                Related Questions
                              </h2>
                              <div className={styles.relatedQuestionsList}>
                                {c.relatedQuestions.map((question, idx) => (
                                  <div
                                    key={idx}
                                    className={styles.relatedQuestionItem}
                                    onClick={() =>
                                      handleRelatedQuestionClick(
                                        question,
                                        c.searchType,
                                        c.isSearch
                                      )
                                    }>
                                    <span
                                      className={styles.relatedQuestionText}
                                      dangerouslySetInnerHTML={{
                                        __html: processMessageContent(
                                          question,
                                          c.queryKeywords
                                        ),
                                      }}
                                    />
                                    <span
                                      className={
                                        styles.relatedQuestionPlusIcon
                                      }>
                                      +
                                    </span>
                                  </div>
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
    <div className={styles.chat} ref={chatRef}>
      {chatSection}
    </div>
  );
};

export default ScrollChat;
