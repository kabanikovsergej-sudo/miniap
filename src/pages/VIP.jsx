import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BpCalcLite from "./BpCalc";
import { fetchMe } from "@/lib/auth";

function getUserFromStorage() {
  try {
    const raw =
      localStorage.getItem("user") ||
      localStorage.getItem("me") ||
      localStorage.getItem("profile");
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}


/**
 * Tools Hub
 * - Без фонового слоя (использует твой "ориг" фон приложения)
 * - На входе: плитки
 * - AI чат: только Admin
 * - BP калькулятор: VIP / Gold / Support / Admin
 *
 * Доступ берём как в BP.jsx: через fetchMe() + доп.проверка ролей
 */

/* ---------- roles / access ---------- */

function normRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");
}

function getRolesFromUser(user) {
  const roles = new Set();

  if (user?.role) roles.add(normRole(user.role));
  if (user?.plan) roles.add(normRole(user.plan));
  if (user?.tier) roles.add(normRole(user.tier));

  if (Array.isArray(user?.roles)) user.roles.forEach((r) => roles.add(normRole(r)));

  if (user?.is_admin || user?.admin) roles.add("admin");
  if (user?.vip) roles.add("vip");
  if (user?.gold) roles.add("gold");
  if (user?.support) roles.add("support");

  // tolerant expansions
  const expanded = new Set();
  roles.forEach((r) => {
    const rr = normRole(r);
    expanded.add(rr);
    if (rr.includes("admin")) expanded.add("admin");
    if (rr.includes("vip")) expanded.add("vip");
    if (rr.includes("gold")) expanded.add("gold");
    if (rr.includes("support")) expanded.add("support");
  });

  return expanded;
}

function hasAnyRole(user, allowed) {
  const have = getRolesFromUser(user);
  for (const a of allowed) {
    if (have.has(normRole(a))) return true;
  }
  return false;
}

/* ---------- UI bits ---------- */

function Tile({ title, subtitle, icon, locked, onClick, tag }) {
  return (
    <button
      onClick={locked ? undefined : onClick}
      className={[
        "relative w-full text-left rounded-3xl border border-white/10",
        "bg-white/[0.03] backdrop-blur-2xl shadow-2xl",
        "px-5 py-4 transition",
        locked ? "opacity-60 cursor-not-allowed" : "hover:border-white/20 hover:bg-white/[0.06]"
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-400">{subtitle}</div>
        </div>

        {tag ? (
          <span className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-black/20 text-slate-200">
            {tag}
          </span>
        ) : null}
      </div>

      {locked ? (
        <div className="absolute inset-0 rounded-3xl flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-slate-100 bg-black/40 border border-white/10 px-3 py-2 rounded-2xl">
            <span aria-hidden>🔒</span>
            <span>Нет доступа</span>
          </div>
        </div>
      ) : null}
    </button>
  );
}

function SmallButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-100 hover:bg-white/[0.06] transition"
    >
      {children}
    </button>
  );
}

function LockedScreen({ title, subtitle, onBack }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] backdrop-blur-2xl shadow-2xl p-6 md:p-8">
      <div className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
        <span aria-hidden>🔒</span> {title}
      </div>
      <div className="mt-2 text-sm text-slate-300">{subtitle}</div>
      <div className="mt-6">
        <SmallButton onClick={onBack}>← Назад</SmallButton>
      </div>
    </div>
  );
}

export default function ToolsHub({ user: userProp }) {
  const [view, setView] = useState("home"); // home | bp | ai

  // базовый user (если где-то передаётся/лежит локально)
  const baseUser = userProp ?? getUserFromStorage();

  // user из БД (как в BP.jsx)
  const [me, setMe] = useState(null);
  const [isPrivileged, setIsPrivileged] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const data = await fetchMe?.();
        if (!alive) return;

        setMe(data || null);

        const role = String(data?.role || data?.tier || data?.plan || "").toLowerCase();
        const vipUntil = data?.vip_until || data?.vipUntil;
        const t = vipUntil
          ? typeof vipUntil === "number"
            ? vipUntil
            : Date.parse(String(vipUntil))
          : NaN;

        const ok =
          ["admin", "owner", "support", "gold", "vip", "pro", "premium"].includes(role) ||
          (Number.isFinite(t) && t > Date.now()) ||
          !!(data?.is_privileged || data?.isPrivileged || data?.is_vip || data?.isVip);

        setIsPrivileged(!!ok);
      } catch {
        if (!alive) return;
        setMe(null);
        setIsPrivileged(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const user = me || baseUser;

  const canAI = hasAnyRole(user, ["admin"]);
  const canBP = isPrivileged || hasAnyRole(user, ["vip", "gold", "support", "admin"]);

  const debugRoles = Array.from(getRolesFromUser(user));

  return (
    <div className="w-full text-slate-100">
      {/* no background here - uses your original app background */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        <AnimatePresence mode="wait">
          {view === "home" ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-5"
            >
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] backdrop-blur-2xl shadow-2xl p-6 md:p-8">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Меню</h1>
                    <div className="mt-1 text-sm text-slate-300">Выбери инструмент</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Tile
                  title="Battle Pass"
                  icon="🎫"
                  tag="VIP"
                  locked={!canBP}
                  onClick={() => setView("bp")}
                />
                <Tile
                  title="AI чат"
                  subtitle="Только для Admin"
                  icon="🤖"
                  tag="ADMIN"
                  locked={!canAI}
                  onClick={() => setView("ai")}
                />
              </div>
            </motion.div>
          ) : null}

          {view === "bp" ? (
            <motion.div
              key="bp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <SmallButton onClick={() => setView("home")}>← Меню</SmallButton>
              </div>

              {!canBP ? (
                <LockedScreen
                  title="BP калькулятор"
                  subtitle="Доступ: VIP / Gold / Support / Admin."
                  onBack={() => setView("home")}
                />
              ) : (
                <BpCalcLite />
              )}
            </motion.div>
          ) : null}

          {view === "ai" ? (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <SmallButton onClick={() => setView("home")}>← Меню</SmallButton>
              </div>

              {!canAI ? (
                <LockedScreen
                  title="AI чат"
                  subtitle="Доступ: только Admin."
                  onBack={() => setView("home")}
                />
              ) : (
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] backdrop-blur-2xl shadow-2xl p-6 md:p-8">
                  <div className="text-2xl font-semibold text-slate-100">🤖 AI чат</div>
                  <div className="mt-2 text-sm text-slate-300">Тут подключишь свой чат (пока заглушка).</div>

                  <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/10 p-4 text-sm text-slate-300">
                    Вставь сюда твой компонент чата / iframe / страницу.
                  </div>
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
