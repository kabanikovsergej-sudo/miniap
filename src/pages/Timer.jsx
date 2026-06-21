// MULTI_TIMER_PREMIUM_V3 — заменяет старый Timer.jsx (не удалять эту строку; по ней легко проверить, что файл обновился).
// В этом варианте один таймер показывается крупно, а все остальные одновременно — карточками ниже.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getApiBase } from "@/lib/auth";
import {
  Bell,
  ChevronDown,
  Clock3,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer as TimerIcon,
  Trash2,
  X,
} from "lucide-react";

const PRIVILEGED_STATUSES = new Set(["ADMIN", "GOLD", "VIP", "SUPPORT"]);
const LS_KEY_TIMERS = "resale_timers_v1";
const LS_KEY_DRAFT = "resale_timer_draft_v2";

const PRESETS = [
  { value: "mail", label: "Почта", seconds: 10 * 60 },
  { value: "org", label: "Организация", seconds: 2 * 60 * 60 },
  { value: "taro", label: "Карты таро", seconds: 3 * 60 * 60 },
  { value: "train", label: "Дрессировка", seconds: 15 * 60 },
  { value: "carjack", label: "Автоугон", seconds: 90 * 60 },
  { value: "pimp", label: "Сутенёрка", seconds: 90 * 60 },
  { value: "bus", label: "Автобус", seconds: 3 * 60 },
  { value: "club", label: "Задание клуба", seconds: 2 * 60 * 60 },
  { value: "range", label: "Тир", seconds: 90 * 60 },
  { value: "contraband", label: "Контрабанда", seconds: 5 * 60 },
  { value: "custom", label: "Свой таймер", seconds: null },
];

async function ensureActiveCharacterId(apiBase) {
  try {
    const cached = localStorage.getItem("active_character_id");
    if (cached) return cached;

    const token = localStorage.getItem("auth_token");
    if (!token || !apiBase) return null;

    const res = await fetch(`${apiBase}/characters`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const list = await res.json();
    const firstId = list?.[0]?.id;
    if (firstId) localStorage.setItem("active_character_id", firstId);
    return firstId || null;
  } catch {
    return null;
  }
}

function makeId() {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeParse(raw, fallback = null) {
  try {
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function formatDuration(rawSeconds) {
  const seconds = Math.max(0, Math.ceil(Number(rawSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

function isRentalTimer(timer) {
  const label = String(timer?.label || "").trim();
  return label.startsWith("Аренда:") || label.startsWith("RENTAL:") || label.includes("__RENTAL__");
}

function getRemaining(timer, now = Date.now()) {
  const fallback = Math.max(0, Number(timer?.remaining) || 0);
  if (!timer?.running) return fallback;

  const endAt = Number(timer?.endAt || 0);
  if (!Number.isFinite(endAt) || endAt <= 0) return fallback;
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

function normalizeTimer(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id || makeId());
  const derivedTotal = raw.endAt && raw.startedAt
    ? Math.max(0, Math.round((Number(raw.endAt) - Number(raw.startedAt)) / 1000))
    : 0;
  const baseTotal = Math.max(
    0,
    Number(raw.baseTotal ?? raw.total ?? derivedTotal ?? raw.remaining) || 0
  );

  const rawRemaining = Math.max(0, Number(raw.remaining ?? baseTotal) || 0);
  const endAt = Number(raw.endAt || 0) || null;
  const wasRunning = Boolean(raw.running && endAt);
  const liveRemaining = wasRunning
    ? Math.max(0, Math.ceil((endAt - now) / 1000))
    : rawRemaining;
  const finished = liveRemaining <= 0 && Boolean(raw.finishedAt || raw.fired);

  return {
    id,
    label: String(raw.label || "Таймер").trim() || "Таймер",
    baseTotal: baseTotal || rawRemaining,
    total: baseTotal || rawRemaining,
    remaining: liveRemaining,
    running: wasRunning && liveRemaining > 0,
    startedAt: Number(raw.startedAt || now),
    endAt: wasRunning && liveRemaining > 0 ? endAt : null,
    finishedAt: finished ? Number(raw.finishedAt || now) : null,
    _alerted: Boolean(raw._alerted || raw.fired),
    _tgSent: Boolean(raw._tgSent || raw.notified),
  };
}

function timerStorageKey(characterId) {
  return `${LS_KEY_TIMERS}:${characterId || "global"}`;
}

function draftStorageKey(characterId) {
  return `${LS_KEY_DRAFT}:${characterId || "global"}`;
}

export default function Timer({ userStatus = "FREE" }) {
  const API_BASE = useMemo(() => {
    try {
      return typeof getApiBase === "function" ? getApiBase() : "";
    } catch {
      return "";
    }
  }, []);

  const [characterId, setCharacterId] = useState(() => {
    try {
      return localStorage.getItem("active_character_id") || null;
    } catch {
      return null;
    }
  });
  const [timers, setTimers] = useState([]);
  const [tick, setTick] = useState(() => Date.now());
  const [featuredTimerId, setFeaturedTimerId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [resolvedStatus, setResolvedStatus] = useState(null);
  const [draft, setDraft] = useState({
    preset: "mail",
    hours: "0",
    minutes: "10",
    label: "",
  });

  const timersHydratedRef = useRef(false);
  const draftHydratedRef = useRef(false);

  const rawStatus = String(resolvedStatus ?? userStatus ?? "FREE").toUpperCase();
  const isPrivileged =
    PRIVILEGED_STATUSES.has(rawStatus) ||
    rawStatus.includes("ADMIN") ||
    rawStatus.includes("VIP") ||
    rawStatus.includes("GOLD");
  const maxFree = 2;

  const visibleTimers = useMemo(() => {
    const now = tick;
    return (Array.isArray(timers) ? timers : [])
      .filter((timer) => !isRentalTimer(timer))
      .slice()
      .sort((a, b) => {
        const aRemaining = getRemaining(a, now);
        const bRemaining = getRemaining(b, now);
        if (Boolean(a.running) !== Boolean(b.running)) return a.running ? -1 : 1;
        if (aRemaining !== bRemaining) return aRemaining - bRemaining;
        return Number(b.startedAt || 0) - Number(a.startedAt || 0);
      });
  }, [timers, tick]);

  const activeCount = visibleTimers.filter((timer) => timer.running || getRemaining(timer, tick) > 0).length;
  const freeLimitReached = !isPrivileged && activeCount >= maxFree;
  const selectedPreset = PRESETS.find((item) => item.value === draft.preset) || PRESETS[0];

  const authedFetch = async (url, options = {}) => {
    const token = localStorage.getItem("auth_token");
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.error || data?.message || `HTTP_${response.status}`);
    }
    return data;
  };

  const upsertServerTimer = async (timer) => {
    if (!API_BASE || !timer?.id) return null;
    try {
      const data = await authedFetch(`${API_BASE}/timers/upsert`, {
        method: "POST",
        body: JSON.stringify({
          id: timer.id,
          label: timer.label,
          endAt: timer.running && timer.endAt ? new Date(timer.endAt).toISOString() : null,
          fired: Boolean(timer.finishedAt),
          notified: Boolean(timer._tgSent),
          running: Boolean(timer.running),
        }),
      });

      const serverId = data?.timer?.id;
      if (serverId && String(serverId) !== String(timer.id)) {
        setTimers((previous) =>
          previous.map((item) =>
            String(item.id) === String(timer.id) ? { ...item, id: String(serverId) } : item
          )
        );
      }
      return data?.timer || null;
    } catch {
      return null;
    }
  };

  const deleteServerTimer = async (id) => {
    if (!API_BASE || !id) return;
    try {
      await authedFetch(`${API_BASE}/timers/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // The local state is still updated so the UI never gets stuck.
    }
  };

  // Current character comes from the global profile switcher.
  useEffect(() => {
    const onCharacter = (event) => {
      const nextId = String(event?.detail || "");
      if (!nextId) return;
      timersHydratedRef.current = false;
      draftHydratedRef.current = false;
      setTimers([]);
      setCharacterId(nextId);
    };

    window.addEventListener("nightcore:character", onCharacter);
    return () => window.removeEventListener("nightcore:character", onCharacter);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const id = await ensureActiveCharacterId(API_BASE);
      if (mounted && id) setCharacterId(id);
    })();
    return () => {
      mounted = false;
    };
  }, [API_BASE]);

  // Read plan and Telegram preference.
  useEffect(() => {
    if (!API_BASE || !characterId) return undefined;
    let mounted = true;

    (async () => {
      try {
        const [me, telegram] = await Promise.all([
          authedFetch(`${API_BASE}/me`, { method: "GET" }).catch(() => null),
          authedFetch(`${API_BASE}/settings/telegram`, { method: "GET" }).catch(() => null),
        ]);

        if (!mounted) return;
        const role = me?.role || me?.user?.role || me?.data?.role;
        if (role) setResolvedStatus(role);
        if (typeof telegram?.tg_enabled === "boolean") setTgEnabled(telegram.tg_enabled);
      } catch {
        // No action needed: the local timer still works offline.
      }
    })();

    return () => {
      mounted = false;
    };
  }, [API_BASE, characterId]);

  // Load manual timers. Server list is used only as migration fallback so it can never overwrite a newer cstate list.
  useEffect(() => {
    let mounted = true;
    timersHydratedRef.current = false;

    (async () => {
      let savedTimers = [];
      try {
        const token = localStorage.getItem("auth_token");
        if (API_BASE && characterId && token) {
          const response = await fetch(`${API_BASE}/cstate/${characterId}/timers_v1`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json().catch(() => ({}));
          const value = data?.value ?? data?.data ?? data?.timers ?? data?.state;
          if (Array.isArray(value)) savedTimers = value;
        }
      } catch {
        // Fall through to local cache.
      }

      if (!savedTimers.length) {
        try {
          savedTimers = safeParse(localStorage.getItem(timerStorageKey(characterId)), []) || [];
        } catch {
          savedTimers = [];
        }
      }

      // Older app versions could have written only to /timers. Import those once when cstate is empty.
      if (!savedTimers.length && API_BASE) {
        try {
          const data = await authedFetch(`${API_BASE}/timers`, { method: "GET" });
          if (Array.isArray(data?.timers)) {
            savedTimers = data.timers
              .filter((item) => !isRentalTimer(item))
              .map((item) => ({
                id: String(item.id),
                label: item.label || "Таймер",
                baseTotal:
                  item.end_at && item.created_at
                    ? Math.max(0, Math.round((new Date(item.end_at).getTime() - new Date(item.created_at).getTime()) / 1000))
                    : 0,
                total: 0,
                remaining: 0,
                running: Boolean(item.end_at) && !item.fired,
                startedAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
                endAt: item.end_at ? new Date(item.end_at).getTime() : null,
                finishedAt: item.fired ? Date.now() : null,
                _alerted: Boolean(item.fired),
                _tgSent: Boolean(item.notified),
              }));
          }
        } catch {
          // Keeping an empty list is safe.
        }
      }

      if (!mounted) return;
      const now = Date.now();
      const normalized = (Array.isArray(savedTimers) ? savedTimers : [])
        .map((item) => normalizeTimer(item, now))
        .filter(Boolean)
        .filter((item) => !isRentalTimer(item));

      setTimers(normalized);
      timersHydratedRef.current = true;
    })();

    return () => {
      mounted = false;
    };
  }, [API_BASE, characterId]);

  useEffect(() => {
    draftHydratedRef.current = false;

    try {
      const saved = safeParse(localStorage.getItem(draftStorageKey(characterId)), null);
      if (saved && typeof saved === "object") {
        setDraft((previous) => ({ ...previous, ...saved }));
      }
    } catch {
      // A draft is non-critical.
    }

    draftHydratedRef.current = true;
  }, [characterId]);

  // Persist the full manual list; ticking itself does not write every second.
  useEffect(() => {
    try {
      localStorage.setItem(timerStorageKey(characterId), JSON.stringify(timers));
    } catch {
      // Local cache is optional.
    }

    if (!timersHydratedRef.current || !API_BASE || !characterId) return undefined;
    const token = localStorage.getItem("auth_token");
    if (!token) return undefined;

    const timeout = window.setTimeout(() => {
      fetch(`${API_BASE}/cstate/${characterId}/timers_v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value: timers.filter((item) => !isRentalTimer(item)) }),
      }).catch(() => {});
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [API_BASE, characterId, timers]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    try {
      localStorage.setItem(draftStorageKey(characterId), JSON.stringify(draft));
    } catch {
      // A draft is optional.
    }
  }, [characterId, draft]);

  // One UI ticker updates every visible card. It does not recreate or restart timers.
  useEffect(() => {
    if (!timers.some((timer) => timer.running)) return undefined;
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timers]);

  // Finish all due timers together, not just the first one.
  useEffect(() => {
    const now = tick;
    const due = timers.filter((timer) => timer.running && getRemaining(timer, now) <= 0);
    if (!due.length) return;

    setTimers((previous) =>
      previous.map((timer) => {
        const shouldFinish = due.some((item) => item.id === timer.id);
        return shouldFinish
          ? { ...timer, remaining: 0, running: false, endAt: null, finishedAt: now, _alerted: true }
          : timer;
      })
    );

    due.forEach((timer) => {
      upsertServerTimer({
        ...timer,
        remaining: 0,
        running: false,
        endAt: null,
        finishedAt: now,
        _alerted: true,
      });
    });
  }, [tick, timers]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setAddOpen(false);
        setPresetOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const applyPreset = (preset) => {
    const hours = Math.floor((preset.seconds || 0) / 3600);
    const minutes = Math.floor(((preset.seconds || 0) % 3600) / 60);
    setDraft((previous) => ({
      ...previous,
      preset: preset.value,
      hours: String(hours),
      minutes: String(minutes),
    }));
    setPresetOpen(false);
  };

  const draftTotal = () => {
    const hours = clampInt(draft.hours, 0, 9999);
    const minutes = clampInt(draft.minutes, 0, 59);
    return hours * 3600 + minutes * 60;
  };

  const createTimer = () => {
    if (freeLimitReached) return;
    const total = draftTotal();
    if (total <= 0) return;

    const now = Date.now();
    const title =
      draft.preset === "custom" && draft.label.trim()
        ? draft.label.trim()
        : selectedPreset?.label || "Свой таймер";

    const nextTimer = {
      id: makeId(),
      label: title,
      baseTotal: total,
      total,
      remaining: total,
      running: true,
      startedAt: now,
      endAt: now + total * 1000,
      finishedAt: null,
      _alerted: false,
      _tgSent: false,
    };

    setTimers((previous) => [...previous, nextTimer]);
    setFeaturedTimerId(nextTimer.id);
    upsertServerTimer(nextTimer);
    setTick(now);
    setDraft((previous) => ({ ...previous, label: "" }));
    setAddOpen(false);
  };

  const toggleTimer = (id) => {
    const now = Date.now();
    const current = timers.find((timer) => timer.id === id);
    if (!current) return;

    const remaining = getRemaining(current, now);
    if (remaining <= 0) return;

    const next = current.running
      ? { ...current, remaining, running: false, endAt: null }
      : {
          ...current,
          remaining,
          running: true,
          endAt: now + remaining * 1000,
          finishedAt: null,
          _alerted: false,
        };

    setTimers((previous) => previous.map((timer) => (timer.id === id ? next : timer)));
    upsertServerTimer(next);
    setTick(now);
  };

  const resetTimer = (id) => {
    const now = Date.now();
    const current = timers.find((timer) => timer.id === id);
    if (!current) return;

    const total = Math.max(0, Number(current.baseTotal ?? current.total ?? current.remaining) || 0);
    if (!total) return;

    const next = {
      ...current,
      total,
      baseTotal: total,
      remaining: total,
      running: true,
      startedAt: now,
      endAt: now + total * 1000,
      finishedAt: null,
      _alerted: false,
      _tgSent: false,
    };

    setTimers((previous) => previous.map((timer) => (timer.id === id ? next : timer)));
    upsertServerTimer(next);
    setTick(now);
  };

  const removeTimer = (id) => {
    setTimers((previous) => previous.filter((timer) => timer.id !== id));
    deleteServerTimer(id);
  };

  const clearTimers = () => {
    const ids = visibleTimers.map((timer) => timer.id);
    setFeaturedTimerId(null);
    setTimers((previous) => previous.filter((timer) => isRentalTimer(timer)));
    ids.forEach(deleteServerTimer);
  };

  const toggleTelegram = async () => {
    if (!isPrivileged) return;
    const next = !tgEnabled;
    setTgEnabled(next);
    try {
      await authedFetch(`${API_BASE}/settings/telegram`, {
        method: "POST",
        body: JSON.stringify({ tg_notify_enabled: next }),
      });
    } catch {
      setTgEnabled(!next);
    }
  };

  useEffect(() => {
    if (!visibleTimers.length) {
      if (featuredTimerId !== null) setFeaturedTimerId(null);
      return;
    }

    const stillExists = visibleTimers.some((timer) => String(timer.id) === String(featuredTimerId));
    if (!stillExists) setFeaturedTimerId(visibleTimers[0].id);
  }, [visibleTimers, featuredTimerId]);

  const featuredTimer =
    visibleTimers.find((timer) => String(timer.id) === String(featuredTimerId)) ||
    visibleTimers[0] ||
    null;
  const featuredRemaining = featuredTimer ? getRemaining(featuredTimer, tick) : 0;
  const featuredTotal = featuredTimer
    ? Math.max(0, Number(featuredTimer.baseTotal ?? featuredTimer.total ?? featuredRemaining) || 0)
    : 0;
  const featuredProgress = featuredTotal > 0
    ? Math.min(100, Math.max(0, ((featuredTotal - featuredRemaining) / featuredTotal) * 100))
    : 0;
  const featuredRemainingProgress = featuredTotal > 0
    ? Math.min(100, Math.max(0, (featuredRemaining / featuredTotal) * 100))
    : 0;
  const featuredState = featuredTimer?.running
    ? "Активен"
    : featuredRemaining <= 0 && featuredTimer
      ? "Готово"
      : featuredTimer
        ? "Пауза"
        : "Ожидание";

  return (
    <section className="premium-timer-page mx-auto w-full max-w-[1540px] px-3 py-4 text-white sm:px-5 sm:py-6">
      <style>{`
        .premium-timer-page { isolation: isolate; }
        .premium-timer-page button { -webkit-tap-highlight-color: transparent; }
        .premium-timer-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
        .premium-timer-scroll::-webkit-scrollbar-track { background: transparent; }
        .premium-timer-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.16); border-radius: 999px; }
        .premium-timer-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.28); }
      `}</style>

      <div className="relative overflow-hidden rounded-[38px] bg-[#090a10]/[0.98] shadow-[0_30px_110px_rgba(0,0,0,0.48)]">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 50% 36%, rgba(132,156,255,0.13), transparent 34%), radial-gradient(circle at 85% 6%, rgba(255,255,255,0.045), transparent 28%)" }} />


        <header className="relative z-10 flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[17px] bg-white/[0.045] shadow-[0_0_30px_rgba(142,169,255,0.11)]">
              <TimerIcon className="h-5 w-5 text-[#d6e0ff]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold tracking-tight text-white sm:text-xl">Таймеры</h1>
                <span className="rounded-full bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-white/55">
                  {visibleTimers.length}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/40">Главный вид остаётся премиальным, а все остальные таймеры — ниже, в общей сетке.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleTelegram}
              title={isPrivileged ? "Уведомления в Telegram" : "Telegram-уведомления доступны выше FREE"}
              className={[
                "flex h-10 items-center gap-2 rounded-full  px-3.5 text-xs font-bold transition active:scale-[0.98]",
                isPrivileged
                  ? tgEnabled
                    ? " bg-[#273252]/75 text-[#eef2ff] shadow-[0_0_24px_rgba(147,170,255,.13)]"
                    : " bg-white/[0.035] text-white/62  hover:bg-white/[0.07] hover:text-white"
                  : "cursor-not-allowed  bg-white/[0.02] text-white/24",
              ].join(" ")}
            >
              {isPrivileged ? <Bell className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              Telegram
            </button>

            {visibleTimers.length > 0 && (
              <button
                type="button"
                onClick={clearTimers}
                className="flex h-10 items-center gap-2 rounded-full bg-white/[0.03] px-3.5 text-xs font-bold text-white/54 transition hover:bg-rose-300/[0.09] hover:text-rose-100 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" /> Очистить
              </button>
            )}

            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex h-10 items-center gap-2 rounded-full bg-[#273252] px-4 text-xs font-bold text-[#f1f4ff] shadow-[0_0_24px_rgba(147,170,255,.12)] transition hover:bg-[#34416a] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Добавить
            </button>
          </div>
        </header>

        <main className="relative z-10 p-4 sm:p-6 lg:p-7">
          {!isPrivileged && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/[0.022] px-3.5 py-3 text-xs text-white/42">
              <span>Активных таймеров: <b className="font-semibold text-white/78">{activeCount} / {maxFree}</b></span>
              {freeLimitReached && <span className="rounded-full bg-amber-300/[0.07] px-2 py-1 text-[10px] font-bold text-amber-100/85">Лимит FREE достигнут</span>}
            </div>
          )}

          <AnimatePresence initial={false} mode="popLayout">
            {!featuredTimer ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="relative grid min-h-[520px] place-items-center overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,rgba(255,255,255,.028),rgba(255,255,255,.008))] px-5 text-center"
              >
                <div className="pointer-events-none absolute h-[340px] w-[340px] rounded-full shadow-[0_0_90px_rgba(136,160,255,.14),inset_0_0_56px_rgba(136,160,255,.05)]" />
                <div className="relative">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-white/[0.045] shadow-[0_0_32px_rgba(142,169,255,.13)]">
                    <Clock3 className="h-7 w-7 text-[#d6e0ff]/80" />
                  </div>
                  <div className="mt-5 text-[11px] font-bold uppercase tracking-[0.24em] text-white/36">Events timer</div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Создай первый таймер</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/42">
                    После добавления он появится в большом центральном блоке, а новые будут работать параллельно и останутся видны внизу.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#273252] px-5 text-xs font-bold text-[#f2f5ff] transition hover:bg-[#34416a] active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4" /> Добавить таймер
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="timer-content"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <div className="relative overflow-hidden rounded-[34px] bg-[linear-gradient(160deg,rgba(255,255,255,.045),rgba(255,255,255,.012)_47%,rgba(120,145,255,.04))] px-4 py-6 shadow-[0_26px_80px_rgba(0,0,0,.26)] sm:px-8 sm:py-8">
                  <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 46%, rgba(154,177,255,0.12), transparent 35%)" }} />
                  <div className="relative mx-auto flex max-w-[720px] flex-col items-center text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <span className={[
                        "rounded-full  px-3 py-1 text-[10px] font-bold uppercase tracking-[0.17em]",
                        featuredTimer.running
                          ? " bg-[#aebeff]/[0.10] text-[#dce5ff]"
                          : featuredRemaining <= 0
                            ? " bg-amber-300/[0.08] text-amber-100"
                            : " bg-white/[0.045] text-white/58",
                      ].join(" ")}>
                        {featuredState}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/34">Выбранный таймер</span>
                    </div>

                    <h2 className="mt-4 max-w-full truncate text-[clamp(18px,2.2vw,25px)] font-semibold tracking-tight text-white" title={featuredTimer.label}>
                      {featuredTimer.label}
                    </h2>

                    <div className="relative mt-6 grid h-[min(58vw,300px)] w-[min(58vw,300px)] min-h-[190px] min-w-[190px] place-items-center rounded-full p-[10px] shadow-[0_0_72px_rgba(136,161,255,.16)]" style={{ background: `conic-gradient(from 220deg, rgba(187,202,255,.96) 0deg ${featuredRemainingProgress * 3.6}deg, rgba(255,255,255,.065) ${featuredRemainingProgress * 3.6}deg 360deg)` }}>
                      <div className="grid h-full w-full place-items-center rounded-full bg-[#0c0d14] shadow-[inset_0_0_34px_rgba(0,0,0,.52)]">
                        <div>
                          <div className="font-mono text-[clamp(34px,7.4vw,68px)] font-medium leading-none tracking-[-0.07em] tabular-nums text-[#f4f6ff] drop-shadow-[0_0_20px_rgba(188,203,255,.20)]">
                            {formatDuration(featuredRemaining)}
                          </div>
                          <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
                            {featuredRemaining <= 0 ? "Время вышло" : `Осталось ${Math.max(0, Math.round(featuredRemainingProgress))}%`}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center gap-4 text-[11px] text-white/38">
                      <span>Старт: <b className="font-semibold text-white/68">{formatDuration(featuredTotal)}</b></span>
                      <span className="h-1 w-1 rounded-full bg-white/25" />
                      <span>Прошло: <b className="font-semibold text-white/68">{Math.round(featuredProgress)}%</b></span>
                    </div>

                    <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => (featuredRemaining <= 0 ? resetTimer(featuredTimer.id) : toggleTimer(featuredTimer.id))}
                        className="flex h-11 items-center gap-2 rounded-full bg-[#273252] px-5 text-xs font-bold text-[#f1f4ff] shadow-[0_0_28px_rgba(147,170,255,.12)] transition hover:bg-[#34416a] active:scale-[0.98]"
                      >
                        {featuredRemaining <= 0 ? <RotateCcw className="h-4 w-4" /> : featuredTimer.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {featuredRemaining <= 0 ? "Запустить снова" : featuredTimer.running ? "Пауза" : "Продолжить"}
                      </button>
                      <button
                        type="button"
                        onClick={() => resetTimer(featuredTimer.id)}
                        className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.035] text-white/62 transition hover:bg-white/[0.08] hover:text-white active:scale-95"
                        title="Сбросить"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTimer(featuredTimer.id)}
                        className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.035] text-white/48 transition hover:bg-rose-300/[0.09] hover:text-rose-100 active:scale-95"
                        title="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-end justify-between gap-3 px-1">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.20em] text-white/32">All timers</div>
                    <h3 className="mt-1 text-sm font-semibold text-white/80">Все таймеры</h3>
                  </div>
                  <p className="text-xs text-white/38">Нажми на карточку, чтобы вывести её в главный экран.</p>
                </div>

                <motion.div layout className="premium-timer-scroll mt-3 grid max-h-[560px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {visibleTimers.map((timer, index) => {
                    const remaining = getRemaining(timer, tick);
                    const total = Math.max(0, Number(timer.baseTotal ?? timer.total ?? remaining) || 0);
                    const progress = total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 0;
                    const isSelected = String(timer.id) === String(featuredTimer.id);
                    const status = timer.running ? "Идёт" : remaining <= 0 ? "Готово" : "Пауза";

                    return (
                      <motion.article
                        key={timer.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.18, delay: Math.min(index * 0.022, 0.14) }}
                        onClick={() => setFeaturedTimerId(timer.id)}
                        className={[
                          "group relative min-w-0 cursor-pointer overflow-hidden rounded-[24px]  p-4 transition",
                          isSelected
                            ? " bg-[#151a2a] shadow-[0_0_28px_rgba(141,165,255,.11)]"
                            : " bg-white/[0.025]  hover:bg-white/[0.045]",
                        ].join(" ")}
                      >

                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={[
                                "rounded-full  px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.13em]",
                                timer.running
                                  ? " bg-[#aebeff]/[0.08] text-[#dce5ff]"
                                  : remaining <= 0
                                    ? " bg-amber-300/[0.07] text-amber-100"
                                    : " bg-white/[0.04] text-white/50",
                              ].join(" ")}>
                                {status}
                              </span>
                              {isSelected && <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#bdcaff]/75">Главный</span>}
                            </div>
                            <h4 className="mt-2 truncate text-sm font-semibold text-white/88" title={timer.label}>{timer.label}</h4>
                          </div>
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/20 text-white/48">
                            <TimerIcon className="h-4 w-4" />
                          </div>
                        </div>

                        <div className="mt-5 font-mono text-[32px] font-medium leading-none tracking-[-0.055em] tabular-nums text-[#f2f4ff]">
                          {formatDuration(remaining)}
                        </div>

                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <motion.div
                            className="h-full rounded-full bg-[#b7c8ff]"
                            animate={{ width: `${Math.max(3, 100 - progress)}%` }}
                            transition={{ duration: 0.24, ease: "easeOut" }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-white/34">
                          <span>{formatDuration(total)}</span>
                          <span>{Math.round(progress)}%</span>
                        </div>

                        <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => (remaining <= 0 ? resetTimer(timer.id) : toggleTimer(timer.id))}
                            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#222b46] px-3 text-xs font-bold text-[#eef2ff] transition hover:bg-[#303b61] active:scale-[0.98]"
                          >
                            {remaining <= 0 ? <RotateCcw className="h-4 w-4" /> : timer.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            {remaining <= 0 ? "Заново" : timer.running ? "Пауза" : "Старт"}
                          </button>
                          <button
                            type="button"
                            title="Сбросить"
                            onClick={() => resetTimer(timer.id)}
                            className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.03] text-white/56 transition hover:bg-white/[0.08] hover:text-white active:scale-95"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Удалить"
                            onClick={() => removeTimer(timer.id)}
                            className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.03] text-white/42 transition hover:bg-rose-300/[0.09] hover:text-rose-100 active:scale-95"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </motion.article>
                    );
                  })}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {addOpen && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Закрыть"
              className="absolute inset-0 cursor-default bg-black/[0.78] backdrop-blur-md"
              onClick={() => setAddOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.985 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative w-full max-w-[510px] overflow-visible rounded-[30px] bg-[#10121a] p-5 shadow-[0_34px_110px_rgba(0,0,0,.78)] sm:p-6"
            >

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.20em] text-[#becbff]/60">Events timer</div>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Новый таймер</h2>
                  <p className="mt-1 text-xs text-white/42">
                    {isPrivileged ? "Можно запускать любое количество таймеров." : `FREE: до ${maxFree} активных одновременно.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.03] text-white/58 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Шаблон</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPresetOpen((value) => !value)}
                    className="flex h-12 w-full items-center justify-between rounded-2xl bg-black/25 px-3.5 text-left text-sm font-semibold text-white transition hover:bg-white/[0.045]"
                  >
                    <span className="truncate">{selectedPreset?.label || "Свой таймер"}</span>
                    <ChevronDown className={["h-4 w-4 text-white/45 transition", presetOpen ? "rotate-180" : ""].join(" ")} />
                  </button>

                  <AnimatePresence>
                    {presetOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.14 }}
                        className="premium-timer-scroll absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl bg-[#11131c] p-1.5 shadow-2xl shadow-black/70"
                      >
                        {PRESETS.map((preset) => {
                          const active = preset.value === draft.preset;
                          return (
                            <button
                              key={preset.value}
                              type="button"
                              onClick={() => applyPreset(preset)}
                              className={[
                                "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition",
                                active ? "bg-[#253052] text-white" : "text-white/62 hover:bg-white/[0.06] hover:text-white",
                              ].join(" ")}
                            >
                              <span>{preset.label}</span>
                              <span className="text-xs tabular-nums text-white/38">{preset.seconds == null ? "Вручную" : formatDuration(preset.seconds)}</span>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {draft.preset === "custom" && (
                <div className="mt-4">
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Название</label>
                  <input
                    value={draft.label}
                    onChange={(event) => setDraft((previous) => ({ ...previous, label: event.target.value }))}
                    placeholder="Например: Клуб"
                    className="h-12 w-full rounded-2xl bg-black/25 px-3.5 text-sm font-medium text-white outline-none placeholder:text-white/25 transition"
                  />
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Часы</label>
                  <input
                    value={draft.hours}
                    inputMode="numeric"
                    onChange={(event) => setDraft((previous) => ({
                      ...previous,
                      preset: "custom",
                      hours: event.target.value.replace(/\D/g, ""),
                    }))}
                    className="h-14 w-full rounded-2xl bg-black/25 px-3 text-center font-mono text-xl font-medium tabular-nums text-white outline-none transition"
                    placeholder="00"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Минуты</label>
                  <input
                    value={draft.minutes}
                    inputMode="numeric"
                    onChange={(event) => setDraft((previous) => ({
                      ...previous,
                      preset: "custom",
                      minutes: event.target.value.replace(/\D/g, ""),
                    }))}
                    className="h-14 w-full rounded-2xl bg-black/25 px-3 text-center font-mono text-xl font-medium tabular-nums text-white outline-none transition"
                    placeholder="00"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/[0.025] px-3.5 py-3 text-xs text-white/42">
                <span>Длительность</span>
                <span className="font-semibold tabular-nums text-white/82">{formatDuration(draftTotal())}</span>
              </div>

              <button
                type="button"
                onClick={createTimer}
                disabled={draftTotal() <= 0 || freeLimitReached}
                className={[
                  "mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl  text-sm font-bold transition active:scale-[0.99]",
                  draftTotal() > 0 && !freeLimitReached
                    ? " bg-[#273252] text-[#f1f4ff] hover:bg-[#34416a]"
                    : "cursor-not-allowed  bg-white/[0.04] text-white/28",
                ].join(" ")}
              >
                <Play className="h-4 w-4" /> Запустить таймер
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
