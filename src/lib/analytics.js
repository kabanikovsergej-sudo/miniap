import { useEffect, useMemo, useState } from "react";

/**
 * Лёгкая аналитика без БД:
 * - хранит события в localStorage (nx_analytics_v1)
 * - считает "время в приложении" (сессии)
 * - умеет принимать реальные фарм-сессии (points / xp / etc)
 *
 * Если потом захочешь БД — можно синкать эти события в Supabase на бэке, но для UI этого достаточно.
 */

const KEY = "nx_analytics_v1";
const KEY_TIMER_ACT = "nx_timer_act";
const KEY_BP_LEVEL = "nx_bp_level";

const DEFAULTS = {
  // Дневная норма по времени (в минутах) — можно менять под себя
  dailyMinutesGoal: 90,
  // Дневная норма по фарму (в условных "поинтах") — если будешь логировать фарм
  dailyFarmGoal: 10000
};

function now() {
  return Date.now();
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function readStore() {
  const raw = localStorage.getItem(KEY);
  const data = safeJsonParse(raw || "null", null);
  if (!data || typeof data !== "object") {
    return { v: 1, settings: { ...DEFAULTS }, events: [] };
  }
  return {
    v: data.v || 1,
    settings: { ...DEFAULTS, ...(data.settings || {}) },
    events: Array.isArray(data.events) ? data.events : []
  };
}

function writeStore(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore (private mode / quota)
  }
}

function pruneOld(events, maxDays = 90) {
  const cutoff = now() - maxDays * 24 * 60 * 60 * 1000;
  return events.filter((e) => e && typeof e.t === "number" && e.t >= cutoff);
}

function appendEvent(evt) {
  const store = readStore();
  const events = pruneOld(store.events);
  events.push(evt);
  writeStore({ ...store, events });
}

function startSession() {
  appendEvent({ type: "session_start", t: now() });
}

function endSession() {
  appendEvent({ type: "session_end", t: now() });
}

// ✅ запускай один раз на странице (мы делаем это в Home.jsx)
export function ensureAnalyticsSession() {
  // старт при загрузке
  startSession();

  const onVisibility = () => {
    if (document.visibilityState === "hidden") endSession();
    if (document.visibilityState === "visible") startSession();
  };

  const onBeforeUnload = () => {
    endSession();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}

// --- публичные трекеры ---

export function trackToolOpen(name) {
  appendEvent({ type: "tool_open", name: String(name || "unknown"), t: now() });
}

/**
 * ВОТ ЭТО ТЕБЕ НУЖНО ДОБАВИТЬ ТАМ, ГДЕ У ТЕБЯ РЕАЛЬНО СЧИТАЕТСЯ ФАРМ/XP.
 * Пример:
 *   trackFarmSession({ points: xpEarnedToday, minutes: sessionMinutes, source: "timer" })
 */
export function trackFarmSession(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  appendEvent({
    type: "farm_session",
    t: now(),
    points: clampNum(p.points, 0, 1_000_000),
    minutes: clampNum(p.minutes, 0, 24 * 60),
    source: typeof p.source === "string" ? p.source.slice(0, 32) : "unknown",
    meta: p.meta && typeof p.meta === "object" ? p.meta : undefined
  });
}

export function setTimerAct(act) {
  localStorage.setItem(KEY_TIMER_ACT, String(act));
}
export function setBpLevel(level) {
  localStorage.setItem(KEY_BP_LEVEL, String(level));
}

function clampNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtHMM(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}м`;
  return `${h}ч ${m}м`;
}

function computeOnlineTodayMs(events) {
  const day0 = startOfDay(now());
  const day1 = day0 + 24 * 60 * 60 * 1000;

  // пары start/end
  const relevant = events
    .filter((e) => (e.type === "session_start" || e.type === "session_end") && e.t >= day0 && e.t <= day1)
    .sort((a, b) => a.t - b.t);

  let sum = 0;
  let open = null;

  for (const e of relevant) {
    if (e.type === "session_start") {
      open = e.t;
    } else if (e.type === "session_end") {
      if (open != null) {
        sum += Math.max(0, e.t - open);
        open = null;
      }
    }
  }

  // если не закрылась, считаем до "сейчас"
  if (open != null) sum += Math.max(0, now() - open);

  return sum;
}

function computeFarmBars(events, count = 8) {
  const farm = events
    .filter((e) => e.type === "farm_session" && typeof e.points === "number" && e.points > 0)
    .sort((a, b) => a.t - b.t);

  if (!farm.length) return { bars: [], titles: [], hasData: false, delta: 0 };

  const last = farm.slice(-count);
  const vals = last.map((e) => e.points);

  const max = Math.max(...vals, 1);
  const bars = vals.map((v) => Math.round((v / max) * 80) + 10); // 10..90%

  const titles = last.map((e) => `${Math.round(e.points)} pts • ${new Date(e.t).toLocaleString("ru-RU")}`);

  // delta: сравниваем avg последних 7 и предыдущих 7 (если есть)
  const window = 7;
  const a = farm.slice(-(window)).map((e) => e.points);
  const b = farm.slice(-(window * 2), -window).map((e) => e.points);

  const avgA = a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const avgB = b.reduce((s, x) => s + x, 0) / Math.max(1, b.length);

  const delta = avgB > 0 ? ((avgA - avgB) / avgB) * 100 : 0;

  return { bars, titles, hasData: true, delta };
}

function computeDailyNormPercent(store, events) {
  const onlineMs = computeOnlineTodayMs(events);
  const onlineMin = onlineMs / 60000;

  // если есть фарм — можно смешивать (простая модель)
  const day0 = startOfDay(now());
  const day1 = day0 + 24 * 60 * 60 * 1000;
  const farmToday = events
    .filter((e) => e.type === "farm_session" && e.t >= day0 && e.t < day1 && typeof e.points === "number")
    .reduce((s, e) => s + (e.points || 0), 0);

  const timePart = store.settings.dailyMinutesGoal > 0 ? Math.min(1, onlineMin / store.settings.dailyMinutesGoal) : 0;
  const farmPart = store.settings.dailyFarmGoal > 0 ? Math.min(1, farmToday / store.settings.dailyFarmGoal) : 0;

  // если фарм вообще не пишется — ориентируемся только на время
  const hasFarm = farmToday > 0;
  const combined = hasFarm ? (timePart * 0.4 + farmPart * 0.6) : timePart;

  return Math.round(combined * 100);
}

/**
 * Хук: отдаёт готовую сводку для UI
 */
export function useAnalyticsSummary() {
  const [tick, setTick] = useState(0);

  // ✅ обновляем раз в 5 секунд, чтобы "real-time" время росло без дерганий
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const store = readStore();
    const events = pruneOld(store.events);

    const onlineTodayMs = computeOnlineTodayMs(events);
    const dailyNormPercent = computeDailyNormPercent(store, events);

    const { bars, titles, hasData, delta } = computeFarmBars(events, 8);

    const timerAct = localStorage.getItem(KEY_TIMER_ACT);
    const bpLevel = localStorage.getItem(KEY_BP_LEVEL);

    // заполнение времени: 0..100% на основе dailyMinutesGoal
    const onlineMin = onlineTodayMs / 60000;
    const onlineFill = store.settings.dailyMinutesGoal > 0
      ? Math.min(100, Math.round((onlineMin / store.settings.dailyMinutesGoal) * 100))
      : 0;

    return {
      realtimeLabel: "Real-time",
      onlineTodayMs,
      onlineTodayLabel: fmtHMM(onlineTodayMs),
      onlineDayFillPercent: onlineFill,

      dailyNormPercent,

      hasFarmData: hasData,
      farmBars: bars,
      farmBarTitles: titles,
      farmDelta: delta,

      timerActLabel: timerAct ? `${timerAct} акт.` : "—",
      bpLevelLabel: bpLevel ? `${bpLevel} ур.` : "—"
    };
  }, [tick]);
}

export function trackTodayProgress(data = {}) {
  try {
    const value = {
      type: "today_progress",
      t: Date.now(),
      ...data,
    };

    const raw = localStorage.getItem("nx_today_progress_v1");
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? [...list, value].slice(-120) : [value];

    localStorage.setItem("nx_today_progress_v1", JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function resetTodayProgressGraph() {
  try {
    localStorage.removeItem("nx_today_progress_v1");
  } catch {
    // ignore
  }
}