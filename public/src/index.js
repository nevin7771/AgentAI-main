import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./assets/css/gemini.results.css"; // Import the new Gemini styles
import "./styles/loaderFix.css"; // Import the animation fix
import App from "./App";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import store from "./store";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <Provider store={store}>
    <BrowserRouter>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </BrowserRouter>
  </Provider>
);
