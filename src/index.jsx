import React, { StrictMode } from "react"; // ✅ 修复：补上了 React 引入
import { createRoot } from "react-dom/client";
import App from "./App"; 

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);