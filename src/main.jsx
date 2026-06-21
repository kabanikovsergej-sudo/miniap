import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { setupTelegramWebApp } from "@/lib/telegram";

function Bootstrap() {
  useEffect(() => setupTelegramWebApp(), []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);
