import { apiFetch, getApiBase, setToken, clearToken, getToken } from "./api.js";

export { apiFetch, getApiBase, setToken, clearToken, getToken };

export function logout() {
  clearToken();
  try {
    sessionStorage.removeItem("discord_gate");
    sessionStorage.removeItem("discord_oauth_nonce");
  } catch {
    // Storage can be unavailable in a restrictive webview.
  }
}

export async function fetchMe() {
  return apiFetch("/me", { method: "GET" });
}

/**
 * Exchanges Telegram WebApp initData for an app JWT.
 * The backend validates the signed raw initData using TELEGRAM_BOT_TOKEN.
 */
export async function loginWithTelegram(initData) {
  const raw = String(initData || "").trim();
  if (!raw) throw new Error("TELEGRAM_INIT_DATA_MISSING");

  const payload = await apiFetch("/auth/telegram/webapp", {
    method: "POST",
    body: { initData: raw },
  });

  if (!payload?.token) throw new Error("TELEGRAM_LOGIN_FAILED");
  setToken(payload.token);
  return payload;
}
