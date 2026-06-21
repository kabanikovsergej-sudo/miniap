import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Crown,
  FolderOpen,
  Heart,
  Lock,
  LogOut,
  Monitor,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  X,
  Eye,
  EyeOff,
  BadgeCheck,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { fetchMe, logout } from "@/lib/auth";
import { api } from "@/lib/api";

const LS_EFFECTS = "app_fx_enabled";
const LS_UI_SCALE = "app_ui_scale_v1";
const LEGAL_PRIVACY_URL = "https://nightcorex.com/legal/privacy";
const LEGAL_TERMS_URL = "https://nightcorex.com/legal/terms";
const VIP_CODE_PLACEHOLDER = "VIP-XXXX-XXXX";

const panelClass =
  "rounded-[26px] border border-white/[0.09] bg-[#090b11]/86 shadow-[0_18px_55px_rgba(0,0,0,0.28)] backdrop-blur-xl";

function formatVipCode(input) {
  const raw = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!raw) return "";

  const tail = raw.startsWith("VIP") ? raw.slice(3) : raw;
  const clean = tail.slice(0, 8);
  const first = clean.slice(0, 4);
  const second = clean.slice(4, 8);
  return `VIP${first ? `-${first}` : ""}${second ? `-${second}` : ""}`;
}

function getInitialFxEnabled() {
  try {
    return localStorage.getItem(LS_EFFECTS) !== "0";
  } catch {
    return true;
  }
}


function getInitialUiScale() {
  try {
    const value = Number(localStorage.getItem(LS_UI_SCALE) || "1");
    return Number.isFinite(value) ? Math.min(1.25, Math.max(0.9, value)) : 1;
  } catch {
    return 1;
  }
}

function applyUiScale(scale) {
  const next = String(scale);
  try {
    document.documentElement.style.setProperty("--nc-ui-zoom", next);
    document.body.style.zoom = next;
  } catch {
    // The desktop wrapper may not support body zoom. The app still keeps the preference.
  }
}

function parseVipUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickStatusString(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(pickStatusString).join(" ");
  if (typeof value === "object") {
    return [
      value.status,
      value.role,
      value.plan,
      value.tier,
      value.vipStatus,
      value.subscription,
      value.access,
      value.userStatus,
    ]
      .map(pickStatusString)
      .join(" ");
  }
  return String(value);
}

function statusFromMe(me) {
  const key = pickStatusString(me).toUpperCase();
  const isAdmin = key.includes("ADMIN") || key.includes("OWNER") || key.includes("MOD") || !!me?.is_admin;
  const isGold = key.includes("GOLD");
  const vipUntil = parseVipUntil(me?.vip_until || me?.vipUntil);
  const vipByDate = !!vipUntil && vipUntil.getTime() > Date.now();
  const isVip = isAdmin || isGold || key.includes("VIP") || !!me?.vip_active || vipByDate;

  if (isAdmin) return { label: "ADMIN", kind: "admin", isVip: true, vipUntil };
  if (isGold) return { label: "GOLD", kind: "gold", isVip: true, vipUntil };
  if (isVip) return { label: "VIP", kind: "vip", isVip: true, vipUntil };
  return { label: "FREE", kind: "free", isVip: false, vipUntil: null };
}

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("EMPTY");

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to the Electron-safe copy fallback.
  }

  const element = document.createElement("textarea");
  element.value = text;
  element.setAttribute("readonly", "");
  element.style.position = "fixed";
  element.style.top = "-9999px";
  element.style.left = "-9999px";
  element.style.opacity = "0";
  document.body.appendChild(element);
  element.select();
  element.setSelectionRange(0, text.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(element);
  if (!copied) throw new Error("COPY_FAILED");
}

function SectionTitle({ eyebrow, title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/34">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-[15px] font-bold tracking-tight text-white">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-white/43">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function MiniIcon({ children, tone = "neutral" }) {
  const neutral = "border-white/[0.09] bg-white/[0.055] text-white/72";
  const tones = {
    neutral,
    violet: neutral,
    amber: neutral,
    emerald: neutral,
    sky: neutral,
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  };

  return <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${tones[tone]}`}>{children}</div>;
}

function SoftButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/[0.11] bg-white/[0.055] px-3.5 text-xs font-bold text-white/86 transition duration-150 hover:bg-white/[0.1] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/[0.13] bg-[#1a1f29] px-3.5 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(0,0,0,0.24)] transition duration-150 hover:bg-[#242a35] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function DangerButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/12 px-3.5 text-xs font-extrabold text-rose-100 transition hover:bg-rose-500/18 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label, description, icon: Icon }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left">
      <MiniIcon tone={checked ? "violet" : "neutral"}>{Icon ? <Icon className="h-[18px] w-[18px]" /> : null}</MiniIcon>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white/92">{label}</div>
        <div className="mt-0.5 text-xs text-white/42">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange?.(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full border outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/20 ${
          checked
            ? "border-white/[0.20] bg-[#2a303c]"
            : "border-white/[0.10] bg-black/30 hover:bg-white/[0.08]"
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-5 w-5 rounded-full border transition-transform duration-200 ${
            checked
              ? "translate-x-5 border-white/35 bg-white/90"
              : "translate-x-0 border-white/[0.12] bg-white/[0.42]"
          }`}
        />
      </button>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-white/[0.07]" />;
}


function UiScaleSlider({ value, onChange, onCommit }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (event) => onChange(Number(event.target.value));
  const commit = (nextValue) => {
    const next = Number(nextValue);
    if (Number.isFinite(next)) onCommit?.(next);
  };

  return (
    <motion.div
      layout={!dragging}
      initial={false}
      transition={dragging ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
      className={[
        "group relative flex h-9 select-none items-center overflow-hidden rounded-xl border transition-all duration-300",
        isOpen
          ? "w-auto border-white/[0.16] bg-[#11151d] pr-3"
          : "w-auto cursor-pointer border-white/[0.10] bg-white/[0.045] hover:bg-white/[0.08]",
      ].join(" ")}
      onClick={() => !isOpen && setIsOpen(true)}
      ref={containerRef}
    >
      <motion.div layout className="flex h-full items-center justify-center gap-2 px-3">
        <Monitor className={`h-4 w-4 transition-colors ${isOpen ? "text-white/78" : "text-white/52"}`} />
        {!isOpen && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-semibold text-white/78">
            {Math.round(value * 100)}%
          </motion.span>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 140 }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.18 }}
            className="flex h-full origin-left items-center gap-3"
          >
            <div className="relative flex h-full w-full items-center">
              <input
                type="range"
                min="0.9"
                max="1.25"
                step="0.05"
                value={value}
                onChange={handleChange}
                onPointerDown={() => setDragging(true)}
                onPointerUp={(event) => {
                  setDragging(false);
                  commit(event.currentTarget.value);
                }}
                onKeyUp={(event) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                    commit(event.currentTarget.value);
                  }
                }}
                className="w-full cursor-pointer appearance-none bg-transparent focus:outline-none [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/20 [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#151922] [&::-webkit-slider-thumb]:bg-white/90 [&::-webkit-slider-thumb]:shadow-lg"
              />
            </div>
            <span className="min-w-[32px] text-right font-mono text-xs font-bold text-white/78">
              {Math.round(value * 100)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Modal({ open, children, onClose, maxWidth = "max-w-lg" }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center px-4 py-6">
      {/* Backdrop is deliberately not animated: blur appears in the very first frame. */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/72"
        style={{
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          transform: "translateZ(0)",
          willChange: "backdrop-filter",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className={`relative max-h-[calc(100vh-48px)] w-full ${maxWidth} overflow-y-auto rounded-[28px] border border-white/[0.12] bg-[#0a0c12]/98 shadow-[0_30px_100px_rgba(0,0,0,0.65)]`}
      >
        {children}
      </motion.div>
    </div>
  );
}

function StatusPill({ status }) {
  const styles = {
    free: "border-white/[0.12] bg-white/[0.055] text-white/74",
    vip: "border-white/[0.14] bg-white/[0.075] text-white/90",
    gold: "border-white/[0.14] bg-white/[0.075] text-white/90",
    admin: "border-rose-400/22 bg-rose-400/12 text-rose-100",
  };
  const Icon = status.kind === "admin" ? ShieldCheck : status.kind === "free" ? BadgeCheck : Crown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold tracking-[0.12em] ${styles[status.kind]}`}>
      <Icon className="h-3.5 w-3.5" />
      {status.label}
    </span>
  );
}

function getUserId(me) {
  const telegramId = me?.telegram_chat_id ?? me?.telegramChatId ?? me?.tg_id ?? me?.tgId;
  if (telegramId != null && String(telegramId).trim()) return String(telegramId).trim();

  const discord = String(me?.discord_id ?? me?.discordId ?? "").trim();
  if (discord.startsWith("guest_tg_")) return discord.replace(/^guest_tg_/, "").trim();

  const candidates = [me?.user_id, me?.userId, me?.id, me?.uid, discord];
  const found = candidates.find((item) => item != null && String(item).trim());
  return found == null ? "" : String(found).trim();
}

export default function SettingsPage() {
  const location = useLocation();
  const mountedRef = useRef(true);
  const redeemInputRef = useRef(null);

  const [me, setMe] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [activeCharacterId, setActiveCharacterId] = useState(() => {
    try {
      return localStorage.getItem("active_character_id") || "";
    } catch {
      return "";
    }
  });
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [characterManagerOpen, setCharacterManagerOpen] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [fxEnabled, setFxEnabled] = useState(getInitialFxEnabled);
  const [uiScale, setUiScale] = useState(getInitialUiScale);
  const [previewScale, setPreviewScale] = useState(getInitialUiScale);
  const [appDir, setAppDir] = useState("");

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [vipGate, setVipGate] = useState(null);
  const [copyState, setCopyState] = useState("");

  const [vipCode, setVipCode] = useState("");
  const [giftMode, setGiftMode] = useState(false);
  const [giftTargetId, setGiftTargetId] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState(null);

  const [tgReveal, setTgReveal] = useState(false);
  const [tgCodeFull, setTgCodeFull] = useState("");
  const [tgLast4Remote, setTgLast4Remote] = useState("");
  const [tgLoading, setTgLoading] = useState(false);
  const [tgMessage, setTgMessage] = useState(null);

  const status = useMemo(() => statusFromMe(me), [me]);
  const canUseVipTools = status.isVip;
  const activeCharacter = useMemo(
    () => characters.find((character) => String(character.id) === String(activeCharacterId)) || characters[0] || null,
    [characters, activeCharacterId]
  );
  const userId = useMemo(() => getUserId(me), [me]);
  const tgLast4 =
    String(me?.telegram_code_last4 || me?.tg_code_last4 || "").trim() ||
    String(tgLast4Remote || "").trim() ||
    String(me?.telegram_code || "").trim().slice(-4);
  const maskedTgCode = tgLast4 ? `TG-••••-••••-${tgLast4}` : "Код ещё не создан";
  const shownTgCode = canUseVipTools && tgReveal ? tgCodeFull || maskedTgCode : maskedTgCode;
  const tgConnected = !!(me?.telegram_chat_id || me?.telegramChatId);

  const emitCharacter = (id) => {
    const value = String(id || "");
    if (!value) return;
    try {
      window.dispatchEvent(new CustomEvent("nightcore:character", { detail: value }));
    } catch {
      // No-op in non-browser previews.
    }
  };

  const loadMe = async () => {
    try {
      const data = await fetchMe();
      if (mountedRef.current) setMe(data || null);
    } catch {
      if (mountedRef.current) setMe(null);
    }
  };

  const refreshCharacters = async () => {
    setCharactersLoading(true);
    try {
      const response = await api("/characters", { method: "GET" });
      const raw = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.characters)
            ? response.characters
            : [];
      const next = raw.map((character) => ({
        id: character.id,
        name: character.name || character.title || "Без имени",
      }));
      if (!mountedRef.current) return;

      setCharacters(next);
      const current = String(activeCharacterId || "");
      const valid = next.some((character) => String(character.id) === current);
      const nextActive = valid ? current : String(next[0]?.id || "");
      if (nextActive) {
        setActiveCharacterId(nextActive);
        try {
          localStorage.setItem("active_character_id", nextActive);
        } catch {
          // no-op
        }
        emitCharacter(nextActive);
      }
    } catch {
      if (mountedRef.current) setCharacters([]);
    } finally {
      if (mountedRef.current) setCharactersLoading(false);
    }
  };

  const selectCharacter = async (id) => {
    const value = String(id || "");
    if (!value) return;
    setActiveCharacterId(value);
    try {
      localStorage.setItem("active_character_id", value);
    } catch {
      // no-op
    }
    emitCharacter(value);
    try {
      await api("/state/active_character_id", { method: "POST", body: { value } });
    } catch {
      // Local selection remains valid even if server preference cannot be saved.
    }
  };

  const createCharacter = async () => {
    const name = String(newCharacterName || "").trim();
    if (!name || charactersLoading) return;
    setCharactersLoading(true);
    try {
      const response = await api("/characters", { method: "POST", body: { name } });
      const newId = response?.id || response?.data?.id;
      setNewCharacterName("");
      await refreshCharacters();
      if (newId) await selectCharacter(newId);
    } catch {
      // The page stays usable; no destructive local state is changed.
    } finally {
      if (mountedRef.current) setCharactersLoading(false);
    }
  };

  const deleteCharacter = async () => {
    const id = String(deleteTarget?.id || "");
    if (!id || characters.length <= 1 || charactersLoading) return;
    setCharactersLoading(true);
    try {
      try {
        await api(`/characters/${id}`, { method: "DELETE" });
      } catch {
        await api("/characters/delete", { method: "POST", body: { id } });
      }

      const remaining = characters.filter((character) => String(character.id) !== id);
      setCharacters(remaining);
      if (String(activeCharacterId) === id) {
        const nextId = String(remaining[0]?.id || "");
        if (nextId) await selectCharacter(nextId);
      }
      setDeleteTarget(null);
    } catch {
      // Keep the management modal open so the user can try again.
    } finally {
      if (mountedRef.current) setCharactersLoading(false);
    }
  };

  const ensureFullTgCode = async () => {
    if (!canUseVipTools) return null;
    if (tgCodeFull) return tgCodeFull;
    setTgLoading(true);
    try {
      const response = await api("/telegram/code", { method: "GET" });
      const code = String(response?.code || "").trim();
      if (!code) throw new Error("NO_CODE");
      setTgCodeFull(code);
      return code;
    } finally {
      if (mountedRef.current) setTgLoading(false);
    }
  };

  const openTelegramBot = async () => {
    try {
      const base = "https://t.me/nightcorexbot";
      if (canUseVipTools) {
        const code = await ensureFullTgCode();
        if (code) {
          window.open(`${base}?start=${encodeURIComponent(code)}`, "_blank");
          return;
        }
      }
      window.open(base, "_blank");
    } catch {
      setTgMessage({ type: "error", text: "Не удалось открыть бота. Открой @nightcorexbot вручную." });
    }
  };

  const redeem = async () => {
    const formatted = formatVipCode(vipCode);
    setVipCode(formatted);
    const codeValid = /^VIP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(formatted);
    const giftId = String(giftTargetId || "").trim();
    if (!codeValid || (giftMode && !/^[0-9]{6,20}$/.test(giftId))) {
      setRedeemMessage({ type: "error", text: giftMode ? "Проверь VIP-код и Telegram ID друга." : "Проверь формат VIP-кода." });
      return;
    }

    setRedeemLoading(true);
    setRedeemMessage(null);
    try {
      await api("/redeem", {
        method: "POST",
        body: JSON.stringify({ code: formatted, ...(giftMode ? { target_telegram_id: giftId } : {}) }),
      });
      setVipCode("");
      setGiftTargetId("");
      setRedeemMessage({ type: "success", text: giftMode ? "VIP отправлен другу." : "VIP успешно активирован." });
      await loadMe();
      try {
        window.dispatchEvent(new Event("nightcore:me"));
      } catch {
        // no-op
      }
    } catch (error) {
      const message = String(error?.message || "");
      let text = "Не удалось активировать VIP-код.";
      if (message.includes("BAD_CODE")) text = "Неверный VIP-код.";
      if (message.includes("CODE_EXPIRED")) text = "Срок действия этого VIP-кода закончился.";
      if (message.includes("CODE_LIMIT")) text = "Этот VIP-код уже использован.";
      if (message.includes("NO_TOKEN")) text = "Сначала войди в аккаунт.";
      setRedeemMessage({ type: "error", text });
    } finally {
      if (mountedRef.current) setRedeemLoading(false);
    }
  };

  const openInstallDirectory = async () => {
    const path = String(appDir || "").trim();
    if (!path) return;
    try {
      if (window?.api?.openPath) {
        await window.api.openPath(path);
        return;
      }
      if (window?.api?.openFolder) {
        await window.api.openFolder(path);
        return;
      }
    } catch {
      // Use the generic fallback below.
    }
    try {
      window.open(`file:///${path.replace(/\\/g, "/")}`, "_blank");
    } catch {
      // no-op
    }
  };

  const flashCopy = async (value, key) => {
    try {
      await copyText(value);
      setCopyState(key);
      window.setTimeout(() => setCopyState(""), 1400);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState(""), 1400);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadMe();
    refreshCharacters();
    const interval = window.setInterval(loadMe, 15000);
    const onFocus = () => loadMe();
    window.addEventListener("focus", onFocus);
    window.addEventListener("nightcore:me", onFocus);
    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("nightcore:me", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await api("/telegram/code_last4", { method: "GET" });
        const last4 = String(response?.last4 || "").trim();
        if (mountedRef.current && last4) setTgLast4Remote(last4);
      } catch {
        // The masked UI still works without this optional endpoint.
      }
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_EFFECTS, fxEnabled ? "1" : "0");
      window.dispatchEvent(new Event("nightcore:fx"));
    } catch {
      // no-op
    }
  }, [fxEnabled]);

  useEffect(() => {
    setPreviewScale(uiScale);
    try {
      localStorage.setItem(LS_UI_SCALE, String(uiScale));
      applyUiScale(uiScale);
      window.dispatchEvent(new CustomEvent("nightcore:uiScale", { detail: uiScale }));
    } catch {
      // no-op
    }
  }, [uiScale]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const value = window?.api?.getInstallDir
          ? await window.api.getInstallDir()
          : window?.api?.getAppDir
            ? await window.api.getAppDir()
            : window?.__APP_DIR__ || "";
        if (alive) setAppDir(String(value || ""));
      } catch {
        if (alive) setAppDir("");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    if (params.get("redeem") !== "1") return;
    window.setTimeout(() => redeemInputRef.current?.focus?.(), 120);
  }, [location.search]);

  useEffect(() => {
    if (!tgMessage) return undefined;
    const timer = window.setTimeout(() => setTgMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [tgMessage]);

  return (
    <div className="min-h-full overflow-y-auto text-white">
      <div className="mx-auto w-full max-w-[1220px] px-4 pb-8 pt-3 md:px-6 md:pt-5">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-[#090b11]/78 px-5 py-5 shadow-[0_22px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl md:px-7 md:py-6"
        >
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/85">
                  <Settings2 className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/38">NightcoreX</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white md:text-[29px]">Настройки</h1>
              <p className="mt-2 max-w-[570px] text-sm leading-relaxed text-white/46">
                Профили, доступ, Telegram и внешний вид — всё собрано в одной аккуратной панели.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:min-w-[455px]">
              <button
                type="button"
                onClick={() => (canUseVipTools ? setCharacterManagerOpen(true) : setVipGate("Смена и создание персонажей доступны только с VIP."))}
                className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.1] bg-black/20 px-3 py-2.5 text-left transition hover:bg-white/[0.055]"
              >
                <MiniIcon tone="violet"><UserRound className="h-[18px] w-[18px]" /></MiniIcon>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/36">Активный профиль</div>
                  <div className="mt-0.5 truncate text-sm font-bold text-white/92">{activeCharacter?.name || "Main"}</div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/45 transition group-hover:translate-y-0.5" />
              </button>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.1] bg-black/20 px-3.5 py-2.5 sm:block">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/36">Твой статус</div>
                <div className="mt-1"><StatusPill status={status} /></div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <div className="space-y-4">
            <section className={`${panelClass} p-5 md:p-6`}>
              <SectionTitle eyebrow="Interface" title="Внешний вид" description="Настрой приложение под себя без лишних элементов." />
              <div className="mt-5 space-y-3">
                <Toggle
                  checked={fxEnabled}
                  onChange={() => setFxEnabled((value) => !value)}
                  icon={Sparkles}
                  label="Эффекты интерфейса"
                  description="Плавные открытия, подсветки и микро-анимации. Анимированный фон работает отдельно и не выключается этим переключателем."
                />
                <Divider />
                <div className="flex items-center gap-3 py-2">
                  <MiniIcon tone="neutral"><SlidersHorizontal className="h-[18px] w-[18px]" /></MiniIcon>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white/92">Масштаб интерфейса</div>
                    <div className="mt-0.5 text-xs text-white/42">Выбери размер и нажми галочку — масштаб применяется после подтверждения.</div>
                  </div>
                  <UiScaleSlider value={previewScale} onChange={setPreviewScale} onCommit={setUiScale} />
                </div>
              </div>
            </section>

            <section className={`${panelClass} p-5 md:p-6`}>
              <SectionTitle eyebrow="System" title="Приложение и сессия" description="Данные приложения, быстрые действия и безопасность аккаунта." />
              <div className="mt-5 space-y-1">
                <div className="flex items-center gap-3 rounded-2xl p-2.5">
                  <MiniIcon tone="neutral"><FolderOpen className="h-[18px] w-[18px]" /></MiniIcon>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white/92">Папка установки</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-white/38">{appDir || "Путь недоступен в этой версии"}</div>
                  </div>
                  <SoftButton disabled={!appDir} onClick={openInstallDirectory} className="shrink-0">Открыть</SoftButton>
                </div>
                <Divider />
                <div className="flex items-center gap-3 rounded-2xl p-2.5">
                  <MiniIcon tone="sky"><Copy className="h-[18px] w-[18px]" /></MiniIcon>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white/92">Telegram ID</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-white/38">{userId || "Появится после подключения Telegram"}</div>
                  </div>
                  <SoftButton disabled={!userId} onClick={() => flashCopy(userId, "id")} className="shrink-0">
                    {copyState === "id" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copyState === "id" ? "Готово" : "Копировать"}
                  </SoftButton>
                </div>
                <Divider />
                <div className="flex items-center gap-3 rounded-2xl p-2.5">
                  <MiniIcon tone="rose"><LogOut className="h-[18px] w-[18px]" /></MiniIcon>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white/92">Аккаунт</div>
                    <div className="mt-0.5 text-xs text-white/42">Заверши текущую сессию на этом устройстве.</div>
                  </div>
                  <DangerButton onClick={() => setLogoutOpen(true)} className="shrink-0">Выйти</DangerButton>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] pt-4 text-xs font-semibold text-white/40">
                <button type="button" onClick={() => window.open("https://discord.gg/GESqaKKFty", "_blank")} className="inline-flex items-center gap-1.5 transition hover:text-white/80">
                  <Heart className="h-3.5 w-3.5" /> Discord Community
                </button>
                <button type="button" onClick={() => window.open(LEGAL_PRIVACY_URL, "_blank")} className="transition hover:text-white/80">Privacy</button>
                <button type="button" onClick={() => window.open(LEGAL_TERMS_URL, "_blank")} className="transition hover:text-white/80">Terms</button>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className={`${panelClass} relative overflow-hidden p-5 md:p-6`}>
              <div className="relative">
                <SectionTitle
                  eyebrow="Membership"
                  title="VIP доступ"
                  description={canUseVipTools ? "Расширенные функции уже доступны на твоём аккаунте." : "Активируй ключ, чтобы открыть профили и расширенные настройки."}
                  action={<StatusPill status={status} />}
                />

                <div className="mt-5 rounded-2xl border border-white/[0.09] bg-black/20 p-1">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => { setGiftMode(false); setGiftTargetId(""); }}
                      className={`h-9 rounded-xl border px-3 text-xs font-extrabold transition ${!giftMode ? "border-white/[0.13] bg-white/[0.11] text-white" : "border-transparent text-white/42 hover:bg-white/[0.055] hover:text-white/78"}`}
                    >
                      Активировать себе
                    </button>
                    <button
                      type="button"
                      onClick={() => setGiftMode(true)}
                      className={`h-9 rounded-xl border px-3 text-xs font-extrabold transition ${giftMode ? "border-white/[0.13] bg-white/[0.11] text-white" : "border-transparent text-white/42 hover:bg-white/[0.055] hover:text-white/78"}`}
                    >
                      Подарить другу
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2.5">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/34">VIP-код</span>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34" />
                      <input
                        ref={redeemInputRef}
                        value={vipCode}
                        onChange={(event) => setVipCode(formatVipCode(event.target.value))}
                        onKeyDown={(event) => event.key === "Enter" && redeem()}
                        placeholder={VIP_CODE_PLACEHOLDER}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        className="h-11 w-full rounded-2xl border border-white/[0.11] bg-black/28 pl-10 pr-3 font-mono text-sm font-semibold text-white outline-none transition placeholder:text-white/23 focus:border-white/28 focus:bg-white/[0.035]"
                      />
                    </div>
                  </label>

                  <AnimatePresence initial={false}>
                    {giftMode ? (
                      <motion.label
                        initial={{ opacity: 0, height: 0, y: -4 }}
                        animate={{ opacity: 1, height: "auto", y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{ duration: 0.16 }}
                        className="block overflow-hidden"
                      >
                        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/34">Telegram ID друга</span>
                        <div className="relative">
                          <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34" />
                          <input
                            value={giftTargetId}
                            onChange={(event) => setGiftTargetId(event.target.value.replace(/[^0-9]/g, ""))}
                            onKeyDown={(event) => event.key === "Enter" && redeem()}
                            placeholder="Например: 123456789"
                            inputMode="numeric"
                            className="h-11 w-full rounded-2xl border border-white/[0.11] bg-black/28 pl-10 pr-3 font-mono text-sm font-semibold text-white outline-none transition placeholder:text-white/23 focus:border-white/28 focus:bg-white/[0.035]"
                          />
                        </div>
                      </motion.label>
                    ) : null}
                  </AnimatePresence>

                  <PrimaryButton onClick={redeem} disabled={redeemLoading} className="w-full">
                    {redeemLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                    {redeemLoading ? "Проверяю код" : giftMode ? "Подарить VIP" : "Активировать VIP"}
                  </PrimaryButton>
                </div>

                <AnimatePresence initial={false}>
                  {redeemMessage ? (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className={`mt-3 rounded-2xl border px-3 py-2.5 text-xs font-semibold ${
                        redeemMessage.type === "success"
                          ? "border-white/[0.14] bg-white/[0.07] text-white/86"
                          : "border-rose-400/20 bg-rose-400/10 text-rose-100"
                      }`}
                    >
                      {redeemMessage.text}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </section>

            <section className={`${panelClass} overflow-hidden`}>
              <div className="p-5 md:p-6">
                <SectionTitle eyebrow="Connection" title="Telegram" description="Привяжи бота и получай уведомления о таймерах." />
                <div className="mt-5 rounded-2xl border border-white/[0.09] bg-black/20 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <MiniIcon tone="sky"><Send className="ml-[-1px] mt-[1px] h-[18px] w-[18px]" /></MiniIcon>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white/92">NightcoreX Bot</div>
                        <div className="mt-0.5 text-xs text-white/42">{tgConnected ? "Аккаунт подключён к Telegram" : "Бот пока не подключён"}</div>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold tracking-[0.12em] ${tgConnected ? "border-white/[0.14] bg-white/[0.07] text-white/86" : "border-white/[0.1] bg-white/[0.04] text-white/45"}`}>
                      {tgConnected ? "ON" : "OFF"}
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/31">Личный код</div>
                    <div className="mt-1 truncate font-mono text-sm font-bold tracking-[0.05em] text-white/84">{shownTgCode}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                    <PrimaryButton onClick={openTelegramBot} disabled={tgLoading} className="min-w-0">
                      <Send className="h-4 w-4" />
                      <span className="truncate">Открыть бота</span>
                    </PrimaryButton>
                    <SoftButton
                      disabled={!canUseVipTools || !tgLast4 || tgLoading}
                      onClick={async () => {
                        if (!canUseVipTools) {
                          setVipGate("Полный просмотр личного Telegram-кода доступен только с VIP.");
                          return;
                        }
                        try {
                          if (!tgReveal) await ensureFullTgCode();
                          setTgReveal((value) => !value);
                        } catch {
                          setTgMessage({ type: "error", text: "Не удалось получить код. Попробуй ещё раз." });
                        }
                      }}
                      className="w-10 px-0"
                      title={tgReveal ? "Скрыть код" : "Показать код"}
                    >
                      {tgReveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </SoftButton>
                    <SoftButton
                      disabled={!canUseVipTools || !tgLast4 || tgLoading}
                      onClick={async () => {
                        if (!canUseVipTools) {
                          setVipGate("Копирование личного Telegram-кода доступно только с VIP.");
                          return;
                        }
                        try {
                          const code = await ensureFullTgCode();
                          await flashCopy(code, "tg");
                        } catch {
                          setTgMessage({ type: "error", text: "Не удалось скопировать код." });
                        }
                      }}
                      className="w-10 px-0"
                      title="Скопировать код"
                    >
                      {copyState === "tg" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </SoftButton>
                  </div>
                </div>
                {!canUseVipTools ? (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-white/[0.11] bg-white/[0.05] px-3 py-2.5 text-xs leading-relaxed text-white/68">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Полный код и копирование открываются с VIP, GOLD или ADMIN.
                  </div>
                ) : null}
                {tgMessage ? (
                  <div className={`mt-3 rounded-2xl border px-3 py-2.5 text-xs font-semibold ${tgMessage.type === "error" ? "border-rose-400/20 bg-rose-400/10 text-rose-100" : "border-white/[0.14] bg-white/[0.07] text-white/86"}`}>
                    {tgMessage.text}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-6 text-center text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/18">NightcoreX Development</div>
      </div>

      <Modal open={characterManagerOpen} onClose={() => !charactersLoading && setCharacterManagerOpen(false)} maxWidth="max-w-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-5 md:px-6">
          <div className="flex items-start gap-3">
            <MiniIcon tone="violet"><Users className="h-[18px] w-[18px]" /></MiniIcon>
            <div>
              <div className="text-base font-extrabold text-white">Персонажи</div>
              <div className="mt-1 text-xs leading-relaxed text-white/44">У каждого персонажа свои записи, таймеры и прогресс.</div>
            </div>
          </div>
          <button type="button" aria-label="Закрыть" onClick={() => setCharacterManagerOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.045] text-white/65 transition hover:bg-white/[0.09] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 md:p-6">
          <div className="grid gap-2">
            {characters.map((character) => {
              const isActive = String(character.id) === String(activeCharacterId);
              return (
                <div key={character.id} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${isActive ? "border-white/[0.17] bg-white/[0.075]" : "border-white/[0.08] bg-black/20"}`}>
                  <MiniIcon tone={isActive ? "violet" : "neutral"}><UserRound className="h-[18px] w-[18px]" /></MiniIcon>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white/92">{character.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-white/30">{character.id}</div>
                  </div>
                  {isActive ? <span className="rounded-full border border-white/[0.14] bg-white/[0.07] px-2.5 py-1 text-[10px] font-extrabold tracking-[0.12em] text-white/82">ACTIVE</span> : null}
                  {!isActive ? (
                    <SoftButton disabled={charactersLoading} onClick={() => selectCharacter(character.id)} className="shrink-0">Выбрать</SoftButton>
                  ) : null}
                  <button
                    type="button"
                    disabled={charactersLoading || characters.length <= 1}
                    onClick={() => setDeleteTarget(character)}
                    title={characters.length <= 1 ? "Нельзя удалить последний профиль" : "Удалить персонажа"}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-white/45 transition hover:border-rose-400/22 hover:bg-rose-400/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-25"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            {!charactersLoading && characters.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.12] px-4 py-8 text-center text-sm text-white/42">Профили пока не найдены.</div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-3.5">
            <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-white/34">Новый персонаж</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={newCharacterName}
                onChange={(event) => setNewCharacterName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && createCharacter()}
                placeholder="Например: Second Character"
                className="h-10 min-w-0 flex-1 rounded-2xl border border-white/[0.11] bg-black/28 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/26 focus:border-white/28"
              />
              <PrimaryButton onClick={createCharacter} disabled={charactersLoading || !newCharacterName.trim()} className="shrink-0">
                {charactersLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Создать
              </PrimaryButton>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => !charactersLoading && setDeleteTarget(null)} maxWidth="max-w-md">
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-3">
            <MiniIcon tone="rose"><AlertTriangle className="h-[18px] w-[18px]" /></MiniIcon>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-extrabold text-white">Удалить персонажа?</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/45">Удалятся статистика, таймеры и записи этого персонажа. Отменить это действие нельзя.</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/[0.09] bg-black/25 p-3">
            <div className="truncate text-sm font-bold text-white/92">{deleteTarget?.name || "—"}</div>
            <div className="mt-1 truncate font-mono text-[10px] text-white/30">{deleteTarget?.id || "—"}</div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <SoftButton disabled={charactersLoading} onClick={() => setDeleteTarget(null)}>Отмена</SoftButton>
            <DangerButton disabled={charactersLoading} onClick={deleteCharacter}>
              {charactersLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Удалить
            </DangerButton>
          </div>
        </div>
      </Modal>

      <Modal open={!!vipGate} onClose={() => setVipGate(null)} maxWidth="max-w-md">
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-3">
            <MiniIcon tone="amber"><Lock className="h-[18px] w-[18px]" /></MiniIcon>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-white">Нужен VIP</div>
              <div className="mt-1 text-sm leading-relaxed text-white/46">{vipGate}</div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.09] bg-black/25 px-3.5 py-3">
            <span className="text-xs font-semibold text-white/44">Оформление VIP</span>
            <span className="rounded-full border border-white/[0.10] bg-white/[0.055] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/62">
              Временно недоступно
            </span>
          </div>

          <div className="mt-5 flex justify-end">
            <SoftButton onClick={() => setVipGate(null)}>Закрыть</SoftButton>
          </div>
        </div>
      </Modal>

      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} maxWidth="max-w-md">
        <div className="p-5 text-center md:p-6">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-rose-100"><LogOut className="h-5 w-5" /></div>
          <h3 className="mt-4 text-lg font-extrabold text-white">Выйти из аккаунта?</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/45">Текущая сессия будет завершена, и для входа понадобится авторизация снова.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <SoftButton onClick={() => setLogoutOpen(false)}>Остаться</SoftButton>
            <DangerButton
              onClick={() => {
                logout();
                window.location.hash = "#/login";
              }}
            >
              Выйти
            </DangerButton>
          </div>
        </div>
      </Modal>

      <style>{`
        .nc-scale-range {
          appearance: none;
          height: 4px;
          border-radius: 999px;
          background: rgba(255,255,255,0.16);
          outline: none;
          cursor: pointer;
        }
        .nc-scale-range::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 3px solid #101218;
          background: #f4f4f5;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.2), 0 4px 10px rgba(0,0,0,0.45);
        }
        .nc-scale-range::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 3px solid #101218;
          background: #f4f4f5;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.2), 0 4px 10px rgba(0,0,0,0.45);
        }
      `}</style>
    </div>
  );
}
