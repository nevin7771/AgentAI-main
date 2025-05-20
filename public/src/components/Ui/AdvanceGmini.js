// public/src/components/Ui/AdvanceGemini.js
import styles from "./AdvanceGemini.module.css";
import { commonIcon } from "../../asset";
import { themeIcon } from "../../asset";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { chatAction } from "../../store/chat";
import { agentAction } from "../../store/agent";
import { useAgent } from "../AgentChat/AgentProvider";

const AdvanceGemini = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAdvanceGeminiPrompt = useSelector((state) => state.ui.isAdvanceShow);
  const advanceClass = isAdvanceGeminiPrompt ? "advance-on" : "advance-off";
  const selectedAgents = useSelector(
    (state) => state.agent?.selectedAgents || []
  );

  const icon = themeIcon();
  const { agents } = useAgent();

  const newChatHandler = () => {
    dispatch(chatAction.replaceChat({ chats: [] }));
    dispatch(chatAction.newChatHandler());
    dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: "" }));
    navigate("/");
  };

  const selectAgentHandler = (agentId) => {
    if (selectedAgents.includes(agentId)) {
      dispatch(agentAction.removeSelectedAgent(agentId));
    } else {
      dispatch(agentAction.addSelectedAgent(agentId));
    }
  };

  return (
    <div className={`${styles["advance-main"]} ${styles[advanceClass]}`}>
      <h4>AI Agents</h4>

      {/* Gemini is still the default */}
      <div className={styles["gemini"]} onClick={newChatHandler}>
        <img src={commonIcon.geminiIcon} alt="gemini icon"></img>
        <p>Vista</p>
        <img src={icon.okIcon} alt="ok icon"></img>
      </div>

      {/* Show the agents instead of just "Gemini Advance" */}
      {agents.map((agent) => (
        <div
          key={agent.id}
          className={styles["agent-item"]}
          onClick={() => selectAgentHandler(agent.id)}>
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
        <p>Select multiple agents to get comprehensive answers</p>
      </div>
    </div>
  );
};

export default AdvanceGemini;
