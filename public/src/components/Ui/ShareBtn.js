import React from "react";
// import { commonIcon } from '../../../asset'; // Removed unused import
import styles from "./UiStyles.module.css";

const ShareBtn = ({ chatId, messageId }) => {
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/app/${chatId}${
      messageId ? `?message=${messageId}` : ""
    }`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy link: ", err);
      alert("Failed to copy link.");
    }
  };

  if (!chatId) return null;

  return (
    <button
      onClick={handleShare}
      className={`${styles["action-button"]} ${styles["share-button"]}`}
      title="Share Link">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="currentColor">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
      </svg>
      <span>Share</span>
    </button>
  );
};

export default ShareBtn;
