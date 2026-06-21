import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { setupTelegramWebApp } from "@/lib/telegram";

function Bootstrap() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
    return setupTelegramWebApp();
  }, []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);
