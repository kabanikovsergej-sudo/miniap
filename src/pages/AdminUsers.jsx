// src/pages/AdminUsers.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Users,
  Search,
  ChevronDown,
  Check,
  Crown,
  Star,
  User as UserIcon,
  RefreshCw,
  Pencil,
  X,
  Trash2,
  CalendarDays,
  Copy,
  MessageCircle,
  Send
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

/* ================== LOCAL API (FIX JSON BODY) ================== */
const RAW_API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:3001";

function normalizeBaseUrl(raw) {
  if (!raw) return "";
  let s = String(raw).trim().replace(/^["']|["']$/g, "");
  if (/^VITE_API_URL\s*=/i.test(s)) s = s.replace(/^VITE_API_URL\s*=/i, "").trim();
  if (/^[A-Z0-9_]+\s*=\s*https?:\/\//i.test(s)) s = s.replace(/^[A-Z0-9_]+\s*=\s*/i, "").trim();
  s = s.replace(/\/+$/, "");
  return s;
}
const API_URL = normalizeBaseUrl(RAW_API_URL) || "http://127.0.0.1:3001";

function getTokenSafe() {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

async function apiJson(path, { method = "GET", body } = {}) {
  const token = getTokenSafe();
  const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const txt = await res.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = txt;
  }

  if (!res.ok) {
    const msg =
      data && (data.error || data.message)
        ? (data.error || data.message)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* ================== ROLE META ================== */
const ROLE_META = {
  free: {
    label: "FREE",
    icon: UserIcon,
    color:
      "text-slate-500 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-white/5 dark:border-white/10"
  },
  vip: {
    label: "VIP",
    icon: Star,
    color:
      "text-pink-600 bg-pink-100 border-pink-200 dark:text-pink-400 dark:bg-pink-500/10 dark:border-pink-500/20"
  },
  gold: {
    label: "Gold",
    icon: Crown,
    color:
      "text-yellow-500 bg-yellow-500/10 border-yellow-500/20 dark:text-yellow-300 dark:bg-yellow-500/10 dark:border-yellow-500/20"
  },

  support: {
    label: "SUPPORT",
    icon: Users,
    color:
      "text-sky-600 bg-sky-100 border-sky-200 dark:text-sky-300 dark:bg-sky-500/10 dark:border-sky-500/20"
  },

  admin: {
    label: "ADMIN",
    icon: Crown,
    color:
      "text-red-600 bg-red-100 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20"
  }
};

/* ================== HELPERS ================== */
function useOnClickOutsideMulti(refs, handler, when = true) {
  useEffect(() => {
    if (!when) return;

    const listener = (e) => {
      const inside = refs.some((r) => r?.current && r.current.contains(e.target));
      if (!inside) handler();
    };

    document.addEventListener("pointerdown", listener);
    return () => document.removeEventListener("pointerdown", listener);
  }, [refs, handler, when]);
}

function fmtDate(d) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const yy = x.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function toISODateOrNull(ddmmyyyy) {
  const s = (ddmmyyyy || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  const dt = new Date(yy, mm - 1, dd, 23, 59, 59);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/**
 * Display name:
 * - Prefer discord name only if actually bound to discord
 * - Otherwise use username
 */
function displayName(u) {
  const uname = String(u?.username || "").trim();

  const dname = String(
    u?.discord_username ||
    u?.discordUsername ||
    u?.discord_name ||
    ""
  ).trim();

  const discordBound = !!(
    String(u?.discord_id || u?.discordId || u?.discord_user_id || u?.discordUserId || "").trim() ||
    String(u?.discord_avatar || u?.discordAvatar || u?.avatar_hash || "").trim() ||
    String(u?.discord_avatar_url || u?.discordAvatarUrl || "").trim() ||
    dname
  );

  if (discordBound && dname) return dname;
  return uname || dname || "User";
}

/**
 * ID shown in UI:
 * If discord exists -> show discord id (as you had)
 * Else show telegram_id (so admin can still copy something)
 */
function publicId(u) {
  const did = String(u?.discord_id || u?.discordId || u?.discord_user_id || u?.discordUserId || "").trim();
  if (did) return did;
  const tid = String(u?.telegram_id || u?.telegramId || u?.tg_id || u?.tgId || "").trim();
  return tid;
}

/**
 * Telegram avatar URL candidates
 * (backend must return one of these fields)
 */
function telegramAvatarDirect(u) {
  const direct = String(
    u?.telegram_photo_url ||
    u?.telegram_avatar_url ||
    u?.telegram_photo ||
    u?.telegramAvatarUrl ||
    u?.telegram_avatar ||
    u?.tg_photo_url ||
    u?.tg_avatar_url ||
    u?.tg_photo ||
    u?.tgAvatarUrl ||
    u?.photo_telegram ||
    u?.avatar_telegram ||
    u?.telegram_pfp ||
    u?.tg_pfp ||
    ""
  ).trim();

  if (!direct) return "";
  if (/^https?:\/\//i.test(direct)) return direct;

  // Sometimes backend can return "//domain/path"
  if (/^\/\//.test(direct)) return `https:${direct}`;

  return "";
}

function isDiscordBound(u) {
  const id = String(u?.discord_id || u?.discordId || u?.discord_user_id || u?.discordUserId || "").trim();
  const hash = String(u?.discord_avatar || u?.discordAvatar || u?.avatar_hash || "").trim();
  const dname = String(u?.discord_username || u?.discordUsername || u?.discord_name || "").trim();
  const url = String(u?.discord_avatar_url || u?.discordAvatarUrl || u?.discord_avatar || "").trim();
  return !!(id || hash || dname || /^https?:\/\//i.test(url));
}

function avatarUrl(u, size = 96) {
  // ✅ 0) If user is NOT discord-bound -> prefer Telegram avatar first
  if (!isDiscordBound(u)) {
    const tg = telegramAvatarDirect(u);
    if (tg) return tg;

    // Optional: if you store generic avatar_url for TG users, keep it as fallback
    const generic = String(
      u?.avatar_url ||
      u?.avatar ||
      u?.photo_url ||
      u?.pfp ||
      u?.image ||
      u?.avatarUrl ||
      ""
    ).trim();
    if (generic && /^https?:\/\//i.test(generic)) return generic;

    // no TG photo -> initials fallback (return empty)
    return "";
  }

  // ✅ 1) Direct URLs (preferred)
  const direct =
    String(
      u?.avatar_url ||
      u?.avatar ||
      u?.photo_url ||
      u?.pfp ||
      u?.image ||
      u?.discord_avatar_url ||
      u?.discordAvatarUrl ||
      u?.avatarUrl ||
      ""
    ).trim();
  if (direct) return direct;

  // ✅ 2) Some backends store discord_avatar as a FULL URL (not a hash)
  const maybeUrl = String(u?.discord_avatar || u?.discordAvatar || "").trim();
  if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;

  // ✅ 3) Standard Discord CDN: need discord_id + avatar hash
  const id = String(u?.discord_id || u?.discordId || u?.discord_user_id || u?.discordUserId || "").trim();
  const hash = String(u?.discord_avatar || u?.discordAvatar || u?.avatar_hash || "").trim();
  if (id && hash) {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=${size}`;
  }

  // ✅ 4) Fallback: Discord default avatar (pick stable index 0-5)
  if (id) {
    let idx = 0;
    try {
      const n = BigInt(id);
      idx = Number(n % 6n);
    } catch {
      idx = Math.abs(Array.from(id).reduce((a, c) => a + c.charCodeAt(0), 0)) % 6;
    }
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png?size=${size}`;
  }

  return "";
}

function initialsFromName(name) {
  const s = String(name || "").trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "U";
  const b = parts.length > 1 ? (parts[1]?.[0] || "") : (parts[0]?.[1] || "");
  return (a + b).toUpperCase();
}

function calcMenuPos(btnEl, itemsLen, maxH = 320) {
  const r = btnEl.getBoundingClientRect();
  const rowH = 42;
  const menuH = Math.min(itemsLen * rowH, maxH);
  const spaceBelow = window.innerHeight - r.bottom;
  const openUp = spaceBelow < menuH + 12;
  const top = openUp ? r.top - (menuH + 8) : r.bottom + 8;
  return { left: Math.round(r.left), top: Math.round(top), width: Math.round(r.width) };
}

/* ================== AVATAR (robust fallback) ================== */
function UserAvatar({ u, meta }) {
  const [failed, setFailed] = useState(false);
  const name = displayName(u);
  const url = failed ? "" : avatarUrl(u, 96);
  const Icon = meta?.icon || UserIcon;

  return (
    <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 shrink-0">
      {url ? (
        <img
          key={url}
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full grid place-items-center text-sm font-extrabold text-slate-700 dark:text-white/80">
          {initialsFromName(name)}
        </div>
      )}

      {/* small role badge icon (keeps role visible) */}
      <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-lg border flex items-center justify-center ${meta.color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}

/* ================== DROPDOWN ================== */
function Dropdown({ value, items, onChange }) {
  const [open, setOpen] = useState(false);

  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const [pos, setPos] = useState(null);

  const close = () => {
    setOpen(false);
    setPos(null);
  };

  useOnClickOutsideMulti([rootRef, menuRef], close, open);

  const recalc = () => {
    const el = btnRef.current;
    if (!el) return;
    setPos(calcMenuPos(el, items.length, 320));
  };

  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") close();
    };

    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    document.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);

  const openNow = () => {
    recalc();
    setOpen(true);
  };

  const menu =
    open && pos ? (
      <div
        ref={menuRef}
        style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          width: pos.width,
          zIndex: 2147483647
        }}
        className="rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1117]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {items.map((it) => {
          const active = it === value;
          return (
            <button
              key={it}
              type="button"
              onClick={() => {
                onChange(it);
                close();
              }}
              className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between
              ${active
                  ? "bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/5"
                }`}
            >
              <span>{it}</span>
              {active ? (
                <Check className="w-4 h-4 text-slate-700 dark:text-white/70" />
              ) : (
                <span className="w-4 h-4" />
              )}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : openNow())}
        className="h-12 min-w-[150px] px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-between"
      >
        <span className="text-sm">{value}</span>
        <ChevronDown
          className={`w-4 h-4 transition text-slate-500 dark:text-white/50 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

function ModalDropdown({ value, items, onChange }) {
  const [open, setOpen] = useState(false);

  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const [pos, setPos] = useState(null);

  const close = () => {
    setOpen(false);
    setPos(null);
  };

  useOnClickOutsideMulti([rootRef, menuRef], close, open);

  const recalc = () => {
    const el = btnRef.current;
    if (!el) return;
    setPos(calcMenuPos(el, items.length, 240));
  };

  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") close();
    };

    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    document.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);

  const openNow = () => {
    recalc();
    setOpen(true);
  };

  const menu =
    open && pos ? (
      <div
        ref={menuRef}
        style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          width: pos.width,
          zIndex: 2147483647
        }}
        className="rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1117]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {items.map((it) => {
          const active = it === value;
          return (
            <button
              key={it}
              type="button"
              onClick={() => {
                onChange(it);
                close();
              }}
              className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between
              ${active
                  ? "bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/5"
                }`}
            >
              <span>{it}</span>
              {active ? (
                <Check className="w-4 h-4 text-slate-700 dark:text-white/70" />
              ) : (
                <span className="w-4 h-4" />
              )}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : openNow())}
        className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white flex items-center justify-between hover:bg-slate-100 dark:hover:bg-white/10"
      >
        <span className="text-sm">{value}</span>
        <ChevronDown
          className={`w-4 h-4 transition text-slate-500 dark:text-white/50 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

/* ================== OPTIONS ================== */
const ROLE_ITEMS = ["All Roles", "Free", "VIP", "Gold", "Support", "Admin"];
const VIP_ITEMS = ["All VIP", "Active VIP", "Expired", "No VIP"];
const SORT_ITEMS = ["Newest First", "Oldest First", "Name A-Z"];
const EDIT_ROLE_ITEMS = ["Free", "VIP", "Gold", "Admin"];

/* ================== EDIT MODAL ================== */
function EditUserModal({ open, user, onClose, onSaved, viewerRole }) {
  const panelRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("Free");
  const [telegramId, setTelegramId] = useState("");
  const [note, setNote] = useState("");

  const [addDays, setAddDays] = useState("0");
  const [vipDate, setVipDate] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setFullName(user.username || user.discord_username || "User");
    setRole(String(user.role || "free").toLowerCase().replace(/^./, (c) => c.toUpperCase()));
    setTelegramId(user.telegram_id ? String(user.telegram_id) : "");
    setNote(user.note || user.memo || user.internal_note || "");
    setAddDays("0");
    setVipDate(user.vip_until ? fmtDate(user.vip_until) : "");
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useOnClickOutsideMulti([panelRef], onClose, open);

  if (!open || !user) return null;

  const isDiscordBound = !!(user?.discord_username || user?.discord_id);
  const isSupportViewer = String(viewerRole || "").toLowerCase() === "support";

  async function saveEdit() {
    setSaving(true);
    try {
      const days = Math.max(0, Number(addDays || 0) || 0);
      const vipUntilIso = toISODateOrNull(vipDate);
      const trimmedNote = (note || "").trim() || null;

      const nextRole = (role || "").toLowerCase();
      const safeRole = ["free", "vip", "gold", "admin"].includes(nextRole) ? nextRole : "free";
      const safeSupportRole = ["free", "vip", "gold"].includes(nextRole) ? nextRole : "free";

      const body = isSupportViewer
        ? { role: safeSupportRole }
        : {
          ...(isDiscordBound ? {} : { username: fullName }),
          role: safeRole,
          telegram_id: telegramId ? String(telegramId) : null,

          vip_add_days: days,
          vip_days: days,
          add_days: days,

          vip_until: vipUntilIso,
          vipUntil: vipUntilIso,
          vip_date: vipUntilIso,
          vipDate: vipUntilIso,

          note: trimmedNote,
          memo: trimmedNote,
          internal_note: trimmedNote,
        };

      await apiJson(`/admin/users/${user.id}`, { method: "PATCH", body });
      try {
        window.dispatchEvent(new Event("nightcore:me"));
      } catch {
        // ignore
      }

      onSaved?.();
      onClose();
    } catch (e) {
      console.error(e);
      alert(`Save failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[2147483647]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          className="w-full max-w-[560px] rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1117] shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
            <div className="text-lg font-semibold text-slate-900 dark:text-white">Edit User</div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-600 dark:text-white/70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            {!isSupportViewer && (
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-white/70 mb-2">User</div>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isDiscordBound}
                  className="h-11 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30"
                />
                {isDiscordBound ? (
                  <div className="mt-2 text-[12px] text-slate-500 dark:text-white/45">
                    Username берётся из Discord. Редактирование отключено.
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-white/70 mb-2">Role</div>
              <ModalDropdown value={role} items={isSupportViewer ? ["Free", "VIP", "Gold"] : EDIT_ROLE_ITEMS} onChange={setRole} />
            </div>

            {!isSupportViewer && (
              <>
                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-white/70 mb-2">Telegram ID</div>
                  <Input
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                    placeholder="Optional"
                    className="h-11 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30"
                  />
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-white/70 mb-2">Note (keywords)</div>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="FamQ / GOLD / что угодно…"
                    className="h-11 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30"
                  />
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-white/10" />

                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white/80">
                  <Crown className="w-4 h-4 text-amber-500" />
                  VIP Management
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm text-slate-600 dark:text-white/60 mb-2">Add Days</div>
                    <Input
                      value={addDays}
                      onChange={(e) => setAddDays(e.target.value.replace(/[^\d]/g, ""))}
                      className="h-11 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <div className="text-sm text-slate-600 dark:text-white/60 mb-2">Set Date</div>
                    <div className="relative">
                      <Input
                        value={vipDate}
                        onChange={(e) => setVipDate(e.target.value)}
                        placeholder="dd.mm.yyyy"
                        className="h-11 pr-10 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30"
                      />

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 text-slate-500 dark:text-white/50 pointer-events-none">
                        <CalendarDays className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-11 rounded-xl border-slate-200 dark:border-white/10 text-slate-700 dark:text-white bg-transparent"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}


/* ================== MESSAGE MODAL ================== */
function MessageModal({ open, target, allMode = false, onClose, onSent }) {
  const panelRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState(allMode ? "Объявление" : "Сообщение от администрации");
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(allMode ? "Объявление" : "Сообщение от администрации");
    setText("");
  }, [open, allMode, target?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useOnClickOutsideMulti([panelRef], onClose, open);

  if (!open) return null;

  const targetName = allMode ? "Всем пользователям" : (displayName(target) || "User");

  async function sendNow() {
    const t = (title || "").trim();
    const b = (text || "").trim();
    if (!b) {
      alert("Напиши текст сообщения.");
      return;
    }

    setSending(true);
    try {
      await apiJson("/admin/notifications/send", {
        method: "POST",
        body: allMode
          ? { all: true, type: "admin_broadcast", title: t || "Объявление", body: b, data: {} }
          : { user_id: target?.id, type: "admin_message", title: t || "Сообщение", body: b, data: {} },
      });

      onSent?.();
      onClose();
    } catch (e) {
      console.error(e);
      alert(`Send failed: ${e?.message || e}`);
    } finally {
      setSending(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[2147483647]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          className="w-full max-w-[560px] rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f1117] shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
            <div className="text-lg font-semibold text-slate-900 dark:text-white">
              {allMode ? "Рассылка" : "Сообщение"} — {targetName}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-600 dark:text-white/70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-white/70 mb-2">Заголовок</div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Важное объявление"
                className="h-11 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30"
              />
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-white/70 mb-2">Текст</div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Напиши сообщение…"
                rows={5}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <div className="mt-2 text-[12px] text-slate-500 dark:text-white/45">
                Сообщение придёт в уведомления (колокольчик).
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-11 rounded-xl border-slate-200 dark:border-white/10 text-slate-700 dark:text-white bg-transparent"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={sendNow}
              disabled={sending}
              className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700"
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

/* ================== PAGE ================== */
export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [meRole, setMeRole] = useState("free");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [vipFilter, setVipFilter] = useState("All VIP");
  const [sort, setSort] = useState("Newest First");

  const [editUser, setEditUser] = useState(null);
  const [msgUser, setMsgUser] = useState(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  // per-user action loading
  const [actionBusyId, setActionBusyId] = useState(null);
  const [copiedPublicId, setCopiedPublicId] = useState("");

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api("/admin/users");
      setUsers(Array.isArray(res) ? res : res?.users || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const me = await apiJson("/me");
        setMeRole(String(me?.role || "free").toLowerCase());
      } catch {
        // ignore
      }
    })();
    loadUsers();
  }, []);

  const isSupportViewer = meRole === "support";
  const isAdminViewer = ["admin", "owner", "superadmin"].includes(meRole);
  const canDeleteUsers = isAdminViewer;

  const stats = useMemo(() => {
    const total = users.length;
    const byRole = { free: 0, vip: 0, gold: 0, support: 0, admin: 0 };
    for (const u of users) {
      const r = (u.role || "free").toLowerCase();
      if (byRole[r] != null) byRole[r] += 1;
    }
    return { total, ...byRole };
  }, [users]);

  const filtered = useMemo(() => {
    let list = [...users];
    const q = (search || "").toLowerCase();

    if (q) {
      list = list.filter((u) =>
        `${u.username || ""} ${u.discord_username || ""} ${u.telegram_id || ""} ${publicId(u)} ${u.note || u.memo || u.internal_note || ""}`
          .toLowerCase()
          .includes(q)
      );
    }

    if (roleFilter !== "All Roles") {
      list = list.filter((u) => (u.role || "").toLowerCase() === roleFilter.toLowerCase());
    }

    const vipMs = (u) => (u.vip_until ? new Date(u.vip_until).getTime() : 0);
    const now = Date.now();

    if (vipFilter === "Active VIP") list = list.filter((u) => vipMs(u) > now);
    if (vipFilter === "Expired") list = list.filter((u) => vipMs(u) && vipMs(u) <= now);
    if (vipFilter === "No VIP") list = list.filter((u) => !vipMs(u));

    const createdMs = (u) => (u.created_at ? new Date(u.created_at).getTime() : 0);

    if (sort === "Newest First") list.sort((a, b) => createdMs(b) - createdMs(a));
    if (sort === "Oldest First") list.sort((a, b) => createdMs(a) - createdMs(b));
    if (sort === "Name A-Z") list.sort((a, b) => displayName(a).localeCompare(displayName(b)));

    return list;
  }, [users, search, roleFilter, vipFilter, sort]);

  async function runAction(userId, fn) {
    setActionBusyId(userId);
    try {
      await fn();
      await loadUsers();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="h-full p-4 bg-slate-50 dark:bg-transparent text-slate-900 dark:text-white overflow-hidden">
      <div className="w-full max-w-6xl mx-auto">
        {/* STATS */}
        <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl p-5 shadow-2xl shadow-black/10 dark:shadow-black/20">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-white/45">Total Users</div>
                <div className="mt-1 text-2xl font-extrabold">{stats.total}</div>
              </div>
              <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
                <Users className="w-5 h-5 text-sky-500 dark:text-sky-400" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl p-5 shadow-2xl shadow-black/10 dark:shadow-black/20">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-white/45">Free</div>
                <div className="mt-1 text-2xl font-extrabold">{stats.free}</div>
              </div>
              <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-slate-500 dark:text-white/45" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl p-5 shadow-2xl shadow-black/10 dark:shadow-black/20">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-white/45">VIP</div>
                <div className="mt-1 text-2xl font-extrabold text-fuchsia-600 dark:text-fuchsia-300">{stats.vip}</div>
              </div>
              <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
                <Star className="w-5 h-5 text-fuchsia-500 dark:text-fuchsia-400" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl p-5 shadow-2xl shadow-black/10 dark:shadow-black/20">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-white/45">Admins</div>
                <div className="mt-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-300">{stats.admin}</div>
              </div>
              <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
                <Crown className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        {/* SEARCH + FILTERS */}
        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl p-5 shadow-2xl">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-white/30" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, id, Telegram, note..."
                className="h-12 pl-12 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30"
              />
              <div className="mt-2 text-xs text-slate-500 dark:text-white/40">
                Showing {filtered.length} of {users.length} users
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Dropdown value={roleFilter} items={ROLE_ITEMS} onChange={setRoleFilter} />
              <Dropdown value={vipFilter} items={VIP_ITEMS} onChange={setVipFilter} />
              <Dropdown value={sort} items={SORT_ITEMS} onChange={setSort} />

              
              {isAdminViewer && (
                <Button
                  type="button"
                  onClick={() => setBroadcastOpen(true)}
                  className="h-12 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Рассылка
                </Button>
              )}

<Button
                type="button"
                onClick={loadUsers}
                disabled={loading}
                className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* USERS */}
        <div className="mt-6 relative z-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 justify-items-start">
          {filtered.map((u) => {
            const role = (u.role || "free").toLowerCase();
            const Meta = ROLE_META[role] || ROLE_META.free;
            const busy = actionBusyId === u.id;

            return (
              <motion.div
                key={u.id}
                layout
                className="relative w-full max-w-[520px] rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl p-5 shadow-2xl shadow-black/10 dark:shadow-black/20"
              >
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {canDeleteUsers && (
                    <button
                      type="button"
                      title="Delete user"
                      onClick={() =>
                        runAction(u.id, async () => {
                          const name = displayName(u);
                          if (!confirm(`Delete user ${name}? This will remove them from DB.`)) return;
                          await apiJson(`/admin/users/${u.id}`, { method: "DELETE" });
                          setUsers((prev) => prev.filter((x) => x.id !== u.id));
                        })
                      }
                      className="w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-rose-100 dark:hover:bg-rose-500/10 text-slate-600 dark:text-white/60 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {isAdminViewer && (
                    <button
                      type="button"
                      title="Send message"
                      onClick={() => setMsgUser(u)}
                      className="w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/60 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center justify-center transition"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    title="Edit user"
                    onClick={() => setEditUser(u)}
                    className="w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-start justify-between gap-4 pr-24">
                  <div className="flex items-center gap-4 min-w-0">
                    <UserAvatar u={u} meta={Meta} />

                    <div className="min-w-0">
                      {u.banned_until ? (
                        <div className="text-[11px] leading-snug text-red-500 dark:text-red-400 truncate mb-0.5">
                          BANNED until {new Date(u.banned_until).toLocaleDateString()}
                        </div>
                      ) : (u.note || u.memo || u.internal_note) ? (
                        <div className="text-[11px] leading-snug text-slate-500 dark:text-white/45 truncate mb-0.5">
                          {String(u.note || u.memo || u.internal_note)}
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate max-w-[240px] sm:max-w-[320px]">
                          {displayName(u)}
                        </span>
                        <Badge className={`text-[10px] ${Meta.color} shrink-0`}>{Meta.label}</Badge>
                      </div>

                      <div className="mt-1 text-xs text-slate-500 dark:text-white/40 flex items-center gap-2">
                        <span>ID: <span className="font-mono">{publicId(u) || "—"}</span></span>
                        {publicId(u) ? (
                          <button
                            type="button"
                            title="Copy ID"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(publicId(u));
                                setCopiedPublicId(publicId(u));
                                setTimeout(() => setCopiedPublicId(""), 1200);
                              } catch { }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-white/70"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[11px]">
                              {copiedPublicId === publicId(u) ? "Copied" : "Copy"}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-500 dark:text-white/40">
                  TG: {u.telegram_id || "—"}
                </div>

                {!isSupportViewer && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() =>
                        runAction(u.id, async () => {
                          const name = displayName(u) || u.id;
                          if (!confirm(`Kick user ${name}?`)) return;
                          await apiJson(`/admin/users/${u.id}/kick`, { method: "POST" });
                        })
                      }
                      className={`px-3 py-1 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 ${busy ? "opacity-50 pointer-events-none" : ""
                        }`}
                    >
                      Kick
                    </button>

                    {u.banned_until ? (
                      <button
                        disabled={busy}
                        onClick={() =>
                          runAction(u.id, async () => {
                            const name = displayName(u) || u.id;
                            if (!confirm(`Unban user ${name}?`)) return;
                            await apiJson(`/admin/users/${u.id}/unban`, { method: "POST" });
                          })
                        }
                        className={`px-3 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 ${busy ? "opacity-50 pointer-events-none" : ""
                          }`}
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() =>
                          runAction(u.id, async () => {
                            const name = displayName(u) || u.id;
                            if (!confirm(`Ban user ${name} for 7 days?`)) return;
                            await apiJson(`/admin/users/${u.id}/ban`, {
                              method: "POST",
                              body: { days: 7, reason: "Admin ban" }
                            });
                          })
                        }
                        className={`px-3 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 ${busy ? "opacity-50 pointer-events-none" : ""
                          }`}
                      >
                        Ban
                      </button>
                    )}
                  </div>
                )}

                <div className="absolute bottom-3 right-3 text-[11px] text-slate-400 dark:text-white/35 whitespace-nowrap">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <EditUserModal
        open={!!editUser}
        user={editUser}
        onClose={() => setEditUser(null)}
        onSaved={loadUsers}
        viewerRole={meRole}
      />

      <MessageModal
        open={!!msgUser}
        target={msgUser}
        allMode={false}
        onClose={() => setMsgUser(null)}
        onSent={loadUsers}
      />

      <MessageModal
        open={broadcastOpen}
        target={null}
        allMode={true}
        onClose={() => setBroadcastOpen(false)}
        onSent={loadUsers}
      />
    </div>
  );
}
