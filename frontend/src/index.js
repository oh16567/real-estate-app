import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// ErrorBoundary를 쓰고 있다면 유지
import ErrorBoundary from "./components/ErrorBoundary";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  // StrictMode 제거 (이중 마운트로 인한 타이밍/TDZ 이슈 방지)
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
