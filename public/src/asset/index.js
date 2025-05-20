import geminiIcon from "./gemini_sparkle_blue_33c17e77c4ebbdd9490b683b9812247e257b6f70.svg";
import advanceGeminiIcon from "./gemini_sparkle_red_4ed1cbfcbc6c9e84c31b987da73fc4168aec8445.svg";
import avatarIcon from "./avater-icon.png";
import chatGeminiIcon from "./bard_sparkle_v2.svg";
import geminiLaoder from "./bard_sparkle_processing_v2_loader.gif";
import googleLogo from "./icons8-google-48.png";
import ytIcon from "./icons8-youtube-48.png";
import flightIcon from "./icons8-flight-64.png";
import mapIcon from "./icons8-google-maps-48.png";
import hotelIcon from "./icons8-hotel-48.png";
import sportsIcon from "./icons8-man-winner-48.png";
import googleBigIcon from "./icons8-google-144.png";

import { darkIcon } from "./darkIcon/darkIcon";
import { lightIcon } from "./lightIcon/lightIcon";

export const commonIcon = {
  geminiIcon,
  advanceGeminiIcon,
  avatarIcon,
  chatGeminiIcon,
  geminiLaoder,
  googleLogo,
  ytIcon,
  flightIcon,
  mapIcon,
  hotelIcon,
  googleBigIcon,
};

export const themeIcon = () => {
  const localTheme = localStorage.getItem("theme") || "dark";
  const icon = localTheme === "dark" ? darkIcon : lightIcon;

  return icon;
};

export const suggestPrompt = [
  {
    id: 1,
    sort: "How to troubleshoot Client login issue ? ",
    long: "How to troubleshoot Client login issue ?",
    icon: "ideaIcon",
  },
  {
    id: 2,
    sort: "How to troubleshoot Client SSO login issue ?",
    long: `How to troubleshoot Client SSO login issue ?`,
    icon: "codeIcon",
  },
  {
    id: 3,
    sort: "How to troubleshoot join meeting failure issue ?",
    long: "How to troubleshoot join meeting failure issue ?",
    icon: "ideaIcon",
  },
  {
    id: 4,
    sort: "How to collect memlogs using diagnostic tool ?",
    long: "How to collect memlogs using diagnostic tool ?",
    icon: "ideaIcon",
  },
  {
    id: 5,
    sort: "Top Issues for this week ?",
    long: "Top Issues for this week ?",
    icon: "navigateIcon",
  },
  {
    id: 6,
    sort: "you have exceeded the rate limit (5 times during 12 hours) for trim this recording. Please try again later",
    long: "you have exceeded the rate limit (5 times during 12 hours) for trim this recording. Please try again later",
    icon: "ideaIcon",
  },
  {
    id: 7,
    sort: "How to troubleshoot Error 16 Issues ",
    long: "How to troubleshoot Error 16 Issues ",
    icon: "navigateIcon",
  },
  {
    id: 8,
    sort: "when will 6.4.10 client release ?",
    long: "when will 6.4.10 client release ?",
    icon: "ideaIcon",
  },
];
