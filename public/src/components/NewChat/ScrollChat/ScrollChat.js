import styles from "./ScrollChat.module.css";
import { commonIcon } from "../../../asset";
import { useSelector, useDispatch } from "react-redux";
import React, { useRef, useEffect, Fragment, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getChat } from "../../../store/chat-action";
import { chatAction } from "../../../store/chat";
import ReplyByGemini from "./ReplyByGemini";
import NewChatByGemini from "./NewChatGemini";
import CopyBtn from "../../Ui/CopyBtn";

const ScrollChat = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { historyId } = useParams();
  const chatRef = useRef(null);
  const chat = useSelector((state) => state.chat.chats);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const realTimeResponse = localStorage.getItem("realtime") || "no";
  const userImage = useSelector((state) => state.user.user.profileImg);
  const [chatType, setChatType] = useState(null);

  const userLogo = userImage || commonIcon.avatarIcon;
  const geminiLogo = commonIcon.chatGeminiIcon;
  const agentLogo = commonIcon.advanceGeminiIcon;

  useEffect(() => {
    if (chat.length === 0 && !historyId) {
      navigate("/");
    } else if (historyId && historyId !== chatHistoryId) {
      console.log("Attempting to load chat history for:", historyId);
    } else if (chatHistoryId && historyId !== chatHistoryId) {
      navigate(`/app/${chatHistoryId}`);
    }
  }, [dispatch, historyId, chatHistoryId, navigate, chat]);

  useEffect(() => {
    if (chat.length > 0 && chat[0]?.searchType) {
      setChatType(chat[0].searchType);
    } else if (chatHistoryId) {
      if (chatHistoryId.startsWith("agent_")) {
        setChatType("agent");
      } else if (chatHistoryId.startsWith("search_")) {
        const parts = chatHistoryId.split("_");
        if (["simple", "deep", "rag", "orchestrated"].includes(parts[1])) {
          setChatType(parts[1]);
        } else {
          setChatType("search");
        }
      } else {
        setChatType("regular");
      }
    } else {
      setChatType("regular");
    }
  }, [chatHistoryId, chat]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chat]);

  const loadText = (text) => {
    return text
      ?.replace(/\n/g, "<br>")
      ?.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      ?.replace(/<br>\*/g, '<br><span style="margin-right: 5px;">&bull;</span>')
      ?.replace(/```([\s\S]*?)```/g, (_, codeBlock) => {
        let code = codeBlock
          .replace(/<br>/g, "\n")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<br><pre><code style="display: block; padding: 10px; background: #f0f0f0; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word;">${code}</code></pre>`;
      });
  };

  const lastElementId = chat[chat.length - 1]?.id;

  const chatSection = chat.map((c, index) => (
    <Fragment key={c?.id || index}>
      {!c.error ? (
        <div className={styles["single-chat"]}>
          <div className={styles["user"]}>
            <div className={styles["sender-info"]}>
              <img src={userLogo} alt="User avatar" />
              <span className={styles["sender-name"]}>You</span>
            </div>
            <div className={styles["message-content"]}>
              <p>{c.user}</p>
            </div>
          </div>

          <div className={styles["gemini"]}>
            <div className={styles["sender-info"]}>
              <img
                src={c?.searchType === "agent" ? agentLogo : geminiLogo}
                alt={c?.searchType === "agent" ? "Agent" : "Gemini"}
                className={c?.isLoader === "yes" ? "loading-icon" : ""}
              />
              <span className={styles["sender-name"]}>
                {c?.isLoader === "yes"
                  ? "Generating..."
                  : c?.searchType === "agent"
                  ? "Agent"
                  : "Gemini"}
              </span>
            </div>
            <div className={styles["message-content"]}>
              {c?.isLoader === "yes" ? (
                <div className="loading-placeholder"></div>
              ) : c?.isSearch ? (
                <div
                  className={`search-result ${
                    c?.searchType ? `${c.searchType}-result` : ""
                  }`}
                  dangerouslySetInnerHTML={{ __html: c?.gemini }}
                />
              ) : (
                <div
                  dangerouslySetInnerHTML={{
                    __html: loadText(c?.gemini) || "",
                  }}
                />
              )}
            </div>
            {c?.gemini && c?.isLoader !== "yes" && <CopyBtn data={c?.gemini} />}
          </div>
        </div>
      ) : (
        <div className={styles["single-chat"]}>
          <div className={styles["error-message"]}>
            Error loading chat message.
          </div>
        </div>
      )}
    </Fragment>
  ));

  const renderChatActions = () => {
    if (!(chatHistoryId && chatHistoryId.length > 0 && chat.length > 0))
      return null;

    let indicator = null;
    if (chatType === "agent") {
      indicator = (
        <div className={styles["agent-indicator"]}>
          <img src={agentLogo} alt="Agent" />
          <span>Agent Chat</span>
        </div>
      );
    } else if (
      ["simple", "deep", "rag", "orchestrated", "search"].includes(chatType)
    ) {
      indicator = (
        <div className={styles["search-indicator"]}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            {chatType === "simple"
              ? "Simple Search"
              : chatType === "deep"
              ? "Deep Search"
              : chatType === "rag"
              ? "RAG Search"
              : chatType === "orchestrated"
              ? "Orchestrated Query"
              : "Search Result"}
          </span>
        </div>
      );
    }

    return <div className={styles["chat-actions"]}>{indicator}</div>;
  };

  return (
    <div className={styles["scroll-chat-main"]} ref={chatRef}>
      {renderChatActions()}
      {chatSection}
    </div>
  );
};

export default ScrollChat;
