import { Route, Routes, Navigate } from "react-router-dom";
import Header from "../Header/Header";
import InputSection from "../InputSection/InputSection";
import NewChat from "../NewChat/NewChat";
import AdvanceGemini from "../Ui/AdvanceGmini";
import styles from "./ChatSection.module.css";
import { useSelector } from "react-redux";
import ScrollChat from "../NewChat/ScrollChat/ScrollChat";
import Loader from "../Ui/Loader";
import DeepResearchComponent from "../DeepResearch/DeepResearchComponent";

const ChatSection = () => {
  const isLoader = useSelector((state) => state.chat.isLoader);
  const isDeepResearchMode = useSelector(
    (state) => state.ui.isDeepResearchMode
  );
  // eslint-disable-next-line no-unused-vars
  const isAdvanceGeminiPrompt = useSelector((state) => state.ui.isAdvanceShow);

  return (
    <div className={styles["chat-section-main"]}>
      <Header />
      <AdvanceGemini />
      {isLoader && <Loader />}

      {isDeepResearchMode ? (
        <div className={styles["research-container"]}>
          <DeepResearchComponent />
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<NewChat />} />
          <Route path="/app" element={<ScrollChat />} />
          <Route path="/app/:historyId" element={<ScrollChat />} />
          {/* Add this redirect route */}
          <Route
            path="/api/auth/okta/callback"
            element={<Navigate to="/" replace />}
          />
        </Routes>
      )}

      <InputSection />
      <div className={styles["warning-text"]}></div>
    </div>
  );
};

export default ChatSection;
