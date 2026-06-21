import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { setupTelegram } from "./telegram.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeArticle } from "./AI/NORMALIZER.js";
import { pathToFileURL, fileURLToPath } from "node:url";
import { generateTelegramCode } from "./generateTelegramCode.js";
import { Client as DiscordClient, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType } from "discord.js";

import Stripe from "stripe";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set("trust proxy", true);
const DISCORD_OAUTH_DISABLED = process.env.DISCORD_OAUTH_DISABLED === "1";

function oauthDisabledReply(req, res) {
  // Guest-mode fallback when Discord OAuth is disabled.
  // If the desktop app passed a nonce, we can create a temporary "guest" user and hand back a JWT via /auth/discord/poll.
  const accept = String(req.headers["accept"] || "");
  const wantsHtml = accept.includes("text/html");

  const nonce = typeof req.query?.nonce === "string" ? req.query.nonce.trim() : "";

  async function createGuestAndReturn() {
    if (!nonce) return null;

    // Create a unique placeholder discord_id to satisfy DB NOT NULL + unique constraints.
    const guestDiscordId = `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const guestName = "guest";

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        discord_id: guestDiscordId,
        discord_username: guestName,
        discord_avatar: null,
      })
      .select("id, role, token_version")
      .single();

    if (error || !user?.id) {
      console.error("[guest] create user failed:", error?.message || error);
      return null;
    }

    const jwtToken = jwt.sign(
      { uid: user.id, role: user.role, tv: user.token_version },
      JWT_SIGNING_SECRET,
      { expiresIn: "30d" }
    );

    putPendingLogin(nonce, jwtToken);
    return { ok: true };
  }

  // Fire and forget (but we still await so we can show proper response)
  createGuestAndReturn()
    .then((r) => {
      if (!r) {
        if (wantsHtml) {
          return res
            .status(503)
            .send(`<!doctype html><html><head><meta charset="utf-8"/><title>Maintenance</title></head>
<body style="font-family:system-ui;background:#0b1220;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="max-width:560px;padding:24px;border:1px solid rgba(255,255,255,.15);border-radius:16px;background:rgba(255,255,255,.06)">
    <h2 style="margin:0 0 8px">Тех. работы</h2>
    <p style="margin:0;opacity:.85">Discord-вход временно отключён, и гостевой вход не смог создать сессию. Попробуйте позже.</p>
  </div>
</body></html>`);
        }
        return res.status(503).json({ error: "OAUTH_MAINTENANCE", message: "Discord OAuth temporarily disabled" });
      }

      if (wantsHtml) {
        return res
          .status(200)
          .send(`<!doctype html><html><head><meta charset="utf-8"/><title>Готово</title></head>
<body style="font-family:system-ui;background:#0b1220;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="max-width:560px;padding:24px;border:1px solid rgba(255,255,255,.15);border-radius:16px;background:rgba(255,255,255,.06)">
    <h2 style="margin:0 0 8px">Гостевой вход готов ✅</h2>
    <p style="margin:0;opacity:.85">Вернитесь в приложение — оно получит токен автоматически.</p>
  </div>
</body></html>`);
      }

      return res.status(200).json({ ok: true, mode: "guest" });
    })
    .catch((e) => {
      console.error("[guest] oauthDisabledReply failed:", e?.message || e);
      return res.status(500).json({ error: "GUEST_CREATE_FAILED" });
    });
}

// One-time OAuth code protection (prevents double exchange on refresh/duplicate callbacks)
const USED_CODE_TTL_MS = 10 * 60 * 1000;
const usedOAuthCodes = new Map(); // code -> expiresAt

function markCodeUsed(code) {
  const now = Date.now();
  usedOAuthCodes.set(code, now + USED_CODE_TTL_MS);
}

function isCodeUsed(code) {
  const now = Date.now();
  const exp = usedOAuthCodes.get(code);
  if (!exp) return false;
  if (now > exp) { usedOAuthCodes.delete(code); return false; }
  return true;
}

// Prevent concurrent exchanges for the same nonce
const inFlightNonce = new Set();


const rateBuckets = new Map();

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { count: 0, ts: now };

    if (now - bucket.ts > windowMs) {
      bucket.count = 0;
      bucket.ts = now;
    }

    bucket.count++;
    rateBuckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - bucket.ts)) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "RATE_LIMIT", retry_after: retryAfter });
    }
    next();
  };
}

/**
 * RATE LIMITING (HARDENED)
 * - /auth/discord/poll is called frequently by the desktop app while waiting for OAuth.
 * - If we rate-limit all /auth routes together, users can lock themselves out.
 *
 * Rules:
 * - poll: high limit (doesn't touch Discord)
 * - start/callback: normal limit (these can touch Discord)
 */
const authLimiter = rateLimit({ windowMs: 60_000, max: 60 });    // start/callback/etc
const pollLimiter = rateLimit({ windowMs: 60_000, max: 600 });   // frequent polling


// Apply authLimiter to /auth/* EXCEPT /auth/discord/poll
app.use("/auth", authLimiter);

app.use("/admin", rateLimit({ windowMs: 60_000, max: 60 }));



const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
if (process.env.NODE_ENV === "production" && !JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}
const JWT_SIGNING_SECRET = JWT_SECRET || "local-development-only-change-me";

/* =======================
   DISCORD OAUTH: pending login handoff (browser -> app)
   External browser can't share cookies/localStorage with Electron.
   We use a short-lived nonce:
   - App generates nonce and opens /auth/discord/start?origin=WEB&nonce=NONCE
   - After Discord callback, backend stores {token} under NONCE for a short time
   - App polls /auth/discord/poll?nonce=NONCE and receives token, then proceeds to /home
======================= */
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const pendingLogins = new Map(); // nonce -> { token, createdAt }

function putPendingLogin(nonce, token) {
  if (!nonce) return;
  pendingLogins.set(String(nonce), { token: String(token), createdAt: Date.now() });
}
function popPendingLogin(nonce) {
  if (!nonce) return null;
  const key = String(nonce);
  const v = pendingLogins.get(key);
  if (!v) return null;
  pendingLogins.delete(key);
  if (Date.now() - (v.createdAt || 0) > PENDING_LOGIN_TTL_MS) return null;
  return v.token || null;
}

// Cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingLogins.entries()) {
    if (!v || now - (v.createdAt || 0) > PENDING_LOGIN_TTL_MS) pendingLogins.delete(k);
  }
}, 30_000);
// ===== Discord env helpers (avoid ReferenceError) =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
let DISCORD_CLIENT_REF = null; // set after discord bot logs in
const DISCORD_UPDATES_CHANNEL_ID = "1452997389236310157"; // fixed channel for update notifications
const DISCORD_APP_ID = process.env.DISCORD_APP_ID || process.env.DISCORD_CLIENT_ID || "";
const DISCORD_INVITE_URL = process.env.DISCORD_INVITE_URL || "https://discord.gg/GESqaKKFty";


// Web origin for OAuth redirect fallback (when not using deep-link)
const APP_WEB_ORIGIN = String(process.env.APP_WEB_ORIGIN || process.env.WEB_ORIGIN || "");

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
}

/* =======================
   BASIC SETUP
======================= */
const CORS_ORIGINS = [
  process.env.APP_WEB_ORIGIN,
  process.env.WEB_ORIGIN,
  process.env.TELEGRAM_MINI_APP_URL,
  ...(String(process.env.CORS_ORIGINS || "").split(",")),
]
  .map((value) => String(value || "").trim())
  .filter(Boolean)
  .map((value) => {
    try { return new URL(value).origin; } catch { return value.replace(/\/+$/, ""); }
  });

app.use(cors({
  origin(origin, callback) {
    // Mobile Telegram requests come from the Mini App's own HTTPS origin.
    // With no allow-list configured we keep local development convenient.
    if (!origin || CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("CORS origin is not allowed"));
  },
  credentials: true,
}));
app.use(express.json());

// =======================
// PRICING (regional by IP/country)
// =======================
// Goal: show different currency/amounts depending on visitor country.
// Works best behind a proxy/CDN that sets a country header (e.g. Cloudflare).
// Fallbacks: geoip-lite (if installed) -> Accept-Language -> USD.

const COUNTRY_CURRENCY = {
  // CIS
  RU: "RUB",
  BY: "RUB",
  KZ: "RUB",
  UA: "UAH",

  // EU / UK
  GB: "GBP",
};

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
]);

function getClientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip =
    xf ||
    String(req.headers["x-real-ip"] || "").trim() ||
    String(req.connection?.remoteAddress || "").trim() ||
    "";
  return ip.replace(/^::ffff:/, "");
}

function getCountryFromHeaders(req) {
  const candidates = [
    req.headers["cf-ipcountry"],
    req.headers["x-vercel-ip-country"],
    req.headers["x-country-code"],
    req.headers["x-appengine-country"],
  ]
    .map((v) => String(v || "").trim().toUpperCase())
    .filter(Boolean);

  const c = candidates[0] || "";
  if (c && /^[A-Z]{2}$/.test(c)) return c;
  return "";
}

async function lookupCountryByIp(ip) {
  try {
    // Optional dependency: geoip-lite
    const mod = await import("geoip-lite").catch(() => null);
    const geoip = mod?.default || mod;
    if (!geoip?.lookup) return "";
    const r = geoip.lookup(ip);
    const cc = String(r?.country || "").toUpperCase();
    return /^[A-Z]{2}$/.test(cc) ? cc : "";
  } catch {
    return "";
  }
}

function countryFromAcceptLanguage(req) {
  const al = String(req.headers["accept-language"] || "").toLowerCase();
  // very light heuristic
  if (al.includes("ru")) return "RU";
  if (al.includes("uk") || al.includes("ua")) return "UA";
  if (al.includes("de")) return "DE";
  if (al.includes("fr")) return "FR";
  if (al.includes("es")) return "ES";
  if (al.includes("it")) return "IT";
  if (al.includes("pl")) return "PL";
  if (al.includes("pt")) return "PT";
  if (al.includes("nl")) return "NL";
  if (al.includes("sv")) return "SE";
  if (al.includes("en-gb")) return "GB";
  if (al.includes("en-us")) return "US";
  return "";
}

function currencyForCountry(country) {
  const c = String(country || "").toUpperCase();
  if (COUNTRY_CURRENCY[c]) return COUNTRY_CURRENCY[c];
  if (EU_COUNTRIES.has(c)) return "EUR";
  return "USD";
}

// ---- FX cache (USD -> target) ----
const FX_CACHE = { ts: 0, rates: {}, base: "USD" };
const FX_TTL_MS = 30 * 60 * 1000;

async function loadFxRates() {
  if (Date.now() - FX_CACHE.ts < FX_TTL_MS && FX_CACHE.rates && Object.keys(FX_CACHE.rates).length) {
    return FX_CACHE.rates;
  }

  const symbols = "RUB,UAH,EUR,GBP,CAD,AUD";
  const urls = [
    `https://api.frankfurter.app/latest?from=USD&to=${symbols}`,
    `https://api.frankfurter.dev/latest?from=USD&to=${symbols}`,
    "https://open.er-api.com/v6/latest/USD",
  ];

  let lastErr = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();

      // frankfurter
      if (j?.rates && (j.rates.RUB || j.rates.EUR)) {
        FX_CACHE.rates = j.rates;
        FX_CACHE.ts = Date.now();
        return FX_CACHE.rates;
      }

      // er-api
      if (j?.rates && (j.rates.RUB || j.rates.EUR)) {
        FX_CACHE.rates = j.rates;
        FX_CACHE.ts = Date.now();
        return FX_CACHE.rates;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr) throw lastErr;
  throw new Error("FX_LOAD_FAILED");
}

function roundByCurrency(amount, currency) {
  const cur = String(currency || "USD").toUpperCase();
  if (cur === "RUB" || cur === "UAH") return Math.round(amount); // no cents
  return Math.round(amount * 100) / 100; // 2 decimals
}

function convertUsd(usd, currency, rates) {
  const cur = String(currency || "USD").toUpperCase();
  if (cur === "USD") return roundByCurrency(usd, cur);
  const rate = Number(rates?.[cur]);
  if (!rate || !Number.isFinite(rate)) return roundByCurrency(usd, "USD"); // fallback
  return roundByCurrency(usd * rate, cur);
}

// Base prices in USD (same as on your subscription page)
const BASE_PLANS_USD = {
  "1m": { label: "1 месяц", price: 5.0, period: "мес" },
  "3m": { label: "3 месяца", price: 12.0, period: "мес", discount: 20, old: 15.0 },
  "12m": { label: "12 месяцев", price: 30.0, period: "мес", discount: 50, old: 60.0 },
};
const BASE_LIFETIME_USD = { price: 44.99, old: 180.0 };

// Public endpoint for the website
app.get("/pricing", async (req, res) => {
  try {
    const ip = getClientIp(req);
    let country = getCountryFromHeaders(req);

    if (!country && ip) country = await lookupCountryByIp(ip);
    if (!country) country = countryFromAcceptLanguage(req) || "US";

    const currency = currencyForCountry(country);
    const rates = await loadFxRates().catch(() => ({}));

    const plans = {};
    for (const [k, p] of Object.entries(BASE_PLANS_USD)) {
      plans[k] = {
        label: p.label,
        period: p.period,
        currency,
        price: convertUsd(p.price, currency, rates),
        old: p.old ? convertUsd(p.old, currency, rates) : null,
        discount: p.discount || null,
      };
    }

    const lifetime = {
      currency,
      price: convertUsd(BASE_LIFETIME_USD.price, currency, rates),
      old: convertUsd(BASE_LIFETIME_USD.old, currency, rates),
      discount: Math.round((1 - BASE_LIFETIME_USD.price / BASE_LIFETIME_USD.old) * 100),
    };

    res.json({ ok: true, country, currency, plans, lifetime });
  } catch {
    res.json({ ok: true, country: "US", currency: "USD", plans: BASE_PLANS_USD, lifetime: BASE_LIFETIME_USD });
  }
});

// =======================
// HEALTH CHECK (for Render / Uptime)
// =======================
app.get("/", (req, res) => {
  res.status(200).send("ok");
});

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


async function logAdminAction(adminId, targetUserId, action, meta = {}) {
  try {
    await supabase.from("admin_audit").insert({
      admin_id: adminId,
      target_user_id: targetUserId,
      action,
      meta,
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}


/* =======================
   AI (Gemini) + Rate Limits (DB-backed)

   Goals:
   - free: 1 countable answer / 3 hours
   - vip: 3 countable answers / 30 minutes
   - gold: 3 countable answers / 1 hour
   - admin/owner/superadmin/support: unlimited

   "Countable" means: AI actually answered; clarification / "уточните" responses do NOT spend quota.
   Bypass-proof: uses SERVER time + Supabase table (persists across app restarts, ignores PC time).
======================= */

const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();

// Load system + local KB ONLY from src/electron/backend/AI (no SERVER_KB).
// Files expected:
// - SYSTEM_INSTRUCTION.md
// - DATASET_GS_V3.jsonl
// - ARTICLES_MAP.json
// - NORMALIZER.js
const AI_DIR = path.join(__dirname, "AI");

function safeReadUtf8(p) {
  try {
    if (!p) return "";
    if (!fs.existsSync(p)) return "";
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

let AI_SYSTEM_TEXT = "";
try {
  const systemPath = path.join(AI_DIR, "SYSTEM_INSTRUCTION.md");
  AI_SYSTEM_TEXT = safeReadUtf8(systemPath).trim();
  if (AI_SYSTEM_TEXT) {
    console.log("[ai] SYSTEM_INSTRUCTION.md loaded");
  } else if (String(process.env.AI_SYSTEM_TEXT || "").trim()) {
    // fallback only if file is missing/empty
    AI_SYSTEM_TEXT = String(process.env.AI_SYSTEM_TEXT || "").trim();
    console.log("[ai] SYSTEM_INSTRUCTION.md missing -> using AI_SYSTEM_TEXT env fallback");
  } else {
    console.log("[ai] SYSTEM_INSTRUCTION.md not found/empty (system prompt is empty)");
  }
} catch (e) {
  console.error("[ai] failed to load SYSTEM_INSTRUCTION.md:", e?.message || e);
}

// Optional: articles map (can be used by client later)
let AI_ARTICLES_MAP = {};
try {
  const mp = path.join(AI_DIR, "ARTICLES_MAP.json");
  const raw = safeReadUtf8(mp);
  if (raw) {
    AI_ARTICLES_MAP = JSON.parse(raw);
    console.log("[ai] ARTICLES_MAP.json loaded");
  }
} catch (e) {
  console.error("[ai] failed to load ARTICLES_MAP.json:", e?.message || e);
}


/* =======================
   AI ROUTER (Grapeseed)
======================= */
function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSmalltalk(text) {
  const t = normText(text);
  return /^(привет|здаров|здравствуйте|хай|hello|hi|yo|как дела|че как|как ты|ку)\b/.test(t);
}

const AI_SYNONYMS = [
  ["кафнули", "каф", "наручники", "надели наручники", "скрутили", "задержали", "handcuff"],
  ["броник", "броня", "бронежилет", "vest", "armor"],
  ["встречка", "встречную", "по встречке", "на встречной", "oncoming", "wrong way"],
  ["погоня", "уходил", "скрылся", "evade", "попытка скрыться"],
  ["оружие", "ствол", "gun", "firearm", "пушка"],
  ["нападение", "ударил", "избил", "assault"],
  ["угон", "угнал", "carjacking", "stole car"],
  ["парковка", "припарковал", "остановка", "стоянка", "parking"],
  ["бордюр", "бордюре", "curb"],
  ["тротуар", "тротуаре", "sidewalk"],
];

function expandQuery(q) {
  let t = normText(q);
  for (const group of AI_SYNONYMS) {
    if (group.some((w) => t.includes(normText(w)))) {
      for (const w of group) t += " " + normText(w);
    }
  }
  return t;
}

function scoreTitle(query, title) {
  const qq = expandQuery(query).split(" ").filter((w) => w.length >= 3);
  const tt = normText(title);
  let s = 0;
  for (const w of qq) if (tt.includes(w)) s += 1;
  return s;
}

function buildCatalog(map) {
  const m = map || {};
  const out = [];

  for (const k of ["dk", "uk", "ak"]) {
    const arr = Array.isArray(m[k]) ? m[k] : [];
    for (const it of arr) {
      const law = String(it.law || it.type || "").trim() || (k === "dk" ? "ДК" : k === "uk" ? "УК" : "АК");
      const code = String(it.code || "").trim();
      const title = String(it.title || "").trim();
      if (!code || !title) continue;
      out.push({
        kind: "article",
        law,
        code,
        id: `${law} ${code}`,
        title,
        fine: it.fine ?? null,
      });
    }
  }

  const proc = m.procedure && typeof m.procedure === "object" ? m.procedure : {};
  for (const [key, val] of Object.entries(proc)) {
    const title = typeof val === "string" ? val : (val?.title || key);
    out.push({ kind: "procedure", id: `PROC:${key}`, title: String(title || key) });
  }

  return out;
}

const AI_CATALOG = buildCatalog(AI_ARTICLES_MAP);

function topCandidates(userText, n = 60) {
  return AI_CATALOG
    .map((it) => ({ it, s: scoreTitle(userText, `${it.id} ${it.title}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.it);
}

function findArticleByNormalized(law, code) {
  const l = String(law || "").trim().toUpperCase();
  const c = String(code || "").trim();
  if (!l || !c) return null;

  const key = l === "ДК" ? "dk" : l === "УК" ? "uk" : l === "АК" ? "ak" : null;
  if (!key) return null;

  const arr = Array.isArray(AI_ARTICLES_MAP?.[key]) ? AI_ARTICLES_MAP[key] : [];
  const hit = arr.find((x) => String(x.code || "").trim() === c);
  return hit ? { ...hit, law: l } : null;
}

function formatArticleAnswer(hit) {
  const law = String(hit?.law || hit?.type || "").trim() || "—";
  const code = String(hit?.code || "").trim() || "—";
  const title = String(hit?.title || "").trim() || "—";
  const fine = hit?.fine != null ? String(hit.fine) : null;
  const extra = hit?.punishment ? String(hit.punishment) : null;

  const lines = [
    `Статья: **${law} ${code}**`,
    `Нарушение: ${title}`,
    fine ? `Штраф/наказание: ${fine}` : null,
    extra ? `Дополнительно: ${extra}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

async function routeWithGemini(userText, candidates) {
  const list = (candidates || []).slice(0, 60).map((c) => `- ${c.id}: ${c.title}`).join("\n");
  const prompt = [
    "Ты — роутер по законам Grapeseed.",
    "Выбери ОДИН наиболее подходящий код из списка ниже.",
    "Если в списке нет подходящего или данных недостаточно — верни NEED_MORE_INFO и что уточнить.",
    "",
    "Формат ответа строго:",
    "CODE=<идентификатор из списка>",
    "или",
    "NEED_MORE_INFO=<вопрос к пользователю>",
    "",
    "Список:",
    list || "(пусто)",
    "",
    "Запрос пользователя:",
    String(userText || ""),
  ].join("\n").trim();

  const raw = await callGemini({ messages: [{ role: "user", content: prompt }] });
  const t = String(raw || "").trim();

  const mCode = t.match(/CODE\s*=\s*([^\n\r]+)/i);
  if (mCode) return { type: "code", value: String(mCode[1] || "").trim() };

  const mNeed = t.match(/NEED_MORE_INFO\s*=\s*([^\n\r]+)/i);
  if (mNeed) return { type: "need", value: String(mNeed[1] || "").trim() };

  const mLoose = t.match(/(ДК|УК|АК)\s*([0-9]+(?:\.[0-9]+){0,2})/i);
  if (mLoose) return { type: "code", value: `${mLoose[1].toUpperCase()} ${mLoose[2]}` };

  return { type: "unknown", value: t.slice(0, 200) };
}

// Load dataset (jsonl) for simple RAG
let AI_KB = [];
try {
  const dp = path.join(AI_DIR, "DATASET_GS_V3.jsonl");
  const raw = safeReadUtf8(dp);
  if (raw) {
    AI_KB = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
    console.log("[ai] DATASET_GS_V3.jsonl loaded:", AI_KB.length);
  }
} catch (e) {
  console.error("[ai] failed to load DATASET_GS_V3.jsonl:", e?.message || e);
}

// Normalizer (fallback if file missing)
let normalizeText = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

(async () => {
  try {
    const np = path.join(AI_DIR, "NORMALIZER.js");
    if (!fs.existsSync(np)) return;
    const mod = await import(pathToFileURL(np).href);
    const fn = mod?.default || mod?.normalize || mod;
    if (typeof fn === "function") {
      normalizeText = (s) => String(fn(String(s || "")) || "");
      console.log("[ai] NORMALIZER.js loaded");
    }
  } catch (e) {
    console.error("[ai] failed to load NORMALIZER.js:", e?.message || e);
  }
})();

function scoreDoc(query, text) {
  const q = normalizeText(query);
  const t = normalizeText(text);
  const words = q.split(/\s+/).filter((w) => w.length >= 3);
  let s = 0;
  for (const w of words) if (t.includes(w)) s += 1;
  return s;
}

function retrieveContext(userText, topK = 6, maxChars = 6000) {
  if (!AI_KB?.length) return "";
  const query = String(userText || "").trim();
  if (!query) return "";

  const scored = AI_KB
    .map((doc) => {
      const content = doc.text || doc.content || doc.body || doc.answer || "";
      return { content: String(content || ""), score: scoreDoc(query, content) };
    })
    .filter((x) => x.score > 0 && x.content)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (!scored.length) return "";

  let out = scored
    .map((x, i) => `[#${i + 1}] ${x.content}`.slice(0, 1600))
    .join("\n\n");

  if (out.length > maxChars) out = out.slice(0, maxChars);
  return out;
}

const AI_LIMITS = {
  free: { limit: 1, windowMs: 3 * 60 * 60 * 1000 },
  vip: { limit: 3, windowMs: 30 * 60 * 1000 },
  gold: { limit: 3, windowMs: 60 * 60 * 1000 },
};

function isAdminRole(role) {
  const r = String(role || "").toLowerCase();
  return ["admin", "owner", "superadmin", "support"].includes(r);
}

function bucketStartMs(nowMs, windowMs) {
  return Math.floor(nowMs / windowMs) * windowMs;
}

function isCountableAnswer(aiText) {
  const t = String(aiText || "").toLowerCase();
  // НЕ считаем, если бот просит уточнить / говорит что нет инфы / отказывает без ответа по делу
  const ignore = [
    "уточните",
    "что вы имеете ввиду",
    "что вы имеете в виду",
    "укажите кодекс",
    "ук / ак / дк",
    "в базе знаний нет",
    "информации нет",
    "не могу ответить",
    "не подскажу",
  ];
  if (ignore.some((p) => t.includes(p))) return false;

  // Считаем только если ответ хоть какой-то нормальной длины
  // (защита от пустых/ошибочных ответов)
  const letters = t.replace(/[^a-zа-я0-9]/gi, "");
  if (letters.length < 20) return false;

  return true;
}

async function getAiQuotaForUser(userId, role) {
  const now = Date.now();
  const r = String(role || "free").toLowerCase();

  if (isAdminRole(r)) {
    return { allowed: true, role: r, limit: Infinity, remaining: Infinity, resetAt: null, windowMs: 0 };
  }

  const cfg = AI_LIMITS[r] || AI_LIMITS.free;
  const startMs = bucketStartMs(now, cfg.windowMs);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(startMs + cfg.windowMs).toISOString();

  // Ensure row exists
  const { data: row, error: selErr } = await supabase
    .from("ai_usage")
    .select("user_id, bucket_start, used")
    .eq("user_id", userId)
    .eq("bucket_start", startIso)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  let used = Number(row?.used ?? 0);
  if (!row) {
    const { error: insErr } = await supabase.from("ai_usage").insert({
      user_id: userId,
      bucket_start: startIso,
      bucket_end: endIso,
      used: 0,
    });
    if (insErr) throw new Error(insErr.message);
    used = 0;
  }

  const remaining = Math.max(0, cfg.limit - used);
  const allowed = remaining > 0;
  return {
    allowed,
    role: r,
    limit: cfg.limit,
    used,
    remaining,
    resetAt: endIso,
    windowMs: cfg.windowMs,
  };
}

async function consumeAiQuota(userId, role) {
  const now = Date.now();
  const r = String(role || "free").toLowerCase();
  if (isAdminRole(r)) return { ok: true, remaining: Infinity, resetAt: null };

  const cfg = AI_LIMITS[r] || AI_LIMITS.free;
  const startMs = bucketStartMs(now, cfg.windowMs);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(startMs + cfg.windowMs).toISOString();

  // Read current
  const { data: row, error: selErr } = await supabase
    .from("ai_usage")
    .select("used")
    .eq("user_id", userId)
    .eq("bucket_start", startIso)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);

  let used = Number(row?.used ?? 0);
  if (!row) {
    const { error: insErr } = await supabase.from("ai_usage").insert({
      user_id: userId,
      bucket_start: startIso,
      bucket_end: endIso,
      used: 0,
    });
    if (insErr) throw new Error(insErr.message);
    used = 0;
  }

  if (used >= cfg.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((startMs + cfg.windowMs - now) / 1000));
    return { ok: false, retryAfterSec, resetAt: endIso, remaining: 0, limit: cfg.limit };
  }

  const nextUsed = used + 1;
  const { error: upErr } = await supabase
    .from("ai_usage")
    .update({ used: nextUsed, bucket_end: endIso })
    .eq("user_id", userId)
    .eq("bucket_start", startIso);
  if (upErr) throw new Error(upErr.message);

  return { ok: true, remaining: Math.max(0, cfg.limit - nextUsed), resetAt: endIso, limit: cfg.limit };
}

async function callGemini({ messages }) {
  if (!GEMINI_API_KEY) throw new Error("NO_GEMINI_API_KEY");
  const safeMessages = Array.isArray(messages) ? messages : [];

  // Google format
  const contents = safeMessages
    .filter((m, idx) => !(idx === 0 && m?.role === "assistant"))
    .map((m) => ({
      role: m?.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m?.content ?? "") }],
    }));

  // Put system prompt as first user message (works reliably across models)
  const finalContents = [
    { role: "user", parts: [{ text: String(AI_SYSTEM_TEXT || "").trim() }] },
    ...contents,
  ];

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(GEMINI_MODEL) +
    ":generateContent?key=" +
    encodeURIComponent(GEMINI_API_KEY);

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: finalContents }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `Gemini error (${r.status})`;
    const e = new Error(msg);
    e.status = r.status;
    e.body = data;
    throw e;
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join("") ||
    "";
  return String(text || "");
}



/* =======================
   TELEGRAM: stable per-user code
   - Code is created once (on first need / after registration)
   - last4 is stored in users.telegram_code_last4 for UI masking
======================= */
async function ensureTelegramTokenForUser(userId) {
  // 1) if token exists (not revoked), reuse it
  const { data: rows, error: selErr } = await supabase
    .from("telegram_tokens")
    .select("id, token, last4")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (selErr) throw new Error(selErr.message);

  const row = rows?.[0];
  if (row?.token) {
    if (row.last4) {
      await supabase.from("users").update({ telegram_code_last4: row.last4 }).eq("id", userId);
    }
    return { code: row.token, last4: row.last4 || null, id: row.id };
  }

  // 2) create new one-time code
  const code = generateTelegramCode(); // e.g. TG-AB12-CD34-EF56
  const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
  const last4 = String(code).replace(/[^A-Z0-9]/g, "").slice(-4);

  const { error: insErr } = await supabase.from("telegram_tokens").insert({
    user_id: userId,
    token: code,
    token_hash: sha256(code),
    last4,
  });

  if (insErr) throw new Error(insErr.message);

  await supabase.from("users").update({ telegram_code_last4: last4 }).eq("id", userId);

  return { code, last4, id: null };
}


/* =======================
   AUTH / ACCESS MIDDLEWARES
======================== */
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SIGNING_SECRET);
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }

  const uid = decoded?.uid;
  if (!uid) return res.status(401).json({ error: "INVALID_TOKEN" });

  const { data: user, error } = await supabase
    .from("users")
    .select("id, role, vip_until, token_version, banned_until")
    .eq("id", uid)
    .single();

  if (error || !user) return res.status(401).json({ error: "USER_NOT_FOUND" });

  // ban check
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    return res.status(401).json({ error: "BANNED", until: user.banned_until });
  }

  // kick check (token version)
  const tvToken = Number(decoded?.tv ?? 0);
  const tvDb = Number(user.token_version ?? 0);
  if (tvToken !== tvDb) {
    return res.status(401).json({ error: "TOKEN_REVOKED" });
  }

  // VIP expiry sync (server-time)
  const synced = await syncVipExpiry(user);

  // важно: заполняем всё, что используют другие мидлвары/роуты
  req.uid = synced.id;
  req.role = synced.role || "free";
  req.user = synced;

  next();
}

// ===== AI API =====
// GET /ai/quota  -> current remaining + resetAt
app.get("/ai/quota", requireAuth, async (req, res) => {
  try {
    const q = await getAiQuotaForUser(req.uid, req.role);
    return res.json({ ok: true, ...q });
  } catch (e) {
    console.error("[ai] quota failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "AI_QUOTA_FAILED" });
  }
});

// POST /ai/chat { messages: [{role:'user'|'assistant', content:string}, ...] }
// Counts ONLY if answer is "countable". Clarifications do not spend quota.
app.post("/ai/chat", requireAuth, async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    // 1) pre-check quota
    const q = await getAiQuotaForUser(req.uid, req.role);
    if (!q.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil((new Date(q.resetAt).getTime() - Date.now()) / 1000));
      return res.status(429).json({
        ok: false,
        error: "AI_RATE_LIMIT",
        retryAfterSec,
        resetAt: q.resetAt,
        remaining: 0,
        limit: q.limit,
        role: q.role,
      });
    }

    // 2) ask model (with local KB context from src/electron/backend/AI)

    const lastUserMsg = [...messages].reverse().find((m) => String(m?.role || "").toLowerCase() === "user")?.content || "";

    // 0) smalltalk / greetings -> friendly, no "not found"
    if (isSmalltalk(lastUserMsg)) {
      return res.json({
        ok: true,
        reply: "Привет 🙂 Я помощник по законам Grapeseed. Опиши действие или напиши код статьи (например: ДК 54).",
        spent: false,
        remaining: q.remaining,
        resetAt: q.resetAt,
        limit: q.limit,
        role: String(req.role || "free").toLowerCase(),
      });
    }

    // 1) if user already wrote a code (ДК/УК/АК) -> answer from map instantly
    try {
      const parsed = normalizeArticle(lastUserMsg);
      if (parsed?.law && parsed?.code) {
        const hit = findArticleByNormalized(parsed.law, parsed.code);
        if (hit) {
          return res.json({
            ok: true,
            reply: formatArticleAnswer(hit),
            spent: false,
            remaining: q.remaining,
            resetAt: q.resetAt,
            limit: q.limit,
            role: String(req.role || "free").toLowerCase(),
          });
        }
      }
    } catch { }

    // 2) paraphrase routing: pick best matching code via Gemini-router over top candidates
    const cands = topCandidates(lastUserMsg, 60);
    if (cands.length) {
      const routed = await routeWithGemini(lastUserMsg, cands);

      if (routed.type === "need" && routed.value) {
        return res.json({
          ok: true,
          reply: `Нужно уточнение: ${routed.value}`,
          spent: false,
          remaining: q.remaining,
          resetAt: q.resetAt,
          limit: q.limit,
          role: String(req.role || "free").toLowerCase(),
        });
      }

      if (routed.type === "code" && routed.value) {
        const v = String(routed.value).trim();

        // procedures
        if (v.toUpperCase().startsWith("PROC:")) {
          const key = v.split(":")[1] || "";
          const procVal = AI_ARTICLES_MAP?.procedure?.[key];
          if (procVal) {
            const procText = typeof procVal === "string" ? procVal : JSON.stringify(procVal, null, 2);
            return res.json({
              ok: true,
              reply: `Процедура: **${key}**\n${procText}`,
              spent: false,
              remaining: q.remaining,
              resetAt: q.resetAt,
              limit: q.limit,
              role: String(req.role || "free").toLowerCase(),
            });
          }
        }

        // articles
        const mArt = v.match(/^(ДК|УК|АК)\s*([0-9]+(?:\.[0-9]+){0,2})$/i);
        if (mArt) {
          const hit = findArticleByNormalized(mArt[1].toUpperCase(), mArt[2]);
          if (hit) {
            return res.json({
              ok: true,
              reply: formatArticleAnswer(hit),
              spent: false,
              remaining: q.remaining,
              resetAt: q.resetAt,
              limit: q.limit,
              role: String(req.role || "free").toLowerCase(),
            });
          }
        }
      }
    }

    const lastUser = [...messages].reverse().find((m) => String(m?.role || "").toLowerCase() === "user");
    const ctx = retrieveContext(lastUser?.content || "");
    const messagesForAi = ctx
      ? [
        { role: "user", content: `Контекст (локальная база знаний, используй только если релевантно):\n\n${ctx}` },
        ...messages,
      ]
      : messages;

    const reply = await callGemini({ messages: messagesForAi });

    // 3) consume only if countable
    let spent = false;
    let remaining = q.remaining;
    let resetAt = q.resetAt;
    let limit = q.limit;

    if (isCountableAnswer(reply)) {
      const c = await consumeAiQuota(req.uid, req.role);
      if (!c.ok) {
        // rare race condition: quota was consumed in parallel
        return res.status(429).json({
          ok: false,
          error: "AI_RATE_LIMIT",
          retryAfterSec: c.retryAfterSec,
          resetAt: c.resetAt,
          remaining: 0,
          limit: c.limit,
          role: String(req.role || "free").toLowerCase(),
        });
      }
      spent = true;
      remaining = c.remaining;
      resetAt = c.resetAt;
      limit = c.limit;
    }

    return res.json({
      ok: true,
      reply,
      spent,
      remaining,
      resetAt,
      limit,
      role: String(req.role || "free").toLowerCase(),
    });
  } catch (e) {
    console.error("[ai] chat failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "AI_FAILED" });
  }
});



async function getDbRoleByUid(uid) {
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return String(data?.role || "").toLowerCase();
}

function isAdminDbRole(r) {
  return ["admin", "owner", "superadmin"].includes(String(r || "").toLowerCase());
}

function isStaffDbRole(r) {
  return ["admin", "owner", "superadmin", "support"].includes(String(r || "").toLowerCase());
}

// IMPORTANT: we DO NOT trust token role for admin/staff checks,
// because tokens can be stale after role changes.
async function requireAdmin(req, res, next) {
  try {
    const uid = req.uid;
    if (!uid) return res.status(401).json({ error: "UNAUTHORIZED" });

    const dbRole = await getDbRoleByUid(uid);
    req.dbRole = dbRole;

    if (!isAdminDbRole(dbRole)) return res.status(403).json({ error: "FORBIDDEN" });
    return next();
  } catch (e) {
    console.error("[requireAdmin] failed:", e?.message || e);
    return res.status(500).json({ error: "ADMIN_CHECK_FAILED" });
  }
}

async function requireStaff(req, res, next) {
  try {
    const uid = req.uid;
    if (!uid) return res.status(401).json({ error: "UNAUTHORIZED" });

    const dbRole = await getDbRoleByUid(uid);
    req.dbRole = dbRole;

    if (!isStaffDbRole(dbRole)) return res.status(403).json({ error: "FORBIDDEN" });
    return next();
  } catch (e) {
    console.error("[requireStaff] failed:", e?.message || e);
    return res.status(500).json({ error: "STAFF_CHECK_FAILED" });
  }
}


async function requireGuildAccess(req, res, next) {
  // Discord access gate removed — Telegram-only auth
  return next();
}


// ===== VIP/GOLD expiry sync (server time) =====
// DB does NOT auto-remove VIP when vip_until passes.
// We sync on every authenticated request + in requireVipAccess.
async function syncVipExpiry(user) {
  try {
    if (!user?.id) return user;
    const role = String(user?.role || "free").toLowerCase();

    // Only time-limited VIP/GOLD should expire
    if (role !== "vip" && role !== "gold") return user;

    if (!user.vip_until) return user; // no date => treat as non-expiring (or legacy)

    const t = new Date(user.vip_until).getTime();
    if (!Number.isFinite(t)) return user;

    // Not expired yet
    if (t > Date.now()) return user;

    // Expired -> downgrade
    await supabase
      .from("users")
      .update({ role: "free", vip_until: null })
      .eq("id", user.id);

    return { ...user, role: "free", vip_until: null };
  } catch (e) {
    console.error("[vip] syncVipExpiry failed:", e?.message || e);
    return user;
  }
}


function computeVipStatus(user) {
  const role = String(user?.role || "user").toLowerCase();
  const isAdmin = ["admin", "owner", "support", "superadmin"].includes(role);
  const isGold = role === "gold";
  const isVipRole = role === "vip" || isGold;

  const vipUntil = user?.vip_until ? new Date(user.vip_until) : null;
  const vipByDate = vipUntil && !Number.isNaN(vipUntil.getTime()) ? vipUntil.getTime() > Date.now() : false;

  const vipActive = isAdmin || (isVipRole && (!vipUntil || vipByDate));

  return { role, isAdmin, isGold, vipUntil: vipUntil && !Number.isNaN(vipUntil.getTime()) ? vipUntil.toISOString() : null, vipActive };
}

async function requireVipAccess(req, res, next) {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, role, vip_until")
      .eq("id", req.uid)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    const syncedUser = await syncVipExpiry(user);
    const st = computeVipStatus(syncedUser);
    if (st.vipActive) return next();

    return res.status(403).json({ error: "VIP_REQUIRED" });
  } catch (e) {
    console.error("[access] requireVipAccess failed:", e?.message || e);
    return res.status(500).json({ error: "ACCESS_CHECK_FAILED" });
  }
}


// deprecated (we no longer store access_status/access_checked_at in DB)
async function setAccessStatusByDiscordId() { }

// member-check cache + backoff (anti-429)
const MEMBER_CHECK_CACHE = new Map();
// discordId -> { value: "active"|"left"|"banned", ts: number, cooldownUntil?: number }

const MEMBER_CACHE_TTL_MS = 60_000;       // 60s: не проверяем чаще
const MEMBER_COOLDOWN_FLOOR_MS = 30_000;  // минимум 30s после 429


async function checkMemberWithBot(discordId) {
  if (!DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN) return "active";

  const id = String(discordId || "");
  const now = Date.now();
  const cached = MEMBER_CHECK_CACHE.get(id);

  // cooldown после 429
  if (cached?.cooldownUntil && now < cached.cooldownUntil) {
    return cached.value || "active";
  }

  // TTL кэш
  if (cached?.ts && (now - cached.ts) < MEMBER_CACHE_TTL_MS) {
    return cached.value || "active";
  }

  const url = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${encodeURIComponent(id)}`;
  const r = await fetch(url, { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } });

  if (r.status === 200) {
    MEMBER_CHECK_CACHE.set(id, { value: "active", ts: now });
    return "active";
  }
  if (r.status === 404) {
    MEMBER_CHECK_CACHE.set(id, { value: "left", ts: now });
    return "left";
  }

  // 429 = rate limit: уважай Retry-After и не долби дальше
  if (r.status === 429) {
    const ra = Number(r.headers.get("retry-after") || 0);
    const waitMs = Math.max(MEMBER_COOLDOWN_FLOOR_MS, Math.ceil(ra * 1000));
    const prev = cached?.value || "active";
    MEMBER_CHECK_CACHE.set(id, { value: prev, ts: now, cooldownUntil: now + waitMs });
    console.error("[discord] member check rate-limited (429), cooldown ms:", waitMs);
    return prev; // не блокируем юзера из-за лимита
  }

  if (r.status === 403) {
    console.error("[discord] 403 on member check. Check bot is in server + intents enabled.");
    MEMBER_CHECK_CACHE.set(id, { value: "active", ts: now });
    return "active";
  }

  console.error("[discord] unexpected member check status:", r.status);
  MEMBER_CHECK_CACHE.set(id, { value: cached?.value || "active", ts: now, cooldownUntil: now + 15_000 });
  return cached?.value || "active";
}


async function tryAutoJoinGuild(discordId, userAccessToken) {
  if (!DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN) return { ok: false, reason: "missing_env" };
  if (!discordId || !userAccessToken) return { ok: false, reason: "missing_params" };

  const url = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${encodeURIComponent(discordId)}`;

  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: String(userAccessToken) }),
  });

  if (r.status === 201 || r.status === 204) return { ok: true };

  const body = await r.json().catch(() => null);
  console.error("[discord] auto-join failed", { status: r.status, body });
  return { ok: false, status: r.status, body };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}


async function registerDiscordCommands() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_APP_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !appId || !guildId) {
    console.log("[discord] commands registered: /panel, /apanel_set, /clear");
    return;
  }

  const commands = [
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Открыть админ-панель (пароль + функции)")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("clear")
      .setDescription("Очистить сообщения в текущем канале")
      .addIntegerOption((o) => o.setName("count").setDescription("Сколько последних сообщений удалить (1-100)").setMinValue(1).setMaxValue(100))
      .addIntegerOption((o) => o.setName("days").setDescription("Удалить сообщения только за последние X дней (1-14)").setMinValue(1).setMaxValue(14))
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
  console.log("[discord] /panel command registered");
}

async function upsertPinnedEmbed(channel, embed) {
  // Ищем закреплённое сообщение бота в этом канале и обновляем его.
  const pins = await channel.messages.fetchPinned();
  const mine = pins.find((msg) => msg.author?.id === channel.client.user.id);

  if (mine) {
    await mine.edit({ embeds: [embed] });
    return mine;
  }

  const msg = await channel.send({ embeds: [embed] });
  try {
    await msg.pin();
  } catch (e) {
    console.log("[discord] pin failed in #" + channel.name + ":", e?.message || e);
  }
  return msg;
}

async function upsertLastEmbed(channel, embed) {
  // Чтобы не спамить, если "закреплять" выключено: обновляем последнее сообщение бота в канале.
  const msgs = await channel.messages.fetch({ limit: 50 });
  const mine = msgs.find((m) => m.author?.id === channel.client.user.id);

  if (mine) {
    await mine.edit({ embeds: [embed] });
    return mine;
  }
  return channel.send({ embeds: [embed] });
}

async function startDiscordBot() {
  const BOT_ENABLED = String(process.env.DISCORD_BOT_ENABLED ?? "").trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(BOT_ENABLED)) {
    console.log("[discord] bot disabled (DISCORD_BOT_ENABLED)");
    return;
  }
  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    console.log("[discord] bot disabled (missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID)");
    return;
  }

  const client = new DiscordClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildBans],
    partials: [Partials.GuildMember, Partials.User],
  });

  DISCORD_CLIENT_REF = client;

  client.once("ready", async () => {
    console.log(`[discord] logged in as ${client.user?.tag || client.user?.id}`);

    // регаем /setup при старте (нужны DISCORD_APP_ID и DISCORD_GUILD_ID в .env)
    try {
      await registerDiscordCommands();
    } catch (e) {
      console.error("[discord] command register failed:", e?.message || e);
    }

    // тестовое сообщение (если указан DISCORD_TEST_CHANNEL_ID)
    const testChannelId = process.env.DISCORD_TEST_CHANNEL_ID;
    if (testChannelId) {
      try {
        const ch = await client.channels.fetch(testChannelId);
        await ch.send("✅ Бот подключён и может писать сообщения.");
      } catch (e) {
        console.error("[discord] failed to send test message:", e?.message || e);
      }
    }

    // каждые 10 сек: выкидываем из /apanel если истекло 5 минут или забрали роль/права
    setInterval(async () => {
      try {
        for (const [userId, s] of APANEL_SESSIONS.entries()) {
          if (!s || Date.now() > Number(s.expiresAtMs || 0)) {
            APANEL_SESSIONS.delete(userId);
            continue;
          }
          const gid = String(s.guildId || "");
          const guild = gid ? await client.guilds.fetch(gid).catch(() => null) : null;
          if (!guild) { APANEL_SESSIONS.delete(userId); continue; }
          const member = await guild.members.fetch(userId).catch(() => null);
          if (!member) { APANEL_SESSIONS.delete(userId); continue; }

          // проверяем админ права/роль (логика как в hasAdminAccess)
          const envRoleId = String(process.env.ADMIN_ROLE_ID || "");
          const ok =
            member.permissions?.has(PermissionFlagsBits.Administrator)
            || (envRoleId && member.roles?.cache?.has(envRoleId))
            || !!member.roles?.cache?.some((r) => String(r.name || "").toLowerCase() === "admin");

          if (!ok) APANEL_SESSIONS.delete(userId);
        }
      } catch { }
    }, 10_000);

    // каждые 20 сек: авто-разбан по таймеру (если используешь temp ban)
    setInterval(async () => {
      try {
        const nowIso = new Date().toISOString();
        const { data: rows, error } = await supabase
          .from("temp_bans")
          .select("id,guild_id,user_id")
          .lte("unban_at", nowIso)
          .is("processed_at", null)
          .limit(50);

        if (error || !rows?.length) return;

        for (const r of rows) {
          const guild = await client.guilds.fetch(String(r.guild_id)).catch(() => null);
          if (!guild) {
            await supabase.from("temp_bans").update({ processed_at: nowIso, processed_error: "no_guild" }).eq("id", r.id).catch(() => { });
            continue;
          }

          const uid = String(r.user_id);
          await guild.bans.remove(uid, "Temp ban expired").catch(async (e) => {
            await supabase.from("temp_bans").update({ processed_at: nowIso, processed_error: String(e?.message || e) }).eq("id", r.id).catch(() => { });
          });
          await supabase.from("temp_bans").update({ processed_at: nowIso }).eq("id", r.id).catch(() => { });
        }
      } catch { }
    }, 20_000);
  });


  // =======================
  // PANEL (home + modules)
  // =======================
  // In-memory state per admin user (ephemeral UI)
  const PANEL_STATE = new Map();

  // =======================
  // APANEL (password + short session)
  // =======================
  // userId -> { guildId, expiresAtMs }
  const APANEL_SESSIONS = new Map();
  // cache password hash per guild for a short time
  const APANEL_PW_CACHE = new Map(); // guildId -> { hash: string|null, cachedAtMs: number }

  function sha256Hex(s) {
    return crypto.createHash("sha256").update(String(s ?? "")).digest("hex");
  }

  async function getApanelPasswordHash(guildId) {
    const gid = String(guildId || "");
    const now = Date.now();
    const cached = APANEL_PW_CACHE.get(gid);
    if (cached && (now - cached.cachedAtMs) < 30_000) return cached.hash;

    // 1) Supabase table (preferred)
    try {
      const { data, error } = await supabase
        .from("apanel_settings")
        .select("password_hash")
        .eq("guild_id", gid)
        .maybeSingle();

      if (!error && data?.password_hash) {
        const h = String(data.password_hash).trim();
        APANEL_PW_CACHE.set(gid, { hash: h, cachedAtMs: now });
        return h;
      }
    } catch { }

    // 2) ENV fallback
    const envHash = String(process.env.APANEL_PASSWORD_HASH || "").trim();
    const envPlain = String(process.env.APANEL_PASSWORD || "").trim();
    const h2 = envHash || (envPlain ? sha256Hex(envPlain) : null);
    APANEL_PW_CACHE.set(gid, { hash: h2 || null, cachedAtMs: now });
    return h2 || null;
  }

  function apanelGrant(guildId, userId) {
    const expiresAtMs = Date.now() + 5 * 60 * 1000; // 5 minutes
    APANEL_SESSIONS.set(String(userId), { guildId: String(guildId), expiresAtMs });
  }

  function apanelRevoke(userId) {
    APANEL_SESSIONS.delete(String(userId));
  }

  function apanelIsActive(interaction) {
    const s = APANEL_SESSIONS.get(String(interaction.user.id));
    if (!s) return false;
    if (String(s.guildId) !== String(interaction.guild?.id || "")) return false;
    if (Date.now() > Number(s.expiresAtMs || 0)) return false;
    return true;
  }

  async function requireApanel(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: "Эта команда работает только на сервере.", flags: 64 }).catch(() => { });
      return false;
    }
    if (!apanelIsActive(interaction)) {
      await interaction.reply({ content: "🔒 Сессия админ-панели не активна. Открой: `/panel` и введи пароль", flags: 64 }).catch(() => { });
      return false;
    }
    if (!hasAdminAccess(interaction)) {
      apanelRevoke(interaction.user.id);
      await interaction.reply({ content: "❌ У тебя больше нет роли/прав Admin. Доступ закрыт.", flags: 64 }).catch(() => { });
      return false;
    }
    return true;
  }
  // userId -> {
  //   mode: "home" | "broadcast" | "moderation" | "vip" | "presets" | "tickets" | "automod" | "stats" | "settings",
  //   broadcast: { channelIds: string[], title: string, desc: string, pin: boolean },
  //   moderation: { targetId: string|null, action: "kick"|"ban"|"mute"|"unmute"|null },
  //   vip: { targetId: string|null, action: "give_vip"|"give_gold"|"remove_roles"|null, days: number|null },
  //   presets: { preset: "welcome"|"rules"|"download"|"news"|"links"|null, channelId: string|null, pin: boolean },
  //   tickets: { action: "create"|"close"|null, targetChannelId: string|null },
  //   automod: { antiInvite: boolean, antiSpam: boolean },
  // }

  function hasAdminAccess(interaction) {
    // 1) Discord permission "Administrator"
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;

    // 2) role id from env (optional)
    const envRoleId = String(process.env.ADMIN_ROLE_ID || "");
    const roles = interaction.member?.roles;
    if (roles?.cache) {
      if (envRoleId && roles.cache.has(envRoleId)) return true;

      // 3) role name "admin"
      const ok = roles.cache.some((r) => String(r.name || "").toLowerCase() === "admin");
      if (ok) return true;
    }
    return false;
  }

  function getState(userId) {
    if (!PANEL_STATE.has(userId)) {
      PANEL_STATE.set(userId, {
        mode: "home",
        broadcast: { channelIds: [], title: "Night Core", desc: "Напиши текст через кнопку ✍️ Текст", pin: true },
        moderation: { targetId: null, action: null },
        vip: { targetId: null, action: null, days: 30 },
        history: { discordId: null },
        logs: {},
        cleanup: { count: 50, days: null },
        automod: { antiInvite: true, antiSpam: true },
      });
    }
    return PANEL_STATE.get(userId);
  }

  function color() {
    return 0x111827;
  }

  function baseEmbed(title, desc) {
    return new EmbedBuilder().setTitle(title).setDescription(desc || "").setColor(color()).setFooter({ text: "Night Core Panel" });
  }

  function buildHomeEmbed(state) {
    const e = baseEmbed("🧩 Night Core — Панель", "Выбери раздел ниже.");
    e.addFields(
      {
        name: "Модули",
        value: `📤 Рассылка
🧑‍⚖️ Модерация
🧹 Clear
📜 Логи
👤 История
💎 VIP/GOLD`,
        inline: false
      },

      { name: "Закреплять", value: (state?.broadcast?.pin ? "✅ Да" : "❌ Нет"), inline: true }
    );
    return e;
  }

  function buildModerationEmbed(state) {
    const t = state.moderation.targetId ? `<@${state.moderation.targetId}>` : "не выбран";
    const e = baseEmbed("🧑‍⚖️ Модерация", "Выбери пользователя и действие.");
    e.addFields(
      { name: "Цель", value: t, inline: false },
      { name: "Действия", value: "👢 Kick • 🔨 Ban • 🔇 Mute (timeout) • 🔊 Unmute", inline: false }
    );
    return e;
  }

  function buildVipEmbed(state) {
    const t = state.vip.targetId ? `<@${state.vip.targetId}>` : "не выбран";
    const e = baseEmbed("💎 VIP / GOLD", "Выбери пользователя и действие с ролями + статусом в базе.");
    e.addFields(
      { name: "Цель", value: t, inline: false },
      { name: "Действия", value: "💎 Дать VIP • 🥇 Дать GOLD • 🧹 Снять VIP/GOLD", inline: false },
      { name: "Дни (если нужно)", value: state.vip.days == null ? "lifetime" : String(state.vip.days), inline: true }
    );
    return e;
  }

  function buildTicketsEmbed(state) {
    const e = baseEmbed("🎫 Тикеты", "Управление тикетами (создание — командой /ticket у пользователей).");
    e.addFields(
      { name: "Создание", value: "Пользователь пишет **/ticket** — бот создаёт приватный канал.", inline: false },
      { name: "Закрытие", value: "Внутри тикета будет кнопка «Закрыть тикет».", inline: false }
    );
    return e;
  }

  function buildAutomodEmbed(state) {
    const e = baseEmbed("🛡️ Автомод", "Переключай базовые защиты сервера.");
    e.addFields(
      { name: "Anti-Invite", value: state.automod.antiInvite ? "✅ Включено" : "❌ Выключено", inline: true },
      { name: "Anti-Spam", value: state.automod.antiSpam ? "✅ Включено" : "❌ Выключено", inline: true }
    );
    return e;
  }

  async function buildStatsEmbed(state, guild, supabase) {
    const e = baseEmbed("📊 Статистика", "Короткая сводка по серверу и базе.");
    const members = guild ? (guild.memberCount ?? null) : null;

    let vipCount = null, goldCount = null, activeCount = null;
    try {
      const r1 = await supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "vip");
      vipCount = r1?.count ?? null;
      const r2 = await supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "gold");
      goldCount = r2?.count ?? null;
      const r3 = await supabase.from("users").select("id", { count: "exact", head: true }).not("discord_id", "is", null);
      activeCount = r3?.count ?? null;
    } catch { }

    e.addFields(
      { name: "Discord members", value: members == null ? "n/a" : String(members), inline: true },
      { name: "DB active", value: activeCount == null ? "n/a" : String(activeCount), inline: true },
      { name: "VIP / GOLD", value: `${vipCount == null ? "n/a" : vipCount} / ${goldCount == null ? "n/a" : goldCount}`, inline: true }
    );
    return e;
  }

  function buildSettingsEmbed() {
    const e = baseEmbed("⚙️ Настройки", "Быстрые настройки панели/сервера.");
    e.addFields(
      { name: "Роли", value: "DISCORD_ROLE_VIP_ID, DISCORD_ROLE_GOLD_ID", inline: false },
      { name: "Тикеты", value: "TICKETS_CATEGORY_ID, SUPPORT_ROLE_ID (опц.)", inline: false },
      { name: "Логи", value: "MOD_LOG_CHANNEL_ID (опц.)", inline: false }
    );
    return e;
  }


  async function buildLogsEmbed(state, guild, supabase) {
    const e = baseEmbed("🧾 Логи", "Последние действия (admin_audit).");
    const MOD_LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID || "";
    if (MOD_LOG_CHANNEL_ID) e.addFields({ name: "Канал логов", value: `<#${MOD_LOG_CHANNEL_ID}>`, inline: false });

    try {
      const { data: rows, error } = await supabase
        .from("admin_audit")
        .select("created_at, admin_id, target_user_id, action")
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) throw new Error(error.message);

      if (!rows?.length) {
        e.setDescription("Логов пока нет.");
        return e;
      }

      const lines = rows.map((r) => {
        const t = r.created_at ? new Date(r.created_at).toLocaleString("ru-RU") : "—";
        const a = String(r.action || "—");
        const admin = r.admin_id ? String(r.admin_id).slice(0, 8) : "—";
        const target = r.target_user_id ? String(r.target_user_id).slice(0, 8) : "—";
        return `• **${a}** | ${t}\n  admin: \`${admin}\` → target: \`${target}\``;
      });

      e.setDescription(lines.join("\n"));
      return e;
    } catch (err) {
      e.setDescription("Не смог загрузить логи из базы. Проверь Supabase / таблицу admin_audit.");
      return e;
    }
  }

  async function buildHistoryEmbed(state, guild, supabase) {
    const discordId = state?.history?.discordId || null;
    const e = baseEmbed("🕘 История", discordId ? `История действий по пользователю <@${discordId}>` : "Выбери пользователя, чтобы увидеть историю действий.");

    if (!discordId) return e;

    try {
      const { data: u, error: uErr } = await supabase
        .from("users")
        .select("id, role, discord_id")
        .eq("discord_id", String(discordId))
        .maybeSingle();

      if (uErr) throw new Error(uErr.message);
      if (!u?.id) {
        e.setDescription("Этот пользователь ещё не связан с аккаунтом в приложении (нет discord_id в users).");
        return e;
      }

      const { data: rows, error } = await supabase
        .from("admin_audit")
        .select("created_at, admin_id, action, meta")
        .eq("target_user_id", u.id)
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) throw new Error(error.message);

      if (!rows?.length) {
        e.setDescription(`По <@${discordId}> пока нет записей.`);
        return e;
      }

      const lines = rows.map((r) => {
        const t = r.created_at ? new Date(r.created_at).toLocaleString("ru-RU") : "—";
        const a = String(r.action || "—");
        const admin = r.admin_id ? String(r.admin_id).slice(0, 8) : "—";
        return `• **${a}** | ${t} | admin: \`${admin}\``;
      });

      e.setDescription(lines.join("\n"));
      return e;
    } catch (err) {
      e.setDescription("Не смог загрузить историю из базы. Проверь Supabase / users / admin_audit.");
      return e;
    }
  }

  function buildCleanupEmbed(state) {
    const s = state?.cleanup || {};
    const count = Number(s.count || 50);
    const days = s.days != null ? Number(s.days) : null;

    const e = baseEmbed(
      "🧹 Clear",
      `Удаление сообщений в текущем канале.

⚠️ Discord не удаляет сообщения старше 14 дней через bulkDelete.`
    );

    e.addFields(
      { name: "Параметры", value: `count: **${count}**` + (days ? ` | days: **${days}**` : ""), inline: false },
      { name: "Как работает", value: "Нажми **Настроить / Удалить** → введи `count` (1-100) или `days` (1-14). Можно заполнить оба, тогда удалит максимум из `count`, но только за эти дни.", inline: false }
    );
    return e;
  }

  async function listTextChannelOptions(guild) {
    const chans = await guild.channels.fetch();
    const textChans = chans
      .filter((c) => c && c.type === ChannelType.GuildText)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .first(25);
    return textChans.map((c) => ({ label: "#" + c.name, value: c.id }));
  }

  function homeComponents() {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("panel_nav_broadcast").setLabel("📤 Рассылка").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("panel_nav_moderation").setLabel("🧑‍⚖️ Модерация").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel_nav_vip").setLabel("💎 VIP/GOLD").setStyle(ButtonStyle.Secondary),
    );

    // Второй ряд: полезное (без автомода/тикетов/настроек)
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("panel_nav_stats").setLabel("📊 Статистика").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel_nav_logs").setLabel("🧾 Логи").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel_nav_history").setLabel("🕘 История").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel_nav_cleanup").setLabel("🧹 Clear").setStyle(ButtonStyle.Secondary),
    );

    return [row, row2];
  }

  function backRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("panel_nav_home").setLabel("⬅️ Назад").setStyle(ButtonStyle.Secondary)
    );
  }


  function broadcastComponents(state, channelOptions) {
    const s = state.broadcast;

    const templateRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("broadcast_template")
        .setPlaceholder("Шаблон (опционально)")
        .setMinValues(0)
        .setMaxValues(1)
        .addOptions(
          { label: "— Без шаблона —", value: "none" },
          { label: "👋 Welcome", value: "welcome" },
          { label: "📜 Rules", value: "rules" },
          { label: "⏬ Download", value: "download" },
          { label: "📰 News", value: "news" },
          { label: "🔗 Links", value: "links" }
        )
    );

    const row1 = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("broadcast_channels")
        .setPlaceholder("Выбери каналы для рассылки")
        .setMinValues(1)
        .setMaxValues(Math.min(10, channelOptions.length || 1))
        .addOptions(channelOptions)
    );

    const pinLabel = (state?.broadcast?.pin ? "📌 Закреп: ВКЛ" : "📌 Закреп: ВЫК");

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("broadcast_edit").setLabel("✍️ Текст").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("broadcast_preview").setLabel("👀 Превью").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("broadcast_toggle_pin").setLabel(pinLabel).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("broadcast_send").setLabel("📤 Разослать").setStyle(ButtonStyle.Success)
    );

    return [templateRow, row1, row2, backRow()];
  }

  function moderationComponents(state) {
    const targetRow = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId("mod_user_select")
        .setPlaceholder("Выбери пользователя")
        .setMinValues(1)
        .setMaxValues(1)
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("mod_kick").setLabel("👢 Kick").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("mod_ban").setLabel("🔨 Ban").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("mod_mute").setLabel("🔇 Mute").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("mod_unmute").setLabel("🔊 Unmute").setStyle(ButtonStyle.Success)
    );

    return [targetRow, row, backRow()];
  }

  function vipComponents(state) {
    const targetRow = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId("vip_user_select")
        .setPlaceholder("Выбери пользователя")
        .setMinValues(1)
        .setMaxValues(1)
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("vip_give_vip").setLabel("💎 Дать VIP").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("vip_give_gold").setLabel("🥇 Дать GOLD").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("vip_remove").setLabel("🧹 Снять роли").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("vip_set_days").setLabel("🗓️ Дни").setStyle(ButtonStyle.Secondary),
    );

    return [targetRow, row, backRow()];
  }


  function logsComponents() {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("logs_refresh").setLabel("🔄 Обновить").setStyle(ButtonStyle.Secondary),
    );
    return [row, backRow()];
  }

  function historyComponents(state) {
    const targetRow = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId("history_user_select")
        .setPlaceholder("Выбери пользователя (Discord)")
        .setMinValues(1)
        .setMaxValues(1)
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("history_refresh").setLabel("🔄 Обновить").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("history_clear_selection").setLabel("🧽 Сбросить").setStyle(ButtonStyle.Secondary),
    );

    return [targetRow, row, backRow()];
  }

  function cleanupComponents(state) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cleanup_open_modal").setLabel("🧹 Настроить / Удалить").setStyle(ButtonStyle.Danger),
    );
    return [row, backRow()];
  }

  function statsComponents() {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("stats_refresh").setLabel("🔄 Обновить").setStyle(ButtonStyle.Secondary),
    );
    return [row, backRow()];
  }
  // ---- posting helpers ----
  async function upsertPinnedEmbed(channel, embed) {
    const pins = await channel.messages.fetchPinned();
    const mine = pins.find((msg) => msg.author?.id === channel.client.user.id);
    if (mine) {
      await mine.edit({ embeds: [embed] });
      return mine;
    }
    const msg = await channel.send({ embeds: [embed] });
    try { await msg.pin(); } catch { }
    return msg;
  }

  async function upsertLastEmbed(channel, embed) {
    const msgs = await channel.messages.fetch({ limit: 50 });
    const mine = msgs.find((m) => m.author?.id === channel.client.user.id);
    if (mine) {
      await mine.edit({ embeds: [embed] });
      return mine;
    }
    return channel.send({ embeds: [embed] });
  }

  function buildPostEmbed(title, desc) {
    return new EmbedBuilder().setTitle(title || "Night Core").setDescription(desc || "").setColor(color()).setFooter({ text: "Night Core" });
  }

  function presetPayload(presetKey) {
    const mk = (title, desc) => ({ title, desc });
    switch (presetKey) {
      case "welcome": return mk("👋 Добро пожаловать в Night Core", "Начни с **#download**.\nПоддержка: **#support**\nОбновления: **#news**");
      case "rules": return mk("📜 Правила", "1) Не передавать программу третьим лицам\n2) Запрещён слив/реверс\n3) Баги — в #support\n4) Уважение в чате");
      case "download": return mk("⏬ Download", "Скачай последнюю версию в этом канале.\nЕсли что-то не работает — пиши в **#support**.");
      case "news": return mk("📰 News", "Здесь будут обновления, фиксы и анонсы.");
      case "links": return mk("🔗 Links", "🤖 Telegram-бот: @midnightalertsbot\n🆘 Support: #support\n⏬ Download: #download");
      default: return mk("Night Core", "—");
    }
  }

  // ---- DB + Discord role helpers ----
  async function logModAction(client, guild, action, targetId, byId, reason) {
    const logId = String(process.env.MOD_LOG_CHANNEL_ID || "");
    if (!logId) return;
    try {
      const ch = await client.channels.fetch(logId);
      if (!ch || ch.type !== ChannelType.GuildText) return;
      const e = new EmbedBuilder()
        .setTitle("🧑‍⚖️ Mod action: " + action)
        .setColor(color())
        .addFields(
          { name: "Target", value: targetId ? `<@${targetId}> (${targetId})` : "n/a", inline: false },
          { name: "By", value: byId ? `<@${byId}> (${byId})` : "n/a", inline: false },
          { name: "Reason", value: reason || "—", inline: false }
        )
        .setTimestamp(new Date());
      await ch.send({ embeds: [e] });
    } catch { }
  }

  async function ensureMember(guild, userId) {
    if (!guild || !userId) return null;
    try { return await guild.members.fetch(userId); } catch { return null; }
  }

  async function syncVipRoleForUser(guild, discordId, role) {
    const vipRoleId = String(process.env.DISCORD_ROLE_VIP_ID || "");
    const goldRoleId = String(process.env.DISCORD_ROLE_GOLD_ID || "");
    const m = await ensureMember(guild, discordId);
    if (!m) return { ok: false, reason: "member_not_found" };

    // role in DB: "vip" | "gold" | "user"
    try {
      if (role === "gold") {
        if (vipRoleId) await m.roles.remove(vipRoleId).catch(() => { });
        if (goldRoleId) await m.roles.add(goldRoleId).catch(() => { });
      } else if (role === "vip") {
        if (goldRoleId) await m.roles.remove(goldRoleId).catch(() => { });
        if (vipRoleId) await m.roles.add(vipRoleId).catch(() => { });
      } else {
        if (vipRoleId) await m.roles.remove(vipRoleId).catch(() => { });
        if (goldRoleId) await m.roles.remove(goldRoleId).catch(() => { });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e?.message || String(e) };
    }
  }

  async function setUserRoleInDbByDiscordId(supabase, discordId, nextRole, vipUntilIso) {
    // Find the user row first (some DBs don't have discord_id filled until first login)
    const { data: u, error: selErr } = await supabase
      .from("users")
      .select("id, role, discord_id")
      .eq("discord_id", String(discordId))
      .maybeSingle();

    if (selErr) return { ok: false, error: selErr.message };
    if (!u?.id) return { ok: false, error: "USER_NOT_LINKED" };

    const patch = { role: nextRole, updated_at: new Date().toISOString() };
    if (vipUntilIso !== undefined) patch.vip_until = vipUntilIso;

    const { error: upErr } = await supabase.from("users").update(patch).eq("id", u.id);
    if (upErr) return { ok: false, error: upErr.message };

    return { ok: true, userId: u.id };
  }

  // ---- render router ----
  async function showPanel(interaction, { update = false } = {}) {
    const state = getState(interaction.user.id);
    const guild = interaction.guild;
    const channelOptions = guild ? await listTextChannelOptions(guild) : [];

    let embed = buildHomeEmbed(state);
    let components = homeComponents();

    if (state.mode === "broadcast") {
      embed = buildBroadcastPanelEmbed(state);
      components = broadcastComponents(state, channelOptions);
    } else if (state.mode === "moderation") {
      embed = buildModerationEmbed(state);
      components = moderationComponents(state);
    } else if (state.mode === "vip") {
      embed = buildVipEmbed(state);
      components = vipComponents(state);
    } else if (state.mode === "stats") {
      embed = await buildStatsEmbed(state, guild, supabase);
      components = statsComponents();
    } else if (state.mode === "logs") {
      embed = await buildLogsEmbed(state, guild, supabase);
      components = logsComponents();
    } else if (state.mode === "history") {
      embed = await buildHistoryEmbed(state, guild, supabase);
      components = historyComponents(state);
    } else if (state.mode === "cleanup") {
      embed = buildCleanupEmbed(state);
      components = cleanupComponents(state);
    }

    const payload = { embeds: [embed], components, flags: 64 };

    if (update) {
      if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
      return interaction.update(payload);
    }

    return interaction.reply(payload);
  }

  // ---- command register: ONLY /panel ----
  async function registerDiscordCommands() {
    const token = process.env.DISCORD_BOT_TOKEN;
    const appId = process.env.DISCORD_APP_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!token || !appId || !guildId) {
      console.log("[discord] skip command register: missing DISCORD_BOT_TOKEN / DISCORD_APP_ID / DISCORD_GUILD_ID");
      return;
    }

    const commands = [
      new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Открыть админ-панель (админ)")
        .toJSON(),

      // поставить/сменить пароль (только админам)
      new SlashCommandBuilder()
        .setName("apanel_set")
        .setDescription("Задать пароль админ-панели (админ)")
        .addStringOption((o) => o.setName("password").setDescription("Новый пароль").setRequired(true))
        .toJSON(),

      // очистка сообщений (только после входа в /panel)
      new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Очистить сообщения в канале (нужен вход через /panel)")
        .addIntegerOption((o) =>
          o
            .setName("count")
            .setDescription("Сколько последних сообщений удалить (1-100)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
        .addIntegerOption((o) =>
          o
            .setName("days")
            .setDescription("Удалить сообщения за последние X дней (1-14)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(14)
        )
        .toJSON(),
    ];

    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
    console.log("[discord] /panel command registered (setup removed)");
  }

  // ---- Tickets ----
  async function createTicket(interaction) {
    const guild = interaction.guild;
    if (!guild) return { ok: false, error: "no_guild" };

    const categoryId = String(process.env.TICKETS_CATEGORY_ID || "");
    const supportRoleId = String(process.env.SUPPORT_ROLE_ID || "");
    const requesterId = interaction.user.id;

    const name = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, "").slice(0, 90);

    const overwrites = [
      { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
      { id: requesterId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"] },
    ];
    if (supportRoleId) {
      overwrites.push({ id: supportRoleId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] });
    }
    // also allow admins by default via permissions; they can see if they have Administrator

    const ch = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: categoryId || null,
      permissionOverwrites: overwrites,
      reason: "Support ticket created via panel",
    });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_close").setLabel("✅ Закрыть тикет").setStyle(ButtonStyle.Danger)
    );

    const e = new EmbedBuilder()
      .setTitle("🎫 Тикет поддержки")
      .setDescription(`Создатель: <@${requesterId}>\nОпиши проблему одним сообщением. Саппорт ответит тут.`)
      .setColor(color())
      .setTimestamp(new Date());

    await ch.send({ embeds: [e], components: [closeRow] });

    // best-effort DB link (optional table)
    try {
      await supabase.from("tickets").insert({
        channel_id: ch.id,
        creator_discord_id: requesterId,
        created_at: new Date().toISOString(),
        status: "open",
      });
    } catch { }

    return { ok: true, channelId: ch.id };
  }

  async function closeTicket(interaction) {
    const ch = interaction.channel;
    if (!ch || ch.type !== ChannelType.GuildText) return { ok: false, error: "not_text_channel" };

    try {
      await ch.send({ content: "✅ Тикет закрыт. Канал будет удалён через 10 секунд." });
    } catch { }

    // best-effort db
    try {
      await supabase.from("tickets").update({ status: "closed", closed_at: new Date().toISOString() }).eq("channel_id", ch.id);
    } catch { }

    setTimeout(async () => {
      try { await ch.delete("Ticket closed"); } catch { }
    }, 10_000);

    return { ok: true };
  }

  // ---- Automod (simple) ----
  const SPAM_BUCKET = new Map(); // userId -> { last: number, count: number }
  function isInviteLike(text) {
    const t = String(text || "").toLowerCase();
    return t.includes("discord.gg/") || t.includes("discord.com/invite/");
  }

  async function maybeAutoMod(message) {
    try {
      if (!message.guild) return;
      if (message.author?.bot) return;

      // apply only if toggles enabled at least for one admin state; keep global from env + in memory
      // We'll use a shared object on app.locals to avoid per-admin states; initialize once.
      if (!app.locals.automod) app.locals.automod = { antiInvite: true, antiSpam: true };
      const cfg = app.locals.automod;

      // Anti-invite (non-admins)
      if (cfg.antiInvite) {
        const isAdmin = message.memberPermissions?.has(PermissionFlagsBits.Administrator);
        if (!isAdmin && isInviteLike(message.content)) {
          await message.delete().catch(() => { });
          await message.channel.send({ content: `❌ ${message.author}, инвайты запрещены.` }).then(m => setTimeout(() => m.delete().catch(() => { }), 5000)).catch(() => { });
          await logModAction(message.client, message.guild, "automod_delete_invite", message.author.id, message.client.user?.id, "Invite link");
          return;
        }
      }

      // Anti-spam (simple burst)
      if (cfg.antiSpam) {
        const now = Date.now();
        const uid = message.author.id;
        const b = SPAM_BUCKET.get(uid) || { last: 0, count: 0 };
        if (now - b.last < 4000) b.count += 1;
        else b.count = 1;
        b.last = now;
        SPAM_BUCKET.set(uid, b);

        if (b.count >= 6) {
          // timeout 2 minutes
          const member = await ensureMember(message.guild, uid);
          if (member) {
            await member.timeout(2 * 60 * 1000, "AutoMod spam").catch(() => { });
          }
          await logModAction(message.client, message.guild, "automod_timeout", uid, message.client.user?.id, "Spam burst");
          b.count = 0;
          SPAM_BUCKET.set(uid, b);
        }
      }
    } catch { }
  }

  // ---- interactions ----
  client.on("messageCreate", maybeAutoMod);

  // Prevent crashes on gateway rate limit / ws errors
  client.on("error", (err) => {
    console.error("[discord] client error:", err?.name || err, err?.message || "");
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (!interaction.guild) return interaction.reply({ content: "Эта команда работает только на сервере.", flags: 64 });


        // =======================
        // CLEAR: bulk delete
        // =======================
        if (interaction.commandName === "clear") {
          if (!hasAdminAccess(interaction)) return interaction.reply({ content: "❌ Нет доступа.", flags: 64 });

          const ch = interaction.channel;
          if (!ch || ch.type !== ChannelType.GuildText) {
            return interaction.reply({ content: "Эту команду можно использовать только в текстовом канале.", flags: 64 });
          }

          const countOpt = interaction.options.getInteger("count");
          const daysOpt = interaction.options.getInteger("days");

          if (countOpt == null && daysOpt == null) {
            return interaction.reply({ content: "Укажи `count` или `days`.", flags: 64 });
          }

          const count = countOpt != null ? Math.min(100, Math.max(1, Math.floor(countOpt))) : null;
          const days = daysOpt != null ? Math.min(14, Math.max(1, Math.floor(daysOpt))) : null;

          const limit = Math.min(100, count || 100);
          const msgs = await ch.messages.fetch({ limit }).catch(() => null);
          if (!msgs) return interaction.reply({ content: "Не смог получить сообщения.", flags: 64 });

          const now = Date.now();
          const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
          const daysMs = days ? days * 24 * 60 * 60 * 1000 : null;

          const filtered = [];
          for (const m of msgs.values()) {
            const age = now - m.createdTimestamp;
            if (age > maxAgeMs) continue;
            if (daysMs != null && age > daysMs) continue;
            filtered.push(m);
          }

          const toDelete = count ? filtered.slice(0, count) : filtered;
          if (!toDelete.length) {
            return interaction.reply({ content: "Нечего удалять (или сообщения слишком старые > 14 дней).", flags: 64 });
          }

          await interaction.reply({ content: `🧹 Удаляю: ${toDelete.length}...`, flags: 64 });
          try {
            await ch.bulkDelete(toDelete, true);
          } catch (e) {
            return interaction.editReply({ content: "❌ Не смог удалить. Нужны права Manage Messages, и сообщения должны быть не старше 14 дней." });
          }

          return interaction.editReply({ content: `✅ Готово. Удалено: ${toDelete.length}` });
        }

        // =======================
        // APANEL: password -> 5 minute session
        // =======================
        if (interaction.commandName === "apanel") {
          if (!hasAdminAccess(interaction)) {
            return interaction.reply({ content: "❌ Нет доступа. Нужны права Администратор или роль Admin.", flags: 64 });
          }

          const pw = interaction.options.getString("password", true);
          const hash = await getApanelPasswordHash(interaction.guild.id);
          if (!hash) {
            return interaction.reply({
              content: "⚠️ Пароль админ-панели не задан. Админ должен выполнить: `/apanel_set <password>` (или задать APANEL_PASSWORD/APANEL_PASSWORD_HASH в .env / таблице apanel_settings).",
              flags: 64,
            });
          }
          const ok = sha256Hex(pw) === String(hash);
          if (!ok) return interaction.reply({ content: "❌ Неверный пароль.", flags: 64 });

          apanelGrant(interaction.guild.id, interaction.user.id);
          return interaction.reply({ content: "✅ Доступ открыт на 5 минут. Теперь можно: `/s`, `/kick`, `/ban`.", flags: 64 });
        }

        if (interaction.commandName === "apanel_set") {
          if (!hasAdminAccess(interaction)) {
            return interaction.reply({ content: "❌ Нет доступа. Нужны права Администратор или роль Admin.", flags: 64 });
          }
          const pw = interaction.options.getString("password", true);
          const h = sha256Hex(pw);
          const gid = String(interaction.guild.id);
          const nowIso = new Date().toISOString();
          const { error } = await supabase
            .from("apanel_settings")
            .upsert({ guild_id: gid, password_hash: h, updated_at: nowIso }, { onConflict: "guild_id" });
          if (error) {
            return interaction.reply({ content: `❌ Не смог сохранить пароль в БД: ${error.message}`, flags: 64 });
          }
          APANEL_PW_CACHE.set(gid, { hash: h, cachedAtMs: Date.now() });
          return interaction.reply({ content: "✅ Пароль админ-панели обновлён.", flags: 64 });
        }

        // =======================
        // APANEL commands
        // =======================
        if (interaction.commandName === "s") {
          if (!(await requireApanel(interaction))) return;

          const text = interaction.options.getString("text", true);
          const chOpt = interaction.options.getChannel("channel", false);
          const ch = chOpt || interaction.channel;
          if (!ch || ch.type !== ChannelType.GuildText) {
            return interaction.reply({ content: "❌ Можно писать только в текстовый канал.", flags: 64 });
          }
          await ch.send({ content: text });
          return interaction.reply({ content: `✅ Отправил в <#${ch.id}>`, flags: 64 });
        }

        if (interaction.commandName === "kick") {
          if (!(await requireApanel(interaction))) return;
          const user = interaction.options.getUser("user", true);
          const reason = interaction.options.getString("reason", false) || "—";

          const member = await ensureMember(interaction.guild, user.id);
          if (!member) return interaction.reply({ content: "❌ Не нашёл участника на сервере.", flags: 64 });

          await interaction.reply({ content: "⏳ Кикаю…", flags: 64 });
          await member.kick(`Kick via /kick (apanel): ${reason}`).catch((e) => {
            throw new Error(e?.message || String(e));
          });
          await logModAction(interaction.client, interaction.guild, "kick", user.id, interaction.user.id, reason);
          return interaction.followUp({ content: `✅ Kick: <@${user.id}>`, flags: 64 });
        }

        if (interaction.commandName === "ban") {
          if (!(await requireApanel(interaction))) return;
          const user = interaction.options.getUser("user", true);
          const minutes = interaction.options.getInteger("minutes", false);
          const reason = interaction.options.getString("reason", false) || "—";

          await interaction.reply({ content: "⏳ Баню…", flags: 64 });

          await interaction.guild.members.ban(user.id, { reason: `Ban via /ban (apanel): ${reason}` }).catch((e) => {
            throw new Error(e?.message || String(e));
          });

          // temp ban support
          if (minutes && Number(minutes) > 0) {
            const unbanAt = new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString();
            await supabase.from("temp_bans").insert({
              guild_id: String(interaction.guild.id),
              user_id: String(user.id),
              unban_at: unbanAt,
              reason,
              mod_id: String(interaction.user.id),
              created_at: new Date().toISOString(),
            }).catch(() => { });
          }

          await logModAction(interaction.client, interaction.guild, minutes && minutes > 0 ? "ban_temp" : "ban", user.id, interaction.user.id, minutes && minutes > 0 ? `${reason} (minutes=${minutes})` : reason);
          return interaction.followUp({ content: `✅ Ban: <@${user.id}>${minutes && minutes > 0 ? ` (на ${minutes} мин)` : ""}`, flags: 64 });
        }

        if (interaction.commandName === "clear") {
          if (!(await requireApanel(interaction))) return;

          const channel = interaction.channel;
          if (!channel || !channel.isTextBased?.()) {
            return interaction.reply({ content: "❌ Команда доступна только в текстовом канале.", flags: 64 });
          }

          const count = interaction.options.getInteger("count", false);
          const days = interaction.options.getInteger("days", false);

          // Приоритет: count -> days -> default 50
          if (count && Number(count) > 0) {
            await interaction.reply({ content: `⏳ Удаляю последние ${count} сообщений…`, flags: 64 });
            const deleted = await channel.bulkDelete(Number(count), true).catch(() => null);
            const n = deleted?.size ?? 0;
            return interaction.followUp({ content: `✅ Готово. Удалено: ${n}`, flags: 64 });
          }

          const useDays = days && Number(days) > 0 ? Number(days) : null;
          if (useDays && useDays > 14) {
            return interaction.reply({ content: "❌ Discord не даёт удалять bulk-ом сообщения старше 14 дней. Укажи days от 1 до 14.", flags: 64 });
          }

          const cutoffMs = useDays ? (Date.now() - useDays * 24 * 60 * 60 * 1000) : (Date.now() - 24 * 60 * 60 * 1000);
          await interaction.reply({ content: `⏳ Чищу сообщения за последние ${useDays ?? 1} дн…`, flags: 64 });

          let total = 0;
          let lastId = null;

          for (let i = 0; i < 15; i++) {
            const batch = await channel.messages.fetch({ limit: 100, before: lastId || undefined }).catch(() => null);
            if (!batch || batch.size === 0) break;

            const toDelete = [];
            for (const msg of batch.values()) {
              if (msg.pinned) continue;
              const ts = msg.createdTimestamp || 0;
              if (ts < cutoffMs) continue;
              toDelete.push(msg.id);
            }

            if (toDelete.length) {
              const del = await channel.bulkDelete(toDelete, true).catch(() => null);
              total += del?.size ?? 0;
            }

            const oldest = batch.last();
            lastId = oldest?.id;
            if (!oldest) break;

            // если дошли до сообщений старше cutoff — дальше нет смысла
            if ((oldest.createdTimestamp || 0) < cutoffMs) break;
          }

          return interaction.followUp({ content: `✅ Готово. Удалено: ${total}`, flags: 64 });
        }


        if (interaction.commandName === "panel") {
          if (!hasAdminAccess(interaction)) {
            return interaction.reply({ content: "❌ Нет доступа. Нужны права Администратор или роль Admin.", flags: 64 });
          }

          // Если сессии нет — покажем модалку для пароля (как /apanel, только внутри /panel)
          if (!apanelIsActive(interaction)) {
            const modal = new ModalBuilder()
              .setCustomId("panel_login_modal")
              .setTitle("Вход в админ‑панель");

            const pw = new TextInputBuilder()
              .setCustomId("panel_pw")
              .setLabel("Пароль")
              .setStyle(TextInputStyle.Short)
              .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(pw));
            return interaction.showModal(modal);
          }

          const state = getState(interaction.user.id);
          state.mode = "home";
          return showPanel(interaction);
        }


      }

      // NAV buttons (home/modules)
      if (interaction.isButton()) {
        if (!hasAdminAccess(interaction)) return interaction.reply({ content: "❌ Нет доступа.", flags: 64 });

        const state = getState(interaction.user.id);

        const navMap = {
          panel_nav_home: "home",
          panel_nav_broadcast: "broadcast",
          panel_nav_moderation: "moderation",
          panel_nav_vip: "vip",
          panel_nav_stats: "stats",
          panel_nav_logs: "logs",
          panel_nav_history: "history",
          panel_nav_cleanup: "cleanup",
        };

        if (navMap[interaction.customId]) {
          state.mode = navMap[interaction.customId];
          return showPanel(interaction, { update: true });
        }

        // Broadcast buttons
        if (interaction.customId === "broadcast_preview") return showPanel(interaction, { update: true });
        if (interaction.customId === "broadcast_toggle_pin") {
          state.broadcast.pin = !state.broadcast.pin;
          return showPanel(interaction, { update: true });
        }
        if (interaction.customId === "broadcast_edit") {
          const modal = new ModalBuilder().setCustomId("broadcast_modal").setTitle("Редактор рассылки");

          const titleInput = new TextInputBuilder()
            .setCustomId("m_title")
            .setLabel("Заголовок")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setValue(String(state.broadcast.title || "").slice(0, 100));

          const descInput = new TextInputBuilder()
            .setCustomId("m_desc")
            .setLabel("Текст")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
            .setValue(String(state.broadcast.desc || "").slice(0, 4000));

          modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
          return interaction.showModal(modal);
        }
        if (interaction.customId === "broadcast_send") {
          if (!state.broadcast.channelIds.length) return interaction.reply({ content: "Выбери хотя бы один канал.", flags: 64 });

          await interaction.reply({ content: "📤 Рассылаю…", flags: 64 });
          const embed = buildPostEmbed(state.broadcast.title, state.broadcast.desc);

          const results = [];
          for (const channelId of state.broadcast.channelIds) {
            try {
              const ch = await interaction.guild.channels.fetch(channelId);
              if (!ch || ch.type !== ChannelType.GuildText) { results.push(`❌ <#${channelId}> (не текстовый)`); continue; }

              if (state.broadcast.pin) await upsertPinnedEmbed(ch, embed);
              else await upsertLastEmbed(ch, embed);

              results.push(`✅ <#${channelId}>`);
            } catch (e) {
              results.push(`❌ <#${channelId}> (${e?.message || e})`);
            }
          }

          await interaction.followUp({ content: "Готово:\n" + results.join("\n"), flags: 64 });
          return;
        }

        // Moderation buttons
        if (interaction.customId === "mod_kick" || interaction.customId === "mod_ban" || interaction.customId === "mod_mute") {
          if (!state.moderation.targetId) return interaction.reply({ content: "Сначала выбери пользователя.", flags: 64 });

          const modal = new ModalBuilder().setCustomId("mod_action_modal").setTitle("Подтверждение действия");
          const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Причина (опционально)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(300);

          const durationInput = new TextInputBuilder()
            .setCustomId("minutes")
            .setLabel("Минуты (только для Mute)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(6)
            .setPlaceholder("например 10, 60, 1440");

          modal.addComponents(
            new ActionRowBuilder().addComponents(reasonInput),
            new ActionRowBuilder().addComponents(durationInput),
          );

          state.moderation.action = interaction.customId === "mod_kick" ? "kick" : interaction.customId === "mod_ban" ? "ban" : "mute";
          return interaction.showModal(modal);
        }

        if (interaction.customId === "mod_unmute") {
          if (!state.moderation.targetId) return interaction.reply({ content: "Сначала выбери пользователя.", flags: 64 });

          await interaction.reply({ content: "🔊 Снимаю мут…", flags: 64 });
          const member = await ensureMember(interaction.guild, state.moderation.targetId);
          if (!member) return interaction.followUp({ content: "❌ Не удалось найти участника на сервере.", flags: 64 });

          await member.timeout(null, "Unmute via panel").catch((e) => { throw e; });
          await logModAction(interaction.client, interaction.guild, "unmute", state.moderation.targetId, interaction.user.id, "—");
          return interaction.followUp({ content: `✅ Unmute: <@${state.moderation.targetId}>`, flags: 64 });
        }

        // VIP buttons
        if (interaction.customId === "vip_set_days") {
          const modal = new ModalBuilder().setCustomId("vip_days_modal").setTitle("Настройка дней VIP");
          const daysInput = new TextInputBuilder()
            .setCustomId("days")
            .setLabel("Дни (число) или 'lifetime'")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20)
            .setValue(state.vip.days == null ? "lifetime" : String(state.vip.days));
          modal.addComponents(new ActionRowBuilder().addComponents(daysInput));
          return interaction.showModal(modal);
        }

        if (interaction.customId === "vip_give_vip" || interaction.customId === "vip_give_gold" || interaction.customId === "vip_remove") {
          if (!state.vip.targetId) return interaction.reply({ content: "Сначала выбери пользователя.", flags: 64 });

          await interaction.reply({ content: "⏳ Применяю…", flags: 64 });

          const targetId = state.vip.targetId;
          const days = state.vip.days;
          const now = new Date();

          if (interaction.customId === "vip_remove") {
            // DB role -> user, vip_until null
            const dbRes = await setUserRoleInDbByDiscordId(supabase, targetId, "free", null);
            if (!dbRes.ok) {
              const msg = dbRes.error === "USER_NOT_LINKED"
                ? "❌ Этот пользователь ещё не привязан к базе (он должен хотя бы раз залогиниться в приложении)."
                : `❌ Ошибка БД: ${dbRes.error}`;
              return interaction.followUp({ content: msg, flags: 64 });
            }
            await syncVipRoleForUser(interaction.guild, targetId, "free");
            await logModAction(interaction.client, interaction.guild, "vip_remove", targetId, interaction.user.id, "—");
            return interaction.followUp({ content: `✅ Снял VIP/GOLD у <@${targetId}>`, flags: 64 });
          }

          const nextRole = interaction.customId === "vip_give_gold" ? "gold" : "vip";
          let vipUntilIso = null;
          if (days == null) {
            vipUntilIso = new Date("2099-12-31T00:00:00.000Z").toISOString();
          } else {
            const d = Math.max(1, Number(days || 1));
            const vipUntil = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
            vipUntilIso = vipUntil.toISOString();
          }

          const dbRes2 = await setUserRoleInDbByDiscordId(supabase, targetId, nextRole, vipUntilIso);
          if (!dbRes2.ok) {
            const msg = dbRes2.error === "USER_NOT_LINKED"
              ? "❌ Этот пользователь ещё не привязан к базе (он должен хотя бы раз залогиниться в приложении)."
              : `❌ Ошибка БД: ${dbRes2.error}`;
            return interaction.followUp({ content: msg, flags: 64 });
          }
          await syncVipRoleForUser(interaction.guild, targetId, nextRole);
          await logModAction(interaction.client, interaction.guild, `vip_set_${nextRole}`, targetId, interaction.user.id, `days=${days == null ? "lifetime" : days}`);

          return interaction.followUp({ content: `✅ Поставил **${nextRole.toUpperCase()}** для <@${targetId}> (until: ${vipUntilIso})`, flags: 64 });
        }
        // Tickets
        if (interaction.customId === "tickets_refresh") {
          await interaction.deferUpdate();
          return showPanel(interaction, { update: true });
        }


        if (interaction.customId === "ticket_close") {
          if (!hasAdminAccess(interaction)) return interaction.reply({ content: "❌ Нет доступа.", flags: 64 });
          await interaction.reply({ content: "Закрываю…", flags: 64 });
          const r = await closeTicket(interaction);
          if (!r.ok) return interaction.followUp({ content: `❌ Ошибка: ${r.error || "unknown"}`, flags: 64 });
          return;
        }

        // Automod toggles
        if (interaction.customId === "automod_toggle_invite") {
          state.automod.antiInvite = !state.automod.antiInvite;
          if (!app.locals.automod) app.locals.automod = { antiInvite: true, antiSpam: true };
          app.locals.automod.antiInvite = state.automod.antiInvite;
          return showPanel(interaction, { update: true });
        }
        if (interaction.customId === "automod_toggle_spam") {
          state.automod.antiSpam = !state.automod.antiSpam;
          if (!app.locals.automod) app.locals.automod = { antiInvite: true, antiSpam: true };
          app.locals.automod.antiSpam = state.automod.antiSpam;
          return showPanel(interaction, { update: true });
        }

        // Stats refresh
        if (interaction.customId === "stats_refresh") {
          await interaction.deferUpdate();
          return showPanel(interaction, { update: true });
        }

        // Logs
        if (interaction.customId === "logs_refresh") {
          await interaction.deferUpdate();
          return showPanel(interaction, { update: true });
        }

        // History
        if (interaction.customId === "history_refresh") {
          await interaction.deferUpdate();
          return showPanel(interaction, { update: true });
        }
        if (interaction.customId === "history_clear_selection") {
          state.history.discordId = null;
          await interaction.deferUpdate();
          return showPanel(interaction, { update: true });
        }

        // Cleanup modal
        if (interaction.customId === "cleanup_open_modal") {
          const modal = new ModalBuilder().setCustomId("cleanup_modal").setTitle("Clear сообщений");

          const countInput = new TextInputBuilder()
            .setCustomId("cleanup_count")
            .setLabel("Сколько последних сообщений удалить (1-100)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(3)
            .setValue(String(state?.cleanup?.count || 50));

          const daysInput = new TextInputBuilder()
            .setCustomId("cleanup_days")
            .setLabel("За сколько дней удалить (1-14) (опционально)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(2)
            .setValue(state?.cleanup?.days ? String(state.cleanup.days) : "");

          modal.addComponents(new ActionRowBuilder().addComponents(countInput), new ActionRowBuilder().addComponents(daysInput));
          return interaction.showModal(modal);
        }
      }

      // Select menus
      if (interaction.isStringSelectMenu()) {
        if (!hasAdminAccess(interaction)) return interaction.reply({ content: "❌ Нет доступа.", flags: 64 });

        const state = getState(interaction.user.id);


        if (interaction.customId === "broadcast_template") {
          const v = interaction.values?.[0] || "none";
          if (v && v !== "none") {
            const p = presetPayload(v);
            state.broadcast.title = p.title;
            state.broadcast.desc = p.desc;
          }
          return showPanel(interaction, { update: true });
        }

        if (interaction.customId === "broadcast_channels") {
          state.broadcast.channelIds = interaction.values || [];
          return showPanel(interaction, { update: true });
        }
      }

      if (interaction.isUserSelectMenu()) {
        if (!hasAdminAccess(interaction)) return interaction.reply({ content: "❌ Нет доступа.", flags: 64 });

        const state = getState(interaction.user.id);

        if (interaction.customId === "mod_user_select") {
          state.moderation.targetId = interaction.values?.[0] || null;
          return showPanel(interaction, { update: true });
        }

        if (interaction.customId === "vip_user_select") {
          state.vip.targetId = interaction.values?.[0] || null;
          return showPanel(interaction, { update: true });
        }

        if (interaction.customId === "history_user_select") {
          state.history.discordId = interaction.values?.[0] || null;
          return showPanel(interaction, { update: true });
        }
      }

      // Modals
      if (interaction.isModalSubmit()) {
        const state = getState(interaction.user.id);

        if (interaction.customId === "panel_login_modal") {
          if (!interaction.guild) {
            return interaction.reply({ content: "Эта команда работает только на сервере.", flags: 64 }).catch(() => { });
          }
          if (!hasAdminAccess(interaction)) {
            return interaction.reply({ content: "❌ Нет доступа. Нужны права Администратор или роль Admin.", flags: 64 }).catch(() => { });
          }

          const pw = String(interaction.fields.getTextInputValue("panel_pw") || "");
          const hash = await getApanelPasswordHash(interaction.guild.id);

          if (!hash) {
            return interaction.reply({ content: "❌ Пароль админ‑панели ещё не задан. Овнер/админ должен сделать: `/apanel_set <пароль>`", flags: 64 }).catch(() => { });
          }

          if (sha256Hex(pw) !== String(hash).trim()) {
            return interaction.reply({ content: "❌ Неверный пароль.", flags: 64 }).catch(() => { });
          }

          apanelGrant(interaction.guild.id, interaction.user.id);

          state.mode = "home";
          return showPanel(interaction);
        }

        if (interaction.customId === "broadcast_modal") {
          state.broadcast.title = String(interaction.fields.getTextInputValue("m_title") || "").slice(0, 100);
          state.broadcast.desc = String(interaction.fields.getTextInputValue("m_desc") || "").slice(0, 4000);
          await interaction.reply({ content: "✅ Текст сохранён. Жми «Разослать».", flags: 64 });
          return;
        }

        if (interaction.customId === "vip_days_modal") {
          const raw = String(interaction.fields.getTextInputValue("days") || "").trim().toLowerCase();
          if (raw === "lifetime" || raw === "∞") state.vip.days = null;
          else {
            const n = Number(raw);
            state.vip.days = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 30;
          }
          await interaction.reply({ content: `✅ Дни обновлены: ${state.vip.days == null ? "lifetime" : state.vip.days}`, flags: 64 });
          return;
        }

        if (interaction.customId === "mod_action_modal") {
          if (!hasAdminAccess(interaction)) return interaction.reply({ content: "❌ Нет доступа.", flags: 64 });

          const targetId = state.moderation.targetId;
          const action = state.moderation.action;
          const reason = String(interaction.fields.getTextInputValue("reason") || "").trim();
          const minutesRaw = String(interaction.fields.getTextInputValue("minutes") || "").trim();
          const minutes = minutesRaw ? Math.max(1, Math.min(10080, Number(minutesRaw))) : null;

          if (!targetId || !action) return interaction.reply({ content: "❌ Нет цели/действия.", flags: 64 });

          await interaction.reply({ content: "⏳ Выполняю…", flags: 64 });

          const member = await ensureMember(interaction.guild, targetId);

          if (action === "kick") {
            if (!member) return interaction.followUp({ content: "❌ Не удалось найти участника.", flags: 64 });
            await member.kick(reason || "Kick via panel").catch((e) => { throw e; });
            await setAccessStatusByDiscordId(targetId, "left");
            await logModAction(interaction.client, interaction.guild, "kick", targetId, interaction.user.id, reason);
            return interaction.followUp({ content: `✅ Kick: <@${targetId}>`, flags: 64 });
          }

          if (action === "ban") {
            await interaction.guild.members.ban(targetId, { reason: reason || "Ban via panel" }).catch((e) => { throw e; });
            await setAccessStatusByDiscordId(targetId, "banned");
            await logModAction(interaction.client, interaction.guild, "ban", targetId, interaction.user.id, reason);
            return interaction.followUp({ content: `✅ Ban: <@${targetId}>`, flags: 64 });
          }

          if (action === "mute") {
            if (!member) return interaction.followUp({ content: "❌ Не удалось найти участника.", flags: 64 });
            const mins = minutes || 10;
            await member.timeout(mins * 60 * 1000, reason || "Mute via panel").catch((e) => { throw e; });
            await logModAction(interaction.client, interaction.guild, "mute", targetId, interaction.user.id, `mins=${mins} ${reason ? "| " + reason : ""}`);
            return interaction.followUp({ content: `✅ Mute: <@${targetId}> на ${mins} мин.`, flags: 64 });
          }

          return;
        }

        if (interaction.customId === "cleanup_modal") {
          if (!hasAdminAccess(interaction)) return interaction.reply({ content: "❌ Нет доступа.", flags: 64 });

          const ch = interaction.channel;
          if (!ch || ch.type !== ChannelType.GuildText) {
            return interaction.reply({ content: "Эту операцию можно делать только в текстовом канале.", flags: 64 });
          }

          const rawCount = String(interaction.fields.getTextInputValue("cleanup_count") || "").trim();
          const rawDays = String(interaction.fields.getTextInputValue("cleanup_days") || "").trim();

          let count = rawCount ? Number(rawCount) : null;
          let days = rawDays ? Number(rawDays) : null;

          if (count == null && days == null) {
            return interaction.reply({ content: "Укажи хотя бы `count` или `days`.", flags: 64 });
          }

          if (count != null) {
            if (!Number.isFinite(count)) count = null;
            else count = Math.min(100, Math.max(1, Math.floor(count)));
          }

          if (days != null) {
            if (!Number.isFinite(days)) days = null;
            else days = Math.min(14, Math.max(1, Math.floor(days)));
          }

          const limit = Math.min(100, count || 100);
          const msgs = await ch.messages.fetch({ limit }).catch(() => null);
          if (!msgs) return interaction.reply({ content: "Не смог получить сообщения.", flags: 64 });

          const now = Date.now();
          const maxAgeMs = 14 * 24 * 60 * 60 * 1000;
          const daysMs = days ? days * 24 * 60 * 60 * 1000 : null;

          const filtered = [];
          for (const m of msgs.values()) {
            const age = now - m.createdTimestamp;
            if (age > maxAgeMs) continue; // Discord bulkDelete limitation
            if (daysMs != null && age > daysMs) continue;
            filtered.push(m);
          }

          const toDelete = count ? filtered.slice(0, count) : filtered;
          if (!toDelete.length) {
            return interaction.reply({ content: "Нечего удалять по этим параметрам (или сообщения слишком старые > 14 дней).", flags: 64 });
          }

          await interaction.reply({ content: `🧹 Удаляю: ${toDelete.length}...`, flags: 64 });
          try {
            await ch.bulkDelete(toDelete, true);
          } catch (e) {
            return interaction.editReply({ content: "❌ Не смог удалить. Проверь права бота (Manage Messages) и что сообщения не старше 14 дней." });
          }

          try {
            const MOD_LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID;
            if (MOD_LOG_CHANNEL_ID && interaction.guild) {
              const logCh = await interaction.guild.channels.fetch(MOD_LOG_CHANNEL_ID).catch(() => null);
              if (logCh && logCh.type === ChannelType.GuildText) {
                await logCh.send({
                  embeds: [baseEmbed("🧹 Clear", `Админ <@${interaction.user.id}> удалил **${toDelete.length}** сообщений в <#${ch.id}>`)]
                }).catch(() => { });
              }
            }
          } catch { }

          return;
        }
      }
    } catch (e) {
      try {
        const msg = `❌ Ошибка: ${e?.message || e}`;
        if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, flags: 64 });
        else await interaction.reply({ content: msg, flags: 64 });
      } catch { }
    }
  });

  // login MUST be last (after handlers are registered)
  await client.login(DISCORD_BOT_TOKEN);
}


/* =======================
   DISCORD OAUTH START
======================= */
// Starts Discord OAuth flow. Optional: ?origin=nightcore://... or https://your-web-app
app.get("/auth/discord/start", (req, res) => {
  if (DISCORD_OAUTH_DISABLED) return oauthDisabledReply(req, res);
  const clientId = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APP_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) return res.status(500).send("MISSING_DISCORD_OAUTH_ENV");

  // WEB origin where we'll show "Success — return to app"
  const origin = typeof req.query?.origin === "string" ? req.query.origin.trim() : "";
  // Nonce generated by the desktop app (used to hand token back via polling)
  const nonce = typeof req.query?.nonce === "string" ? req.query.nonce.trim() : "";

  let state = "";
  try {
    const payload = Buffer.from(JSON.stringify({ origin, nonce }), "utf8").toString("base64url");
    state = payload;
  } catch { }

  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify guilds.join");
  url.searchParams.set("prompt", "consent");

  if (state) url.searchParams.set("state", state);

  return res.redirect(url.toString());
});

app.get("/auth/discord/callback", async (req, res) => {
  if (DISCORD_OAUTH_DISABLED) return oauthDisabledReply(req, res);

  // IMPORTANT: declare once, use same var in try/finally
  let nonce = "";
  let origin = APP_WEB_ORIGIN;

  try {

    const { code } = req.query;
    if (!code) return res.status(400).send("NO_CODE");

    const cid = process.env.DISCORD_CLIENT_ID;
    const csec = process.env.DISCORD_CLIENT_SECRET;
    const ruri = process.env.DISCORD_REDIRECT_URI;

    if (!cid || !csec || !ruri) {
      console.error("[auth] missing oauth env", {
        hasClientId: !!cid,
        hasSecret: !!csec,
        hasRedirect: !!ruri,
      });
      return res.status(500).send("MISSING_DISCORD_OAUTH_ENV");
    }


    // Resolve origin + nonce.
// SECURITY: If APP_WEB_ORIGIN is set, we DO NOT trust/accept origin from state/query.
// This prevents attackers from forcing redirects to arbitrary sites.
origin = String(APP_WEB_ORIGIN || "").trim();
nonce = "";

try {
  if (req.query?.state) {
    const parsedState = JSON.parse(
      Buffer.from(String(req.query.state), "base64url").toString("utf8")
    );
    if (parsedState?.nonce) nonce = String(parsedState.nonce).trim();

    // Only accept origin from state if APP_WEB_ORIGIN is NOT configured.
    if (!origin && parsedState?.origin) origin = String(parsedState.origin).trim();
  }
} catch { }

// Normalize origin
try {
  origin = String(origin || "").replace(/\/+$/g, "");
} catch { }

function renderOauthErrorPage(code, extra = {}) {
      const details = (() => {
        try { return JSON.stringify(extra, null, 2); } catch { return String(extra || ""); }
      })();

      const safeTitle = String(code || "OAUTH_ERROR");
      const safeMsg = String(extra?.message || "");
      const hint = String(extra?.hint || "");

      return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; background:#0b0f1a; color:#e8ecff; margin:0; padding:24px;}
    .card{max-width:760px; margin:0 auto; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:18px;}
    h1{font-size:18px; margin:0 0 10px;}
    .muted{opacity:.75; font-size:13px; line-height:1.35;}
    pre{white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:12px; font-size:12px; margin:12px 0 0;}
    .tips{margin-top:12px; font-size:13px; line-height:1.35;}
    .tips li{margin:6px 0;}
    a{color:#9bb3ff}
  </style>
</head>
<body>
  <div class="card">
    <h1>Ошибка Discord авторизации: ${safeTitle}</h1>
    ${safeMsg ? `<div class="muted">${safeMsg}</div>` : ""}
    ${hint ? `<div class="tips"><b>Подсказка:</b> ${hint}</div>` : ""}
    <div class="tips">
      <b>Что обычно ломает обмен токена:</b>
      <ul>
        <li><b>Неверный Client Secret</b> (перегенерируй в Discord Developer Portal и обнови переменную на Render).</li>
        <li><b>Redirect URI</b> в коде и в Discord Portal не совпадают на 100% (включая https и путь).</li>
        <li>Ты открыл старую вкладку/кнопку назад — <b>code одноразовый</b> (обнови страницу и попробуй снова).</li>
        <li>Если включён режим <b>Public Client</b> — выключи его (для server-side обмена с client_secret).</li>
      </ul>
    </div>
    <pre>${details}</pre>
  </div>
</body>
</html>`;
    }
    // Prevent double-exchange of the same OAuth code (refresh/back/duplicate callback)
    if (isCodeUsed(String(code))) {
      return res
        .status(409)
        .send("OAUTH_CODE_ALREADY_USED");
    }
    markCodeUsed(String(code));

    // Prevent concurrent exchanges for the same nonce (Electron can trigger duplicate callbacks)
    if (nonce) {
      if (inFlightNonce.has(nonce)) {
        return res.status(429).send("OAUTH_IN_FLIGHT");
      }
      inFlightNonce.add(nonce);
    }

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cid,
        client_secret: csec,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: ruri,
      }),
    });
    // Discord can rate-limit OAuth token exchange (429). Do NOT retry immediately.
    if (tokenRes.status === 429) {
      const ra = tokenRes.headers.get("retry-after");
      const retryAfter = ra ? Number(ra) : 60;
      res.set("Retry-After", String(Number.isFinite(retryAfter) ? retryAfter : 60));
      return res
        .status(429)
        .type("html")
        .send(
          renderOauthErrorPage("DISCORD_RATE_LIMIT", {
            message: "Discord временно ограничил вход. Попробуйте позже.",
            hint: "Не делайте много попыток подряд. Лучше подождать 30–60 минут.",
            retry_after: retryAfter,
          })
        );
    }

    const token = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !token?.access_token) {
      console.error("[auth] token exchange failed", {
        status: tokenRes.status,
        body: token,
      });
      return res.status(401).type("html").send(renderOauthErrorPage("DISCORD_TOKEN_ERROR", {
        message: "Discord не выдал access_token при обмене code → token.",
        status: tokenRes.status,
        discord_error: token?.error || null,
        discord_error_description: token?.error_description || null,
        hint: token?.error === "invalid_client" ? "Проверь DISCORD_CLIENT_ID/SECRET и Public Client." : (token?.error === "invalid_grant" ? "Code уже использован или истёк — попробуй зайти заново." : ""),
      }));
    }

    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    const d = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !d?.id) {
      console.error("[auth] /users/@me failed", { status: meRes.status, body: d });
      return res.status(401).type("html").send(renderOauthErrorPage("DISCORD_ME_ERROR", {
        message: "Не удалось получить /users/@me по access_token.",
        status: meRes.status,
        body: d,
      }));
    }

    const discord_id = String(d.id);
    const discord_username = d.global_name || d.username || null;
    const discord_avatar = d.avatar
      ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png`
      : null;

    // Find existing user by discord_id
    const { data: existing, error: existingErr } = await supabase
      .from("users")
      .select("*")
      .eq("discord_id", discord_id)
      .maybeSingle();

    if (existingErr) {
      console.error("[auth] supabase select existing failed", existingErr);
      return res.status(500).send("DB_SELECT_FAILED");
    }

    // Gate: determine current membership in the required Discord server
    try {
      // 1) уже в сервере?
      let live = await checkMemberWithBot(discord_id);

      // 2) если нет — пробуем авто-добавить (join)
      if (live !== "active") {
        const jr = await tryAutoJoinGuild(discord_id, token.access_token);

        // Discord can be slightly eventual-consistent; give it a tiny moment before re-check.
        await new Promise((r) => setTimeout(r, 600));

        // 3) проверяем снова
        live = await checkMemberWithBot(discord_id);

        if (jr?.ok) {
          console.log("[discord] auto-join ok", { discord_id });
        } else {
          console.log("[discord] auto-join not applied", { discord_id, jr, live });
        }
      }
    } catch (e) {
      console.error("[discord] membership check/join failed during callback:", e);
      // не блокируем логин из-за ошибки гейта — просто логируем
    }

    let user;
    if (!existing) {
      const { data, error } = await supabase
        .from("users")
        .insert({
          discord_id,
          discord_username,
          discord_avatar,
        })
        .select("*")
        .single();

      if (error || !data) {
        console.error("[auth] supabase insert user failed", error);
        return res.status(500).send("DB_INSERT_FAILED");
      }
      user = data;
    } else {
      const { data, error } = await supabase
        .from("users")
        .update({
          discord_username,
          discord_avatar,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error || !data) {
        console.error("[auth] supabase update user failed", error);
        return res.status(500).send("DB_UPDATE_FAILED");
      }
      user = data;
    }


    // Ensure Telegram code exists for this account (masked last4 is stored in users).
    // Full code is still only revealable for VIP/GOLD/ADMIN via /telegram/code.
    try {
      await ensureTelegramTokenForUser(user.id);
    } catch (e) {
      console.error("[tg] ensure code failed during oauth callback:", e?.message || e);
    }

    const jwtToken = jwt.sign(
      {
        uid: user.id,
        role: user.role,
        tv: user.token_version, // важно для kick
      },
      JWT_SIGNING_SECRET,
      { expiresIn: "30d" }
    );


    // Store token for the desktop app to pick up via polling (NO auto deep-link)
    if (nonce) putPendingLogin(nonce, jwtToken);

    // Redirect to WEB success page (index.html) that shows the nice success modal.
    // index.html expects: ?auth=1 and either token or deep.
    if (origin && /^https?:\/\//i.test(origin)) {
      const webOrigin = String(origin).replace(/\/+$/g, "");
      const deep = nonce ? `nightcore://oauth?nonce=${encodeURIComponent(nonce)}` : "";
      const redirectUrl =
        `${webOrigin}/index.html?auth=1` +
        (deep ? `&deep=${encodeURIComponent(deep)}` : "") +
        (nonce ? `&nonce=${encodeURIComponent(nonce)}` : "");
      return res.redirect(redirectUrl);
    }

    return res.status(200).type("text").send("OK");
  } catch (err) {
    console.error("[auth] discord callback failed:", err);
    return res.status(500).send("CALLBACK_FAILED");
  } finally {
    if (nonce) inFlightNonce.delete(nonce);
  }
});


/* =======================
   DISCORD OAUTH: poll for token by nonce (desktop app)
======================= */
app.get("/auth/discord/poll", (req, res) => {
  const nonce = typeof req.query?.nonce === "string" ? req.query.nonce.trim() : "";
  if (!nonce) return res.status(400).json({ error: "NO_NONCE" });

  const token = popPendingLogin(nonce);
  if (!token) return res.status(204).end(); // not ready yet

  return res.json({ token });
});

/* =======================
   TELEGRAM AUTH (CODE -> JWT)
   Flow:
   - User gets a code from your Telegram bot (stored in supabase table telegram_tokens.token_hash)
   - App sends POST /auth/telegram/code { code }
   - Server returns { token }
======================= */
function normalizeTelegramCode(v) {
  // keep dashes, just trim + collapse spaces
  return String(v || "").trim().replace(/\s+/g, "");
}
function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s ?? "")).digest("hex");
}

/* =======================
   TELEGRAM MINI APP AUTH (initData -> JWT)
   `initDataUnsafe` is never trusted. We validate raw initData with the bot
   token before looking up or creating a user.
======================= */
const TELEGRAM_INITDATA_MAX_AGE_SECONDS = Math.max(
  60,
  Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS || 86_400)
);

function constantTimeHexEqual(left, right) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function verifyTelegramWebAppInitData(rawInitData) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) return { ok: false, error: "TELEGRAM_BOT_NOT_CONFIGURED" };

  try {
    const params = new URLSearchParams(String(rawInitData || ""));
    const suppliedHash = params.get("hash");
    const userRaw = params.get("user");
    const authDate = Number(params.get("auth_date"));

    if (!suppliedHash || !userRaw || !Number.isFinite(authDate)) {
      return { ok: false, error: "TELEGRAM_INITDATA_INVALID" };
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds > TELEGRAM_INITDATA_MAX_AGE_SECONDS || ageSeconds < -300) {
      return { ok: false, error: "TELEGRAM_INITDATA_EXPIRED" };
    }

    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Telegram's documented two-step HMAC: HMAC_SHA256(bot_token, "WebAppData")
    // then HMAC_SHA256(data_check_string, secret_key).
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (!constantTimeHexEqual(calculatedHash, suppliedHash)) {
      return { ok: false, error: "TELEGRAM_INITDATA_SIGNATURE" };
    }

    const user = JSON.parse(userRaw);
    if (!Number.isSafeInteger(Number(user?.id))) {
      return { ok: false, error: "TELEGRAM_USER_INVALID" };
    }

    return { ok: true, user };
  } catch (error) {
    console.warn("[auth] Telegram initData validation failed:", error?.message || error);
    return { ok: false, error: "TELEGRAM_INITDATA_INVALID" };
  }
}

function safeTelegramString(value, maxLength = 255) {
  return String(value || "").trim().slice(0, maxLength) || null;
}

async function findOrCreateTelegramMiniAppUser(telegramUser) {
  const telegramId = String(telegramUser.id);
  const guestDiscordId = `guest_tg_${telegramId}`;
  const username = safeTelegramString(telegramUser.username, 128);
  const avatarUrl = safeTelegramString(telegramUser.photo_url, 2048);
  const profilePatch = {
    telegram_chat_id: telegramId,
    telegram_username: username,
    telegram_linked_at: new Date().toISOString(),
  };
  if (avatarUrl) profilePatch.avatar_url = avatarUrl;

  let linked;
  let error;
  ({ data: linked, error } = await supabase
    .from("users")
    .select("id, role, token_version, banned_until")
    .eq("telegram_chat_id", telegramId)
    .maybeSingle());
  if (error) throw error;

  if (!linked) {
    ({ data: linked, error } = await supabase
      .from("users")
      .select("id, role, token_version, banned_until")
      .eq("discord_id", guestDiscordId)
      .maybeSingle());
    if (error) throw error;
  }

  if (linked?.id) {
    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update(profilePatch)
      .eq("id", linked.id)
      .select("id, role, token_version, banned_until")
      .single();
    if (updateError) throw updateError;
    return updated;
  }

  const { data: created, error: createError } = await supabase
    .from("users")
    .insert({
      discord_id: guestDiscordId,
      discord_username: username ? `tg:${username}` : `tg:${telegramId}`,
      role: "free",
      ...profilePatch,
    })
    .select("id, role, token_version, banned_until")
    .single();

  if (!createError && created?.id) return created;

  // A second request can race this insert. Resolve by loading the account that
  // owns the verified Telegram id instead of creating a duplicate identity.
  if (createError?.code === "23505") {
    const { data: raced, error: raceError } = await supabase
      .from("users")
      .select("id, role, token_version, banned_until")
      .eq("telegram_chat_id", telegramId)
      .maybeSingle();
    if (!raceError && raced?.id) return raced;
  }

  throw createError || new Error("TELEGRAM_USER_CREATE_FAILED");
}

app.post("/auth/telegram/webapp", async (req, res) => {
  try {
    const checked = verifyTelegramWebAppInitData(req.body?.initData);
    if (!checked.ok) {
      return res.status(401).json({ error: checked.error || "TELEGRAM_INITDATA_INVALID" });
    }

    const user = await findOrCreateTelegramMiniAppUser(checked.user);
    if (user?.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
      return res.status(401).json({ error: "BANNED", until: user.banned_until });
    }

    const token = jwt.sign(
      { uid: user.id, role: user.role || "free", tv: Number(user.token_version || 0) },
      JWT_SIGNING_SECRET,
      { expiresIn: "30d" }
    );

    return res.json({ token });
  } catch (error) {
    console.error("[auth] telegram webapp failed:", error?.message || error);
    return res.status(500).json({ error: "TELEGRAM_WEBAPP_AUTH_FAILED" });
  }
});

app.post("/auth/telegram/code", async (req, res) => {
  try {
    const raw = req.body?.code;
    const code = normalizeTelegramCode(raw);
    if (!code) return res.status(400).json({ error: "NO_CODE" });

    const codeHash = sha256Hex(code);

    const { data: rows, error: qErr } = await supabase
      .from("telegram_login_codes")
      .select("id, user_id, expires_at, used_at, revoked_at")
      .eq("code_hash", codeHash)
      .is("revoked_at", null)
      .limit(1);

    if (qErr) return res.status(500).json({ error: qErr.message });

    const row = rows?.[0];
    if (!row) return res.status(401).json({ error: "INVALID_CODE", message: "Код неверный или истёк." });

    if (row.used_at) return res.status(401).json({ error: "CODE_USED", message: "Код уже использован." });

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: "CODE_EXPIRED", message: "Код истёк. Получи новый в боте." });
    }

    const uid = String(row.user_id);

    // Load user + ban/token_version checks (same as requireAuth)
    const { data: user, error: uErr } = await supabase
      .from("users")
      .select("id, role, vip_until, token_version, banned_until")
      .eq("id", uid)
      .maybeSingle();

    if (uErr) return res.status(500).json({ error: uErr.message });
    if (!user?.id) return res.status(401).json({ error: "USER_NOT_FOUND" });

    if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
      return res.status(401).json({ error: "BANNED", until: user.banned_until });
    }

    // Mark code as used (one-time)
    await supabase.from("telegram_login_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);

    const jwtToken = jwt.sign(
      { uid: user.id, role: user.role, tv: user.token_version },
      JWT_SIGNING_SECRET,
      { expiresIn: "30d" }
    );

    return res.json({ token: jwtToken });
  } catch (e) {
    console.error("[auth] telegram code failed:", e?.message || e);
    return res.status(500).json({ error: "TELEGRAM_AUTH_FAILED" });
  }
});

/* =======================
   USER INFO

======================= */

/* =======================
   NOTIFICATIONS (in-app)
   Tables:
   - notifications: id (uuid), user_id (uuid), type (text), title (text), body (text),
                    data (jsonb), is_read (bool), created_at (timestamptz default now())
======================= */

// Create a notification row
async function createNotification({ user_id, type = "info", title = "", body = "", data = {} }) {
  const payload = {
    user_id,
    type,
    title,
    body,
    data,
    is_read: false,
  };
  const { data: row, error } = await supabase.from("notifications").insert(payload).select("*").single();
  if (error) throw error;
  return row;
}

// Fetch current user's notifications
app.get("/notifications", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10) || 20, 1), 100);

    const { data: items, error } = await supabase
      .from("notifications")
      .select("id, type, title, body, data, is_read, created_at")
      .eq("user_id", req.uid)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: items || [] });
  } catch (e) {
    res.status(500).json({ error: "NOTIFICATIONS_FETCH_FAILED" });
  }
});

// Mark one as read
app.post("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", req.uid);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "NOTIFICATION_MARK_FAILED" });
  }
});

// Mark all as read
app.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", req.uid).eq("is_read", false);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "NOTIFICATIONS_MARK_ALL_FAILED" });
  }
});

// Admin: send notification to a user (or many)
app.post("/admin/notifications/send", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { all, user_id, user_ids, type, title, body, data } = req.body || {};

    let ids = [];
    if (all === true) {
      const { data: rows, error } = await supabase.from("users").select("id");
      if (error) return res.status(500).json({ error: error.message });
      ids = (rows || []).map((r) => r.id).filter(Boolean);
    } else {
      ids = Array.isArray(user_ids) ? user_ids : user_id ? [user_id] : [];
    }

    if (!ids.length) return res.status(400).json({ error: "NO_USER_ID" });

    // Best-effort: create for each user
    let okCount = 0;
    for (const uid of ids) {
      try {
        await createNotification({ user_id: uid, type, title, body, data });
        okCount += 1;
      } catch (e) {
        console.warn("[notifications] send failed for", uid, e?.message || e);
      }
    }

    res.json({ ok: true, count: okCount, requested: ids.length });
  } catch (e) {
    res.status(500).json({ error: "NOTIFICATION_SEND_FAILED" });
  }
});




app.get("/me", requireAuth, requireGuildAccess, async (req, res) => {
  const { data: user, error } = await supabase.from("users").select("*").eq("id", req.uid).single();
  if (error) return res.status(500).json({ error: error.message });

  const syncedUser = await syncVipExpiry(user);
    const st = computeVipStatus(syncedUser);
  // Return original row + computed flags (for UI)
  res.json({
    ...user,
    role: user?.role || "free",
    vip_active: st.vipActive,
    vip_until: user?.vip_until || null,
  });
});

/* =======================
   TELEGRAM: bot/webhook (existing)
======================= */
setupTelegram(app, supabase);

/* =======================
   SERVER TIMER WATCHER -> TELEGRAM NOTIFY

   WHY:
   - Frontend timers/rentals stop when app is closed.
   - We store end_at in DB, but sending Telegram on "timer done" must happen on the server.

   HOW:
   - Every N seconds: find timers where end_at <= now AND fired=false AND running=true
   - Atomically claim them (set fired=true where fired was false)
   - For each claimed timer: if user has telegram_chat_id AND tg_notify_enabled=true -> send TG
   - Mark notified=true and running=false for successfully notified timers

   Notes:
   - Works even with multiple server instances (claim step prevents duplicates).
   - Interval can be tuned via env.
======================= */

const TIMER_SCAN_ENABLED = String(process.env.TIMER_SCAN_ENABLED || "true").toLowerCase() === "true";
const TIMER_SCAN_INTERVAL_MS = Number(process.env.TIMER_SCAN_INTERVAL_MS || 7000);
const TIMER_SCAN_BATCH = Number(process.env.TIMER_SCAN_BATCH || 200);

let _timerScanLock = false;

async function scanAndNotifyTimers() {
  if (!TIMER_SCAN_ENABLED) return;
  if (_timerScanLock) return;

  // Telegram bot not configured
  if (!app.locals.telegramSend) return;

  _timerScanLock = true;
  try {
    const nowIso = new Date().toISOString();

    // 1) Find due timers
    const { data: due, error: selErr } = await supabase
      .from("timers")
      .select("id, user_id, label, end_at")
      .lte("end_at", nowIso)
      .eq("fired", false)
      .eq("running", true)
      .order("end_at", { ascending: true })
      .limit(TIMER_SCAN_BATCH);

    if (selErr) {
      console.warn("[timers] scan select error:", selErr.message || selErr);
      return;
    }
    if (!due || due.length === 0) return;

    const ids = due.map((t) => t.id).filter(Boolean);
    if (ids.length === 0) return;

    // 2) Claim (atomic): fired=true only where fired was false
    const { data: claimed, error: claimErr } = await supabase
      .from("timers")
      .update({ fired: true })
      .in("id", ids)
      .eq("fired", false)
      .select("id, user_id, label, end_at");

    if (claimErr) {
      console.warn("[timers] claim update error:", claimErr.message || claimErr);
      return;
    }
    if (!claimed || claimed.length === 0) return;

    // 3) Fetch users in batch
    const userIds = Array.from(new Set(claimed.map((t) => t.user_id).filter(Boolean)));
    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id, telegram_chat_id, tg_notify_enabled")
      .in("id", userIds);

    if (uErr) {
      console.warn("[timers] users select error:", uErr.message || uErr);
      return;
    }

    const userMap = new Map();
    (users || []).forEach((u) => userMap.set(u.id, u));

    // 4) Send telegram and mark notified
    const notifiedIds = [];

    for (const t of claimed) {
      const u = userMap.get(t.user_id);
      const chatId = u?.telegram_chat_id;

      if (!chatId) continue;
      if (u?.tg_notify_enabled === false) continue;

      const label = String(t.label || "Таймер");
      // If label looks like a rental, show nicer title.
      const isRental = /^\s*аренда/i.test(label);
      const title = isRental ? "🏁 Аренда закончилась" : "⏰ Таймер закончился";
      const text = `${title}\n${label}`;

      const ok = await app.locals.telegramSend(chatId, text);
      if (ok) notifiedIds.push(t.id);
    }

    if (notifiedIds.length > 0) {
      const { error: nErr } = await supabase
        .from("timers")
        .update({ notified: true, running: false })
        .in("id", notifiedIds);
      if (nErr) console.warn("[timers] mark notified error:", nErr.message || nErr);
    }

    // For claimed timers without TG (not linked / disabled): just stop them
    const claimedIds = claimed.map((x) => x.id);
    const rest = claimedIds.filter((id) => !notifiedIds.includes(id));
    if (rest.length > 0) {
      const { error: stopErr } = await supabase
        .from("timers")
        .update({ running: false })
        .in("id", rest);
      if (stopErr) console.warn("[timers] stop timers error:", stopErr.message || stopErr);
    }
  } catch (e) {
    console.error("[timers] scan crash:", e?.message || e);
  } finally {
    _timerScanLock = false;
  }
}

setInterval(() => {
  scanAndNotifyTimers();
}, TIMER_SCAN_INTERVAL_MS);

// first tick right away
scanAndNotifyTimers();

/* =======================
   TELEGRAM: linking code (Generate)
======================= */
app.get("/telegram/code", requireAuth, requireGuildAccess, requireVipAccess, async (req, res) => {
  try {
    const t = await ensureTelegramTokenForUser(req.uid);
    return res.json({ ok: true, code: t.code, last4: t.last4 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "TG_CODE_FAILED" });
  }
});

app.get("/telegram/code_last4", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const { data: u, error } = await supabase
      .from("users")
      .select("telegram_code_last4")
      .eq("id", req.uid)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    let last4 = String(u?.telegram_code_last4 || "").trim();

    // self-heal: ensure token exists so UI can show mask even for FREE
    if (!last4) {
      const t = await ensureTelegramTokenForUser(req.uid);
      last4 = String(t?.last4 || "").trim();
    }

    return res.json({ ok: true, last4: last4 || "" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "TG_LAST4_FAILED" });
  }
});


/* =======================
   SETTINGS
======================= */

app.post("/api/webhook/lava", async (req, res) => {
  try {
    const secret = process.env.LAVA_WEBHOOK_SECRET || "";
    const got = String(req.headers["x-lava-secret"] || "");
    if (secret && got !== secret) return res.status(401).json({ error: "BAD_SECRET" });

    const data = req.body;
    const status = String(data?.status || "").toLowerCase();
    if (status !== "success") return res.status(200).json({ ok: true });

    const paymentId = data?.payment?.id || data?.order_id || data?.id || data?.invoice_id || null;
    if (!paymentId) return res.status(200).json({ ok: true });

    const note = `lava:${paymentId}`;

    // чтобы не создать ключ дважды
    const { data: existing, error: exErr } = await supabase
      .from("vip_keys")
      .select("code")
      .eq("note", note)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (existing?.code) return res.json({ ok: true, reused: true });

    const code = randomKey("VIP");

    const { error: insErr } = await supabase.from("vip_keys").insert({
      code,
      type: "vip",
      vip_days: 365,
      max_uses: 1,
      used_count: 0,
      expires_at: null,
      tag: "lava",
      assigned_user: null,
      note,
      created_at: new Date().toISOString(),
    });
    if (insErr) return res.status(500).json({ error: insErr.message });

    return res.json({ ok: true });
  } catch (e) {
    console.error("[LAVA] webhook error:", e);
    return res.status(500).json({ error: "WEBHOOK_FAILED" });
  }
});


app.post("/settings/telegram", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const enabled = !!req.body?.tg_notify_enabled;
    const { error } = await supabase.from("users").update({ tg_notify_enabled: enabled }).eq("id", req.uid);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, tg_notify_enabled: enabled });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "SETTINGS_FAILED" });
  }
});

app.get("/settings/telegram", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("telegram_chat_id, tg_notify_enabled, telegram_code_last4")
      .eq("id", req.uid)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({
      ok: true,
      tg_notify_enabled: user?.tg_notify_enabled !== false,
      linked: !!user?.telegram_chat_id,
      telegram_code_last4: user?.telegram_code_last4 || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "SETTINGS_GET_FAILED" });
  }
});

/* =========================================================
   VIP / GOLD KEYS SYSTEM (FIX FOR /redeem + /admin/keys)
========================================================= */

function normalizeKeyCode(s) {
  return String(s || "").trim().toUpperCase();
}

function randomKey(prefix = "VIP") {
  const part = () => crypto.randomBytes(2).toString("hex").toUpperCase(); // 4 chars
  return `${prefix}-${part()}-${part()}`;
}

function addDaysFrom(baseDate, days) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d;
}


// =======================
// STRIPE -> ISSUE KEY (for /success page)
// =======================
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// CORS helper (allow only trusted origins)
const ALLOWED_ORIGINS = new Set([
  "https://nightcorex.com",
  "https://www.nightcorex.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function setStripeCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    // no wildcard: prevents other sites from reading responses
    res.setHeader("Access-Control-Allow-Origin", "https://nightcorex.com");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// plan -> vip_days (null = lifetime)
function planToVipDays(plan) {
  const p = String(plan || "").toLowerCase();
  if (p === "1m") return 30;
  if (p === "3m") return 90;
  if (p === "12m" || p === "year") return 365;
  if (p === "lifetime" || p === "life") return null;
  return 30;
}

async function stripeGetCheckoutSession(sessionId) {
  if (!STRIPE_SECRET_KEY) throw new Error("NO_STRIPE_SECRET_KEY");

  const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Stripe error (${r.status})`);
  return data;
}
/**
 * POST /redeem { code }
 * применяет правила из vip_keys:
 * - expires_at
 * - max_uses
 * - vip_days (duration)
 * - type (vip/gold)
 */

// =======================
// STRIPE -> CLAIM KEY (for /success page)
// Frontend expects:
//   GET https://<backend>/api/claim/stripe?session_id=cs_...
// Idempotent: same session_id -> same key.
app.options("/api/claim/stripe", (req, res) => {
  setStripeCors(req, res);
  return res.sendStatus(204);
});

app.get("/api/claim/stripe", async (req, res) => {
  setStripeCors(req, res);

  try {
    const session_id = String(req.query.session_id || "").trim();
    if (!session_id) return res.status(400).json({ ok: false, error: "NO_SESSION_ID" });

    if (!stripe) {
      return res.status(500).json({ ok: false, error: "STRIPE_SECRET_MISSING" });
    }

    // 1) Verify payment
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const paid =
      String(session?.payment_status || "").toLowerCase() === "paid" ||
      String(session?.status || "").toLowerCase() === "complete";
    if (!paid) return res.status(402).json({ ok: false, error: "NOT_PAID" });


    // 2) Idempotency: already issued for this session
    const note = `stripe:${session_id}`;
    const { data: existing, error: exErr } = await supabase
      .from("vip_keys")
      .select("code, type, vip_days")
      .eq("note", note)
      .maybeSingle();

    if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
    if (existing?.code) {
      return res.json({ ok: true, key: existing.code, type: existing.type, vip_days: existing.vip_days, reused: true });
    }

    // 3) Determine plan
    const currency = String(session?.currency || "").toLowerCase();
    const amount = Number(session?.amount_total || 0);
    const PRICE_MAP = {
      "usd:500": { vip_days: 30 },
      "usd:1200": { vip_days: 90 },
      "usd:3000": { vip_days: 365 },
      "usd:4499": { vip_days: null },
      "usd:4500": { vip_days: null },
    };

    const k = `${currency}:${amount}`;
    if (!(k in PRICE_MAP)) return res.status(400).json({ ok: false, error: "BAD_AMOUNT" });
    const vip_days = PRICE_MAP[k].vip_days;


    const type = "vip";

    // 4) Generate unique key
    const prefix = type === "gold" ? "GOLD" : "VIP";
    let code = "";
    for (let i = 0; i < 12; i++) {
      const candidate = randomKey(prefix);
      const { data: exists } = await supabase
        .from("vip_keys")
        .select("code")
        .eq("code", candidate)
        .maybeSingle();
      if (!exists) { code = candidate; break; }
    }
    if (!code) code = randomKey(prefix);

    // 5) Save in DB
    const email = session?.customer_details?.email || session?.customer_email || null;

    const row = {
      code,
      type,
      vip_days,        // null => lifetime
      max_uses: 1,
      used_count: 0,
      expires_at: null,
      tag: "stripe",
      assigned_user: email,
      note,
      created_at: new Date().toISOString(),
    };

    const { error: insErr } = await supabase.from("vip_keys").insert(row);
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    return res.json({ ok: true, key: code, type, vip_days });
  } catch (e) {
    console.error("[api/claim/stripe] failed:", e);
    return res.status(500).json({ ok: false, error: "CLAIM_FAILED", detail: e?.message || String(e) });
  }
});

app.post("/redeem", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const targetDiscordIdRaw = String(req.body?.target_discord_id || req.body?.targetId || req.body?.gift_to || "").trim();

    const code = normalizeKeyCode(req.body?.code);
    if (!code) return res.status(400).json({ error: "BAD_CODE" });

    const { data: key, error: kErr } = await supabase.from("vip_keys").select("*").eq("code", code).maybeSingle();

    if (kErr) return res.status(500).json({ error: kErr.message });
    if (!key) return res.status(400).json({ error: "BAD_CODE" });

    // expiry
    if (key.expires_at) {
      const exp = new Date(key.expires_at).getTime();
      if (Number.isFinite(exp) && exp < Date.now()) {
        return res.status(400).json({ error: "CODE_EXPIRED" });
      }
    }

    // target user (gift): default = current user
    let targetUserId = req.uid;
    if (targetDiscordIdRaw) {
      const { data: t, error: tErr } = await supabase
        .from("users")
        .select("id")
        .eq("discord_id", targetDiscordIdRaw)
        .maybeSingle();

      if (tErr) return res.status(500).json({ error: tErr.message });
      if (!t) return res.status(404).json({ error: "TARGET_NOT_FOUND" });
      targetUserId = t.id;
    }

    // per-user reuse guard
    const { data: usedAlready, error: uErr } = await supabase
      .from("vip_key_uses")
      .select("id")
      .eq("code", code)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (uErr) return res.status(500).json({ error: uErr.message });
    if (usedAlready) return res.status(400).json({ error: "CODE_LIMIT" });

    // max_uses
    const maxUses = key.max_uses == null ? null : Number(key.max_uses);
    const usedCount = Number(key.used_count || 0);

    if (maxUses != null && Number.isFinite(maxUses) && maxUses > 0 && usedCount >= maxUses) {
      return res.status(400).json({ error: "CODE_LIMIT" });
    }

    // load user (role + vip_until) for target
    const { data: user, error: meErr } = await supabase
      .from("users")
      .select("id, role, vip_until")
      .eq("id", targetUserId)
      .single();

    if (meErr) return res.status(500).json({ error: meErr.message });

    const type = String(key.type || "vip").toLowerCase();
    const isAdmin = ["admin", "owner", "superadmin"].includes(String(user.role || "").toLowerCase());

    // duration
    // vip_days null => lifetime (ставим далеко)
    let nextVipUntil;
    if (key.vip_days == null) {
      nextVipUntil = new Date("2099-12-31T00:00:00.000Z");
    } else {
      const days = Math.max(1, Number(key.vip_days || 1));
      const cur = user.vip_until ? new Date(user.vip_until) : null;
      const base = cur && cur.getTime() > Date.now() ? cur : new Date();
      nextVipUntil = addDaysFrom(base, days);
    }

    // user role update
    const nextRole = isAdmin ? user.role : type === "gold" ? "gold" : "vip";

    // transactional-ish sequence (best effort):
    // 1) insert use record
    const { error: insUseErr } = await supabase.from("vip_key_uses").insert({
      code,
      user_id: targetUserId,
    });
    if (insUseErr) return res.status(500).json({ error: insUseErr.message });

    // 2) bump used_count
    const { error: bumpErr } = await supabase.from("vip_keys").update({ used_count: usedCount + 1 }).eq("code", code);
    if (bumpErr) return res.status(500).json({ error: bumpErr.message });

    // 3) update user
    const { error: upUserErr } = await supabase
      .from("users")
      .update({ vip_until: nextVipUntil.toISOString(), role: nextRole })
      .eq("id", targetUserId);
    if (upUserErr) return res.status(500).json({ error: upUserErr.message });

    // Notify user about granted role (best-effort)
    try {
      await createNotification({
        user_id: targetUserId,
        type: "role_granted",
        title: "Выдана роль",
        body: `Вам была выдана роль: ${String(nextRole).toUpperCase()}`,
        data: { role: nextRole, vip_until: nextVipUntil.toISOString(), source: "vip_key" },
      });
    } catch (e) {
      console.warn("[notifications] role_granted insert failed:", e?.message || e);
    }


    return res.json({ ok: true, code, type, vip_until: nextVipUntil.toISOString(), applied_to: targetDiscordIdRaw || "self" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "REDEEM_FAILED" });
  }
});

/**
 * ADMIN: list/create/update/delete keys
 */
app.get("/admin/keys", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("vip_keys").select("*").order("created_at", { ascending: false }).limit(800);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, keys: data || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ADMIN_KEYS_LIST_FAILED" });
  }
});

app.post("/admin/keys", requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const type = String(body.type || "vip").toLowerCase() === "gold" ? "gold" : "vip";

    // duration can come as duration/vip_days
    let vip_days = body.vip_days ?? body.duration ?? null;
    if (vip_days === "lifetime" || vip_days === "∞") vip_days = null;
    if (vip_days != null) vip_days = Math.max(1, Number(vip_days || 1));

    // max_uses can be undefined/null => unlimited
    let max_uses = body.max_uses;
    if (typeof max_uses !== "undefined") {
      max_uses = Number(max_uses);
      if (!Number.isFinite(max_uses) || max_uses < 1) max_uses = 1;
    } else {
      max_uses = null;
    }

    const expires_at = body.expires_at ? new Date(body.expires_at).toISOString() : null;

    // custom code support
    let code = normalizeKeyCode(body.custom_code || body.code || "");
    if (!code) {
      const prefix = type === "gold" ? "GOLD" : "VIP";
      // try a few times to avoid collisions
      for (let i = 0; i < 8; i++) {
        const candidate = randomKey(prefix);
        const { data: exists } = await supabase.from("vip_keys").select("code").eq("code", candidate).maybeSingle();
        if (!exists) {
          code = candidate;
          break;
        }
      }
      if (!code) code = randomKey(type === "gold" ? "GOLD" : "VIP");
    }

    const row = {
      code,
      type,
      vip_days,
      max_uses,
      used_count: 0,
      expires_at,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("vip_keys").insert(row).select("*").single();
    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, key: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ADMIN_KEYS_CREATE_FAILED" });
  }
});

app.patch("/admin/keys/:code", requireAuth, requireAdmin, async (req, res) => {
  try {
    const code = normalizeKeyCode(req.params.code);
    if (!code) return res.status(400).json({ error: "NO_CODE" });

    const body = req.body || {};
    const patch = {};

    if (typeof body.max_uses !== "undefined") {
      const v = Number(body.max_uses);
      patch.max_uses = Number.isFinite(v) && v >= 1 ? v : 1;
    }

    if (typeof body.expires_at !== "undefined") {
      patch.expires_at = body.expires_at ? new Date(body.expires_at).toISOString() : null;
    }

    if (typeof body.vip_days !== "undefined" || typeof body.duration !== "undefined") {
      let vip_days = body.vip_days ?? body.duration ?? null;
      if (vip_days === "lifetime" || vip_days === "∞") vip_days = null;
      if (vip_days != null) vip_days = Math.max(1, Number(vip_days || 1));
      patch.vip_days = vip_days;
    }

    if (typeof body.type !== "undefined") {
      patch.type = String(body.type).toLowerCase() === "gold" ? "gold" : "vip";
    }

    const { data, error } = await supabase.from("vip_keys").update(patch).eq("code", code).select("*").single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, key: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ADMIN_KEYS_UPDATE_FAILED" });
  }
});

app.patch("/admin/keys/:code/meta", requireAuth, requireAdmin, async (req, res) => {
  try {
    const code = normalizeKeyCode(req.params.code);
    if (!code) return res.status(400).json({ error: "NO_CODE" });

    const body = req.body || {};
    const tag = body.tag ?? body.tags ?? null;
    const assigned_user = body.assigned_user ?? body.assignedUser ?? body.user ?? null;
    const note = body.note ?? body.notes ?? null;

    const patch = {
      tag: tag != null ? String(tag).slice(0, 60) : null,
      assigned_user: assigned_user != null ? String(assigned_user).slice(0, 80) : null,
      note: note != null ? String(note).slice(0, 300) : null,
    };

    const { data, error } = await supabase.from("vip_keys").update(patch).eq("code", code).select("*").single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, key: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ADMIN_KEYS_META_FAILED" });
  }
});

app.delete("/admin/keys/:code", requireAuth, requireAdmin, async (req, res) => {
  try {
    const code = normalizeKeyCode(req.params.code);
    if (!code) return res.status(400).json({ error: "NO_CODE" });

    const { error } = await supabase.from("vip_keys").delete().eq("code", code);
    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ADMIN_KEYS_DELETE_FAILED" });
  }
});

/* =========================================================
   ADMIN USERS (list + edit roles/vip/telegram)
   For AdminUsers.jsx (GET /admin/users, PATCH /admin/users/:id)
========================================================= */

function normalizeRole(r) {
  const v = String(r || "").toLowerCase().trim();
  if (!v) return "free";
  if (["admin", "owner", "superadmin"].includes(v)) return "admin";
  if (["gold"].includes(v)) return "gold";
  if (["vip"].includes(v)) return "vip";
  return "free";
}

function addDaysIso(baseIso, days) {
  const n = Number(days || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  const now = Date.now();
  const base = baseIso ? new Date(baseIso).getTime() : 0;
  const start = base && base > now ? base : now;
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + Math.floor(n));
  return d.toISOString();
}

app.get("/admin/users", requireAuth, requireStaff, async (req, res) => {
  try {
    // Select only what UI needs (avoid leaking secrets)
    const { data, error } = await supabase
      .from("users")
      // include discord_username so admin UI can show real Discord name automatically
      .select("id, username, discord_id, discord_username, discord_avatar, role, vip_until, created_at, telegram_chat_id, telegram_code_last4, note, memo, internal_note")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) return res.status(500).json({ error: error.message });

    // Compatibility fields for UI (some frontends expect telegram_id instead of telegram_chat_id)
    const users = (data || []).map((u) => ({
      ...u,
      telegram_id: u.telegram_chat_id || u.telegram_id || null,
    }));

    res.json({ ok: true, users });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ADMIN_USERS_LIST_FAILED" });
  }
});

// NOTE: DELETE /admin/users/:id route is defined later with more robust FK cleanup.

app.patch("/admin/users/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ error: "BAD_ID" });

    const b = req.body || {};

    // Load current user to safely extend VIP
    const { data: cur, error: curErr } = await supabase
      .from("users")
      .select("id, role, vip_until, telegram_chat_id")
      .eq("id", id)
      .maybeSingle();

    if (curErr) return res.status(500).json({ error: curErr.message });
    if (!cur) return res.status(404).json({ error: "NOT_FOUND" });

    // SUPPORT ограничение:
    // support может ТОЛЬКО менять роль пользователя между FREE/VIP/GOLD.
    // Никаких банов/киков/удалений/изменения даты VIP/телеги/заметок/имени.
    const actorRole = String(req.dbRole || "").toLowerCase();
    if (actorRole === "support") {
      const curRole = String(cur.role || "").toLowerCase();

      // support не трогает staff/admin аккаунты
      if (["admin", "owner", "superadmin", "support"].includes(curRole)) {
        return res.status(403).json({ error: "SUPPORT_CANNOT_EDIT_STAFF" });
      }

      const nextRoleRaw = String(b.role || "").toLowerCase().trim();
      if (!["free", "vip", "gold"].includes(nextRoleRaw)) {
        return res.status(403).json({ error: "SUPPORT_CAN_ONLY_SET_FREE_VIP_GOLD" });
      }

      // если прилетели любые другие поля кроме role — режем
      const keys = Object.keys(b || {}).map((k) => String(k));
      const extraKeys = keys.filter((k) => k !== "role");
      if (extraKeys.length) {
        return res.status(403).json({ error: "SUPPORT_ROLE_ONLY" });
      }

      const allowed = {
        role: nextRoleRaw,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from("users").update(allowed).eq("id", id);
      if (upErr) return res.status(500).json({ error: upErr.message });

      const prevRole = String(cur.role || "").toLowerCase();
      const nextRole = String(allowed.role || "").toLowerCase();
      if (nextRole && nextRole !== prevRole && ["vip", "gold"].includes(nextRole)) {
        try {
          await createNotification({
            user_id: id,
            type: "role_granted",
            title: "Выдана роль",
            body: `Вам была выдана роль: ${nextRole.toUpperCase()}`,
            data: { role: nextRole, source: "staff_edit", by: req.uid },
          });
        } catch (e) {
          console.warn("[notifications] role_granted insert failed:", e?.message || e);
        }
      }

      return res.json({ ok: true, user: { id, ...allowed } });
    }

    const next = {};

    // Name / nick
    const username = b.username ?? b.full_name ?? b.name ?? null;
    if (typeof username === "string") {
      const v = username.trim();
      if (v.length) next.username = v;
    }

    // Role
    if (typeof b.role !== "undefined") {
      next.role = normalizeRole(b.role);
    }

    // Notes (support multiple column names)
    const note = b.note ?? b.memo ?? b.internal_note ?? b.internalNote ?? null;
    if (note === null) {
      // explicit null clears all
      next.note = null;
      next.memo = null;
      next.internal_note = null;
    } else if (typeof note === "string") {
      const v = note.trim();
      next.note = v || null;
      next.memo = v || null;
      next.internal_note = v || null;
    }

    // Telegram link: UI sends telegram_id (alias) - we store in telegram_chat_id
    const tg = b.telegram_chat_id ?? b.telegram_id ?? null;
    if (tg === null || tg === "") {
      next.telegram_chat_id = null;
    } else if (typeof tg === "string" || typeof tg === "number") {
      const v = String(tg).trim();
      if (v) next.telegram_chat_id = v;
    }

    // VIP until direct set (accept ISO or null) + add days
    const vipUntil = b.vip_until ?? b.vipUntil ?? null;
    const addDays = b.vip_add_days ?? b.vip_days ?? b.add_days ?? 0;

    // If vip_until provided explicitly
    if (vipUntil === null) {
      next.vip_until = null;
    } else if (typeof vipUntil === "string" && vipUntil.trim()) {
      const t = new Date(vipUntil).toISOString();
      if (t && t !== "Invalid Date") next.vip_until = t;
    }

    // If adding days - extend after explicit set if any, else from current
    const daysNum = Number(addDays || 0);
    if (Number.isFinite(daysNum) && daysNum > 0) {
      const base = next.vip_until ?? cur.vip_until ?? null;
      const extended = addDaysIso(base, daysNum);
      if (extended) next.vip_until = extended;

      // Helpful default: if role isn't admin and role not explicitly provided, make VIP
      if (typeof b.role === "undefined") {
        const r = String(cur.role || "").toLowerCase();
        if (!["admin", "owner", "superadmin"].includes(r)) next.role = "vip";
      }
    }

    // If setting role to free -> clear vip unless explicitly provided
    if (next.role === "free" && typeof vipUntil === "undefined" && !(Number.isFinite(daysNum) && daysNum > 0)) {
      // keep existing vip unless you want to clear; UI usually wants clear when setting free
      // We'll clear to match expectations.
      next.vip_until = null;
    }

    const { data: updated, error: upErr } = await supabase
      .from("users")
      .update(next)
      .eq("id", id)
      .select("id, username, discord_id, discord_username, discord_avatar, role, vip_until, created_at, telegram_chat_id, telegram_code_last4, note, memo, internal_note")
      .maybeSingle();

    if (upErr) return res.status(500).json({ error: upErr.message });

    const out = updated
      ? { ...updated, telegram_id: updated.telegram_chat_id || null }
      : null;


    // Notify on role grant (best-effort)
    try {
      const prevRole = String(cur.role || "").toLowerCase();
      const nextRole = String(out?.role || next?.role || "").toLowerCase();
      if (nextRole && nextRole !== prevRole && ["vip", "gold", "admin", "support"].includes(nextRole)) {
        await createNotification({
          user_id: id,
          type: "role_granted",
          title: "Выдана роль",
          body: `Вам была выдана роль: ${nextRole.toUpperCase()}`,
          data: { role: nextRole, source: "staff_edit", by: req.uid },
        });
      }
    } catch (e) {
      console.warn("[notifications] role_granted insert failed:", e?.message || e);
    }

    res.json({ ok: true, user: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ADMIN_USERS_UPDATE_FAILED" });
  }
});

// DELETE /admin/users/:id -> removes user from DB (and related rows where possible)
app.delete("/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ error: "BAD_ID" });

    // Safety: don't let admin delete themselves by accident
    if (String(req.uid) === id) return res.status(400).json({ error: "CANT_DELETE_SELF" });

    // Best-effort cleanup of related tables.
    // IMPORTANT: supabase-js usually returns { error } rather than throwing, so we must ignore both.
    const tryDel = async (table, match) => {
      try {
        const { error } = await supabase.from(table).delete().match(match);
        // ignore missing-table / missing-column / RLS etc. (we still try to delete the user)
        if (error) {
          const msg = String(error.message || "");
          // keep noise low: only log unexpected errors
          if (!/does not exist|schema cache|column .* does not exist/i.test(msg)) {
            console.warn("[admin] delete cleanup failed", table, msg);
          }
        }
      } catch (e) {
        // ignore
      }
    };

    // Common related tables in this project (may have FK constraints)
    await tryDel("telegram_tokens", { user_id: id });
    await tryDel("ai_usage", { user_id: id });
    await tryDel("vip_key_uses", { user_id: id });
    await tryDel("rentals", { user_id: id });
    await tryDel("timers", { user_id: id });
    await tryDel("temp_bans", { user_id: id });
    await tryDel("admin_audit", { target_user_id: id });

    const { error: delErr } = await supabase.from("users").delete().eq("id", id);
    if (delErr) {
      const msg = String(delErr.message || "");
      // FK / dependency errors should be explicit for the UI
      const isFk = /violates foreign key|foreign key|constraint/i.test(msg);
      return res.status(isFk ? 409 : 500).json({ error: msg, code: isFk ? "FK_CONSTRAINT" : "DELETE_FAILED" });
    }

    await logAdminAction(req.uid, id, "delete_user", {});

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "ADMIN_USER_DELETE_FAILED" });
  }
});


/* =======================
   GENERIC USER STATE (JSON) API
   - Store per-user tool state in DB instead of localStorage
   Table: user_state (user_id uuid, key text, value jsonb, updated_at timestamptz)
======================= */
app.get("/state/:key", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ error: "NO_KEY" });

    // VIP-only keys
    if (key === "active_character_id") {
      // require VIP for switching characters
      return requireVipAccess(req, res, async () => {
        try {
          const value = (req.body || {}).value;
          const row = { user_id: req.uid, key, value, updated_at: new Date().toISOString() };

          const { data, error } = await supabase
            .from("user_state")
            .upsert(row, { onConflict: "user_id,key" })
            .select("key, value, updated_at")
            .single();

          if (error) return res.status(500).json({ error: error.message });
          return res.json(data);
        } catch (e) {
          console.error(e);
          return res.status(500).json({ error: "STATE_SET_FAILED" });
        }
      });
    }

    const { data, error } = await supabase
      .from("user_state")
      .select("key, value, updated_at")
      .eq("user_id", req.uid)
      .eq("key", key)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, key, value: data?.value ?? null, updated_at: data?.updated_at ?? null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "STATE_GET_FAILED" });
  }
});

app.post("/state/:key", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ error: "NO_KEY" });

    const value = (req.body || {}).value;

    const row = { user_id: req.uid, key, value, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from("user_state")
      .upsert(row, { onConflict: "user_id,key" })
      .select("key, value, updated_at")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, key: data?.key, value: data?.value ?? null, updated_at: data?.updated_at ?? null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "STATE_SET_FAILED" });
  }
});


/* =======================
   CHARACTERS (multi-profile)
   Tables:
     characters (id uuid pk, user_id uuid, name text, created_at timestamptz)
     character_state (character_id uuid, key text, value jsonb, updated_at timestamptz)
   ======================= */

async function ensureDefaultCharacterForUser(userId) {
  // 1) find existing
  const { data: existing, error: selErr } = await supabase
    .from("characters")
    .select("id, name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (selErr) throw selErr;

  if (existing && existing.length) return existing[0].id;

  // 2) create default
  const { data: created, error: insErr } = await supabase
    .from("characters")
    .insert({ user_id: userId, name: "Main" })
    .select("id")
    .single();

  if (insErr) throw insErr;

  // 3) one-time migration: user_state -> character_state (keep active_character_id in user_state)
  try {
    const { data: rows } = await supabase
      .from("user_state")
      .select("key, value, updated_at")
      .eq("user_id", userId)
      .neq("key", "active_character_id");

    if (rows && rows.length) {
      const payload = rows.map((r) => ({
        character_id: created.id,
        key: r.key,
        value: r.value ?? null,
        updated_at: r.updated_at ?? new Date().toISOString(),
      }));
      await supabase.from("character_state").upsert(payload, { onConflict: "character_id,key" });
    }
  } catch (e) {
    // migration is best-effort; do not block login if tables are new
    console.warn("⚠️ character migration skipped:", e?.message || e);
  }

  // 4) set active_character_id (user_state)
  try {
    await supabase.from("user_state").upsert(
      { user_id: userId, key: "active_character_id", value: created.id, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
  } catch {}

  return created.id;
}

async function assertCharacterOwner(characterId, userId) {
  const { data, error } = await supabase
    .from("characters")
    .select("id, user_id")
    .eq("id", characterId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.user_id !== userId) {
    const err = new Error("NOT_FOUND");
    err.status = 404;
    throw err;
  }
}

/** List characters */
app.get("/characters", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    await ensureDefaultCharacterForUser(req.uid);

    const { data, error } = await supabase
      .from("characters")
      .select("id, name, created_at")
      .eq("user_id", req.uid)
      .order("created_at", { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (e) {
    console.error("GET /characters failed:", e);
    res.status(500).json({ error: "CHARACTERS_FAILED" });
  }
});

/** Create character */
app.post("/characters", requireAuth, requireGuildAccess, requireVipAccess, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "NO_NAME" });

    const { data: countData, error: countErr } = await supabase
      .from("characters")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.uid);

    if (countErr) throw countErr;
    const count = countData?.length ?? 0;
    if (count >= 20) return res.status(400).json({ error: "LIMIT_REACHED" });

    const { data, error } = await supabase
      .from("characters")
      .insert({ user_id: req.uid, name })
      .select("id, name, created_at")
      .single();

    if (error) throw error;

    res.json(data);
  } catch (e) {
    console.error("POST /characters failed:", e);
    res.status(500).json({ error: "CHARACTER_CREATE_FAILED" });
  }
});

/** Rename character */
app.patch("/characters/:id", requireAuth, requireGuildAccess, requireVipAccess, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const name = String(req.body?.name || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "NO_NAME" });

    await assertCharacterOwner(id, req.uid);

    const { data, error } = await supabase
      .from("characters")
      .update({ name })
      .eq("id", id)
      .select("id, name, created_at")
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    const status = e?.status || 500;
    console.error("PATCH /characters failed:", e);
    res.status(status).json({ error: status === 404 ? "NOT_FOUND" : "CHARACTER_UPDATE_FAILED" });
  }
});

/** Delete character (cannot delete the last one) */
app.delete("/characters/:id", requireAuth, requireGuildAccess, requireVipAccess, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    await assertCharacterOwner(id, req.uid);

    const { data: list, error: listErr } = await supabase
      .from("characters")
      .select("id")
      .eq("user_id", req.uid);

    if (listErr) throw listErr;
    if (!list || list.length <= 1) return res.status(400).json({ error: "CANNOT_DELETE_LAST" });

    const { error } = await supabase.from("characters").delete().eq("id", id);
    if (error) throw error;

    // if active deleted, set to first
    const { data: remaining } = await supabase
      .from("characters")
      .select("id")
      .eq("user_id", req.uid)
      .order("created_at", { ascending: true })
      .limit(1);

    const nextId = remaining?.[0]?.id;
    if (nextId) {
      await supabase.from("user_state").upsert(
        { user_id: req.uid, key: "active_character_id", value: nextId, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
    }

    res.json({ ok: true, active_character_id: nextId || null });
  } catch (e) {
    const status = e?.status || 500;
    console.error("DELETE /characters failed:", e);
    res.status(status).json({ error: status === 404 ? "NOT_FOUND" : "CHARACTER_DELETE_FAILED" });
  }
});

/** Character state read */
app.get("/cstate/:characterId/:key", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const characterId = String(req.params.characterId || "").trim();
    const key = String(req.params.key || "").trim();
    if (!characterId || !key) return res.status(400).json({ error: "BAD_PARAMS" });

    await assertCharacterOwner(characterId, req.uid);

    const { data, error } = await supabase
      .from("character_state")
      .select("key, value, updated_at")
      .eq("character_id", characterId)
      .eq("key", key)
      .maybeSingle();

    if (error) throw error;

    res.json({ key, value: data?.value ?? null, updated_at: data?.updated_at ?? null });
  } catch (e) {
    const status = e?.status || 500;
    console.error("GET /cstate failed:", e);
    res.status(status).json({ error: status === 404 ? "NOT_FOUND" : "CSTATE_FAILED" });
  }
});

/** Character state write */
app.post("/cstate/:characterId/:key", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const characterId = String(req.params.characterId || "").trim();
    const key = String(req.params.key || "").trim();
    if (!characterId || !key) return res.status(400).json({ error: "BAD_PARAMS" });

    await assertCharacterOwner(characterId, req.uid);

    const { value } = req.body || {};
    const payload = {
      character_id: characterId,
      key,
      value: value ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("character_state").upsert(payload, { onConflict: "character_id,key" });
    if (error) throw error;

    res.json({ ok: true });
  } catch (e) {
    const status = e?.status || 500;
    console.error("POST /cstate failed:", e);
    res.status(status).json({ error: status === 404 ? "NOT_FOUND" : "CSTATE_SAVE_FAILED" });
  }
});

/** Ping */
app.get("/cstate/ping", (req, res) => res.send("ok"));



/* =======================
   RENTALS API (Calculator)
======================= */
app.get("/rentals", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("rentals")
      .select("*")
      .eq("user_id", req.uid)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, rentals: data || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "RENTALS_LIST_FAILED" });
  }
});

app.post("/rentals", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const body = req.body || {};
    const row = {
      user_id: req.uid,
      title: body.title ?? body.label ?? null,
      category: body.category ?? null,
      note: body.note ?? body.description ?? null,
      amount: body.amount ?? body.sum ?? body.price ?? null,
      type: body.type ?? body.kind ?? null,
      hours: body.hours ?? null,
      created_at: body.created_at ?? undefined,
    };

    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

    const { data, error } = await supabase.from("rentals").insert(row).select("*").single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, rental: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "RENTALS_CREATE_FAILED" });
  }
});

app.delete("/rentals/:id", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "NO_ID" });

    const { error } = await supabase.from("rentals").delete().eq("id", id).eq("user_id", req.uid);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "RENTALS_DELETE_FAILED" });
  }
});

/* =======================
   TIMERS API
======================= */
app.get("/timers", requireAuth, requireGuildAccess, async (req, res) => {
  const { data, error } = await supabase
    .from("timers")
    .select("*")
    .eq("user_id", req.uid)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, timers: data || [] });
});

app.post("/timers/upsert", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const { id, label, endAt, fired, notified, running } = req.body || {};
    if (!id) return res.status(400).json({ error: "NO_ID" });

    const incomingId = String(id);
    const safeId = isUuid(incomingId) ? incomingId : crypto.randomUUID();
    const end_at = endAt ? new Date(endAt).toISOString() : null;

    const row = {
      id: safeId,
      user_id: req.uid,
      label: String(label || "Таймер"),
      end_at,
      fired: !!fired,
      notified: !!notified,
      running: typeof running === "boolean" ? running : !!end_at,
    };

    const { data, error } = await supabase.from("timers").upsert(row, { onConflict: "id" }).select("*").single();

    if (error) return res.status(500).json({ error: String(error.message || "") });
    res.json({ ok: true, timer: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "UPSERT_FAILED" });
  }
});

app.delete("/timers/:id", requireAuth, requireGuildAccess, async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "NO_ID" });

  const { error } = await supabase.from("timers").delete().eq("id", id).eq("user_id", req.uid);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete("/timers", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const { error } = await supabase.from("timers").delete().eq("user_id", req.uid);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "TIMERS_CLEAR_FAILED" });
  }
});

app.post("/timers/clear", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const { error } = await supabase.from("timers").delete().eq("user_id", req.uid);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "TIMERS_CLEAR_FAILED" });
  }
});

/* =======================
   NOTIFY TELEGRAM (immediate)
======================= */
app.post("/notify/telegram", requireAuth, requireGuildAccess, async (req, res) => {
  try {
    const { title, message } = req.body || {};
    const text = [title, message].filter(Boolean).join("\n");

    const { data: user, error: uErr } = await supabase
      .from("users")
      .select("id, telegram_chat_id, tg_notify_enabled")
      .eq("id", req.uid)
      .single();

    if (uErr) return res.status(200).json({ ok: false, reason: "db_error", error: uErr.message });

    if (!user?.telegram_chat_id) return res.status(200).json({ ok: false, reason: "not_linked" });
    if (user.tg_notify_enabled === false) return res.status(400).json({ error: "TG_DISABLED" });

    const ok = await app.locals.telegramSend?.(user.telegram_chat_id, text);
    if (!ok) return res.status(200).json({ ok: false, reason: "send_failed" });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "TG_NOTIFY_FAILED" });
  }
});


/* =======================
   UPDATES NOTIFICATIONS (DISABLED)
   - Auto notifications to Telegram/Discord about new releases have been removed.
   - Reason: no more broadcast "update released" messages from bots.
   ======================= */

/**
 * Updates broadcast routes + GitHub polling were intentionally disabled.
 * If you ever need it back:
 *   - restore sendTelegramBroadcast/sendDiscordUpdate
 *   - restore /admin/notify-update endpoints
 *   - restore pollGithubAndNotifyOnce interval
 */
app.post("/admin/users/:id/kick", requireAuth, requireAdmin, async (req, res) => {
  const targetId = String(req.params.id || "");
  if (!targetId) return res.status(400).json({ error: "NO_ID" });

  const { data: target, error: selErr } = await supabase
    .from("users")
    .select("id, token_version")
    .eq("id", targetId)
    .single();

  if (selErr || !target) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const nextTv = Number(target.token_version || 0) + 1;

  const { error: updErr } = await supabase
    .from("users")
    .update({ token_version: nextTv })
    .eq("id", targetId);

  if (updErr) return res.status(500).json({ error: "KICK_FAILED" });

  await logAdminAction(req.user.id, targetId, "KICK", { nextTv });
  res.json({ ok: true, token_version: nextTv });
});



app.post("/admin/users/:id/ban", requireAuth, requireAdmin, async (req, res) => {
  const targetId = req.params.id;
  const { days = 7, reason = "" } = req.body || {};
  const until = new Date(Date.now() + days * 86400000).toISOString();

  await supabase
    .from("users")
    .update({ banned_until: until, ban_reason: reason })
    .eq("id", targetId);

  await logAdminAction(req.user.id, targetId, "BAN", { days, reason });
  res.json({ ok: true });
});


app.post("/admin/users/:id/unban", requireAuth, requireAdmin, async (req, res) => {
  const targetId = req.params.id;

  await supabase
    .from("users")
    .update({ banned_until: null, ban_reason: null })
    .eq("id", targetId);

  await logAdminAction(req.user.id, targetId, "UNBAN");
  res.json({ ok: true });
});


/* =======================
   START
======================= */
app.listen(PORT, async () => {
  console.log("✅ Backend running on port", PORT);

  // The Mini App does not require Discord. It stays opt-in so the legacy
  // moderation bot cannot start accidentally on the mobile deployment.
  if (process.env.ENABLE_DISCORD_BOT === "1" && DISCORD_BOT_TOKEN && DISCORD_GUILD_ID) {
    try {
      console.log("🤖 Starting optional Discord bot...");
      await startDiscordBot();
    } catch (error) {
      console.error("[discord] failed to start optional bot:", error);
    }
  } else {
    console.log("ℹ️ Discord bot disabled for Telegram Mini App deployment.");
  }
});