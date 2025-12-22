import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// ErrorBoundary를 쓰고 있다면 유지
import ErrorBoundary from "./components/ErrorBoundary";

if (process.env.NODE_ENV === 'production') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  }
  if (window.caches) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  // StrictMode 제거 (이중 마운트로 인한 타이밍/TDZ 이슈 방지)
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
