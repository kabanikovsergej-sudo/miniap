// src/lib/api.js

const DEV_FALLBACK = "http://127.0.0.1:10000";
const API_URL_RAW = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE;

function normalizeBaseUrl(raw) {
  if (!raw) return "";
  let s = String(raw).trim();

  s = s.replace(/^VITE_API_URL\s*=\s*/i, "").trim();
  s = s.replace(/^VITE_API_BASE\s*=\s*/i, "").trim();
  s = s.replace(/^["']|["']$/g, "").trim();
  s = s.replace(/\/+$/g, "");

  return s;
}

export function getApiBase() {
  const normalized = normalizeBaseUrl(API_URL_RAW);

  if (normalized) return normalized;
  if (import.meta.env.DEV) return DEV_FALLBACK;

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return DEV_FALLBACK;
}

const TOKEN_KEY = "auth_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, String(token));
  } catch {}
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function handleAccessGate(status, data) {
  if (typeof window === "undefined") return;

  const h = String(window.location.hash || "");
  const onAuthScreens = h.includes("/login") || h.includes("/about");
  const err = data && (data.error || data.code || data.reason);

  if (status === 401) {
    clearToken();
    if (!onAuthScreens) {
      try { window.location.hash = "#/login"; } catch {}
    }
    return;
  }

  const discordErrors = new Set([
    "DISCORD_NOT_IN_GUILD",
    "DISCORD_LEFT",
    "DISCORD_BANNED",
  ]);

  if (status === 403 && discordErrors.has(String(err || ""))) {
    clearToken();

    try {
      const payload = {
        reason: String(err),
        join: data?.join_url || data?.joinUrl || "",
        at: Date.now(),
      };
      sessionStorage.setItem("discord_gate", JSON.stringify(payload));
    } catch {}

    if (!onAuthScreens) {
      try { window.location.hash = "#/login"; } catch {}
    }
  }
}

export async function apiFetch(path, options = {}) {
  const base = getApiBase();
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = { ...(options.headers || {}) };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // ✅ AUTO JSON FIX (главный фикс проблемы)
  if (
    options.body &&
    typeof options.body === "object" &&
    !(options.body instanceof FormData)
  ) {
    options.body = JSON.stringify(options.body);
  }

  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    handleAccessGate(res.status, data);

    const msg =
      (data && (data.error || data.message)) ||
      `API error: ${res.status}`;

    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// совместимость
export async function api(path, options = {}) {
  return apiFetch(path, options);
}
