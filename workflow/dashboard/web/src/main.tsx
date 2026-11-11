import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";
import App from "./App";
import { initPalette } from "./hooks/usePalette";

initPalette();

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

// installed app (PWA): offline page + cached build files. Only on a secure origin (https or localhost) in a production build.
if (import.meta.env.PROD && "serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
