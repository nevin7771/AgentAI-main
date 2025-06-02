// public/src/components/Ui/AdvanceGemini.js - FIXED FOR EXISTING UI ACTIONS
import styles from "./AdvanceGemini.module.css";
import { commonIcon } from "../../asset";
import { themeIcon } from "../../asset";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useCallback } from "react";
import { chatAction } from "../../store/chat";
import { agentAction } from "../../store/agent";
import { uiAction } from "../../store/ui-gemini"; // Using your existing UI actions
import { useAgent } from "../AgentChat/AgentProvider";

const AdvanceGemini = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAdvanceGeminiPrompt = useSelector((state) => state.ui.isAdvanceShow);
  const advanceClass = isAdvanceGeminiPrompt ? "advance-on" : "advance-off";
  const selectedAgents = useSelector(
    (state) => state.agent?.selectedAgents || []
  );

  // CRITICAL FIX: Add ref for click outside detection
  const advanceGeminiRef = useRef(null);

  const icon = themeIcon();
  const { agents } = useAgent();

  // CRITICAL FIX: Auto-close functionality - using your existing action names
  useEffect(() => {
    if (!isAdvanceGeminiPrompt) return;

    const handleClickOutside = (event) => {
      // Check if click is outside the advance gemini dropdown
      if (
        advanceGeminiRef.current &&
        !advanceGeminiRef.current.contains(event.target)
      ) {
        console.log("[AdvanceGemini] Closing dropdown - outside click");
        dispatch(uiAction.toggleAdvanceShow()); // FIXED: Use your existing action name
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        console.log("[AdvanceGemini] Closing dropdown - escape key");
        dispatch(uiAction.toggleAdvanceShow()); // FIXED: Use your existing action name
      }
    };

    // ENHANCED: Use document for better detection with capture phase
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleEscapeKey, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscapeKey, true);
    };
  }, [isAdvanceGeminiPrompt, dispatch]);

  // ENHANCED: New chat handler with auto-close
  const newChatHandler = useCallback(() => {
    console.log("[AdvanceGemini] Starting new chat");
    dispatch(chatAction.replaceChat({ chats: [] }));
    dispatch(chatAction.newChatHandler());
    dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: "" }));

    // CRITICAL FIX: Auto-close dropdown after selection
    setTimeout(() => {
      dispatch(uiAction.toggleAdvanceShow()); // FIXED: Use your existing action name
    }, 150);

    navigate("/");
  }, [dispatch, navigate]);

  // ENHANCED: Agent selection handler with auto-close
  const selectAgentHandler = useCallback(
    (agentId) => {
      console.log(`[AdvanceGemini] Selecting agent: ${agentId}`);

      if (selectedAgents.includes(agentId)) {
        dispatch(agentAction.removeSelectedAgent(agentId));
      } else {
        // CRITICAL FIX: Clear previous selections for single agent mode
        dispatch(agentAction.clearSelectedAgents());
        dispatch(agentAction.addSelectedAgent(agentId));
      }

      // CRITICAL FIX: Auto-close dropdown after agent selection
      setTimeout(() => {
        console.log(
          "[AdvanceGemini] Auto-closing dropdown after agent selection"
        );
        dispatch(uiAction.toggleAdvanceShow()); // FIXED: Use your existing action name
      }, 200); // Slightly longer delay for agent selection visual feedback
    },
    [selectedAgents, dispatch]
  );

  return (
    <div
      className={`${styles["advance-main"]} ${styles[advanceClass]}`}
      ref={advanceGeminiRef} // CRITICAL FIX: Add ref for click outside detection
    >
      <h4>AI Agents</h4>

      {/* Vista/Gemini - Default option */}
      <div
        className={styles["gemini"]}
        onClick={newChatHandler}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            newChatHandler();
          }
        }}>
        <img src={commonIcon.geminiIcon} alt="gemini icon"></img>
        <p>Vista</p>
        <img src={icon.okIcon} alt="ok icon"></img>
      </div>

      {/* Show the agents with enhanced interaction */}
      {agents.map((agent) => (
        <div
          key={agent.id}
          className={`${styles["agent-item"]} ${
            selectedAgents.includes(agent.id) ? styles["selected"] : ""
          }`}
          onClick={() => selectAgentHandler(agent.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectAgentHandler(agent.id);
            }
          }}>
          <img src={commonIcon.advanceGeminiIcon} alt={agent.name}></img>
          <p>{agent.name}</p>
          {selectedAgents.includes(agent.id) && (
            <img
              src={icon.okIcon}
              alt="selected"
              className={styles["selected-icon"]}></img>
          )}
        </div>
      ))}

      <div className={styles["info-text"]}>
        <p>
          {selectedAgents.length > 0
            ? `${selectedAgents.length} agent${
                selectedAgents.length > 1 ? "s" : ""
              } selected`
            : "Select agents for specialized assistance"}
        </p>
      </div>
    </div>
  );
};

export default AdvanceGemini;
