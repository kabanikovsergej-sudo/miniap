import React, { useEffect, useState } from "react";
import { LoaderCircle, Send, ShieldCheck } from "lucide-react";
import { getTelegramInitData, getTelegramWebApp, isTelegramMiniApp } from "@/lib/telegram";
import { getToken, loginWithTelegram } from "@/lib/auth";

function GateCard({ icon, title, children }) {
  return (
    <div className="tma-gate">
      <div className="tma-gate__glow" aria-hidden />
      <div className="tma-gate__icon">{icon}</div>
      <h1>{title}</h1>
      <div className="tma-gate__text">{children}</div>
    </div>
  );
}

function LoadingGate() {
  return (
    <div className="tma-gate-wrap">
      <GateCard icon={<LoaderCircle className="h-7 w-7 animate-spin" />} title="Подключаем NightCoreX">
        Проверяем Telegram и загружаем твой профиль…
      </GateCard>
    </div>
  );
}

function TelegramOnlyGate() {
  return (
    <div className="tma-gate-wrap">
      <GateCard icon={<Send className="h-7 w-7" />} title="Открой в Telegram">
        Это приложение запускается внутри бота как Telegram Mini App. Вернись в чат с ботом и нажми кнопку «Открыть приложение».
      </GateCard>
    </div>
  );
}

function ErrorGate({ message }) {
  return (
    <div className="tma-gate-wrap">
      <GateCard icon={<ShieldCheck className="h-7 w-7" />} title="Не удалось войти">
        {message || "Telegram-сессия не прошла проверку. Закрой приложение и открой его ещё раз через бота."}
      </GateCard>
    </div>
  );
}

/**
 * Creates a regular NightCoreX JWT only after the server validates
 * Telegram.WebApp.initData. initDataUnsafe is never used as a trusted source.
 */
export default function TelegramGate({ children }) {
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function authenticate() {
      const initData = getTelegramInitData();
      const webApp = getTelegramWebApp();

      if (!initData || !isTelegramMiniApp()) {
        // A configured dev token lets the owner inspect responsive layout locally,
        // but production never treats browser data as authenticated Telegram data.
        const devToken = import.meta.env.DEV ? String(import.meta.env.VITE_DEV_AUTH_TOKEN || "") : "";
        if (devToken) {
          try {
            localStorage.setItem("auth_token", devToken);
            if (active) setState("ready");
            return;
          } catch {
            // Fall through to the Telegram-only screen.
          }
        }

        if (getToken() && import.meta.env.DEV) {
          if (active) setState("ready");
          return;
        }

        if (active) setState("telegram-only");
        return;
      }

      try {
        webApp?.ready?.();
        const response = await loginWithTelegram(initData);
        if (!response?.token) throw new Error("NO_TOKEN");
        if (active) setState("ready");
      } catch (error) {
        if (!active) return;
        const apiMessage = error?.data?.message || error?.message;
        setMessage(apiMessage || "Telegram-сессия не прошла проверку.");
        setState("error");
      }
    }

    authenticate();
    return () => {
      active = false;
    };
  }, []);

  if (state === "ready") return children;
  if (state === "telegram-only") return <TelegramOnlyGate />;
  if (state === "error") return <ErrorGate message={message} />;
  return <LoadingGate />;
}
