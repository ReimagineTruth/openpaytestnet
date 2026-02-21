import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyAppTheme, getStoredAppTheme } from "./lib/appTheme";

applyAppTheme(getStoredAppTheme());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/notifications-sw.js").catch(() => {
    // Keep app running even if SW registration fails.
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Keep app running even if SW registration fails.
  });
}

createRoot(document.getElementById("root")!).render(<App />);
