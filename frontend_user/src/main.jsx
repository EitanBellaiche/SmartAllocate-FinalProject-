import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const root = document.getElementById("root");

document.documentElement.lang = "he-IL";

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
