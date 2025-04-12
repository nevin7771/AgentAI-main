import { Route, Routes, Navigate } from "react-router-dom";
import Header from "../Header/Header";
import InputSection from "../InputSection/InputSection";
import NewChat from "../NewChat/NewChat";
import AdvanceGemini from "../Ui/AdvanceGmini";
import styles from "./ChatSection.module.css";
import { useSelector } from "react-redux";
import ScrollChat from "../NewChat/ScrollChat/ScrollChat";
import Loader from "../Ui/Loader";

const ChatSection = () => {
  const isLoader = useSelector((state) => state.chat.isLoader);
  return (
    <div className={styles["chat-section-main"]}>
      <Header />
      <AdvanceGemini />
      {isLoader && <Loader />}

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
      <InputSection />
      <div className={styles["warning-text"]}>
        <p>
          Gemini may display inaccurate info, including about people, so
          double-check its responses.
          <span>
            <a href="https://support.google.com/gemini?p=privacy_notice">
              Your privacy & Gemini Apps
            </a>
          </span>
        </p>
      </div>
    </div>
  );
};

export default ChatSection;
