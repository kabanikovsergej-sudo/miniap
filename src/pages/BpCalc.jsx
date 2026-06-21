import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Coins,
  Gauge,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";

import { hapticImpact } from "@/lib/telegram";

const GOAL_LEVEL = 115;
const DEFAULT_DAILY_XP = 6000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "nightcorex:bp-calculator:v3";

const AUTO_CASE_LEVELS = new Set([14, 30, 44, 60, 74, 90, 105]);
const CLOTHING_CASE_LEVELS = new Set([
  3, 5, 7, 8, 11, 13, 15, 17, 18, 19, 21, 23, 25, 26, 27, 29, 31, 33, 35, 37,
  38, 39, 41, 43, 45, 47, 48, 49, 51, 53, 55, 56, 57, 59, 61, 63, 65, 67,
  68, 69, 71, 73, 75, 77, 78, 79, 81, 83, 85, 86, 87, 89, 91, 93, 95, 97,
  98, 107, 111,
]);

function clampNumber(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(Number(value) || 0)));
}

function xpForLevel(level) {
  return 1000 + (level - 1) * 100;
}

function totalXpAt(level, xpInLevel) {
  const safeLevel = clampNumber(level, 1, GOAL_LEVEL);
  let total = 0;
  for (let current = 1; current < safeLevel; current += 1) total += xpForLevel(current);
  return total + Math.max(0, Number(xpInLevel) || 0);
}

function xpLeftToGoal(level, xpInLevel) {
  const safeLevel = clampNumber(level, 1, GOAL_LEVEL);
  if (safeLevel >= GOAL_LEVEL) return 0;

  let left = Math.max(0, xpForLevel(safeLevel) - Math.max(0, Number(xpInLevel) || 0));
  for (let current = safeLevel + 1; current < GOAL_LEVEL; current += 1) left += xpForLevel(current);
  return left;
}

function bonusForLevel(level, { clothingToXp, autoToXp }) {
  if (AUTO_CASE_LEVELS.has(level) && autoToXp) return 5000;
  if (CLOTHING_CASE_LEVELS.has(level) && clothingToXp) return 1000;
  return 0;
}

function simulateProgress({ level, xpInLevel, days, dailyXp, extraDailyXp, clothingToXp, autoToXp }) {
  let currentLevel = clampNumber(level, 1, GOAL_LEVEL);
  let currentXp = Math.max(0, Number(xpInLevel) || 0);
  const safeDays = Math.max(0, Math.floor(Number(days) || 0));

  for (let day = 0; day < safeDays && currentLevel < GOAL_LEVEL; day += 1) {
    currentXp += Math.max(0, Number(dailyXp) || 0) + Math.max(0, Number(extraDailyXp) || 0);

    while (currentLevel < GOAL_LEVEL && currentXp >= xpForLevel(currentLevel)) {
      currentXp -= xpForLevel(currentLevel);
      currentLevel += 1;
      currentXp += bonusForLevel(currentLevel, { clothingToXp, autoToXp });
    }
  }

  return { level: currentLevel, xpInLevel: currentXp, done: currentLevel >= GOAL_LEVEL };
}

function minBaseXpPerDay(params, days, maxTry = 200000) {
  if (days <= 0) return params.level >= GOAL_LEVEL ? 0 : null;
  const completes = (dailyXp) => simulateProgress({ ...params, dailyXp, days }).done;
  if (completes(0)) return 0;
  if (!completes(maxTry)) return null;

  let left = 0;
  let right = maxTry;
  while (left + 1 < right) {
    const middle = Math.floor((left + right) / 2);
    if (completes(middle)) right = middle;
    else left = middle;
  }
  return right;
}

function localDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return localDateInput(date);
}

function daysUntil(targetDate) {
  if (!targetDate) return 0;
  const [year, month, day] = String(targetDate).split("-").map(Number);
  if (!year || !month || !day) return 0;

  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const finish = new Date(year, month - 1, day).getTime();
  return Math.max(0, Math.ceil((finish - startToday) / DAY_MS));
}

function readStoredForm() {
  const fallback = {
    level: 1,
    xpInLevel: 0,
    deadlineMode: "date",
    endDate: defaultDeadline(),
    daysManual: 30,
    dailyXp: DEFAULT_DAILY_XP,
    extraDailyXp: 0,
    clothingToXp: true,
    autoToXp: true,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return fallback;
    return { ...fallback, ...saved };
  } catch {
    return fallback;
  }
}

function NumberField({ label, hint, icon: Icon, value, onChange, min = 0, max = 200000, disabled = false }) {
  return (
    <label className={`bp-field ${disabled ? "is-disabled" : ""}`}>
      <span className="bp-field__label">{Icon ? <Icon size={15} /> : null}{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(clampNumber(event.target.value, min, max))}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Toggle({ checked, onChange, title, description }) {
  return (
    <button
      type="button"
      className={`bp-toggle ${checked ? "is-on" : ""}`}
      onClick={() => {
        hapticImpact("light");
        onChange(!checked);
      }}
      aria-pressed={checked}
    >
      <span className="bp-toggle__copy"><strong>{title}</strong><small>{description}</small></span>
      <span className="bp-toggle__track" aria-hidden><span /></span>
    </button>
  );
}

export default function BpCalc() {
  const [form, setForm] = useState(readStoredForm);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // The calculator remains fully functional if storage is unavailable.
    }
  }, [form]);

  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const effectiveDays = form.deadlineMode === "date"
    ? daysUntil(form.endDate)
    : clampNumber(form.daysManual, 0, 10000);

  const currentLevel = clampNumber(form.level, 1, GOAL_LEVEL);
  const maxLevelXp = Math.max(0, xpForLevel(currentLevel) - 1);
  const currentXp = currentLevel >= GOAL_LEVEL ? 0 : clampNumber(form.xpInLevel, 0, maxLevelXp);

  const params = useMemo(() => ({
    level: currentLevel,
    xpInLevel: currentXp,
    dailyXp: clampNumber(form.dailyXp, 0, 200000),
    extraDailyXp: clampNumber(form.extraDailyXp, 0, 200000),
    clothingToXp: Boolean(form.clothingToXp),
    autoToXp: Boolean(form.autoToXp),
  }), [currentLevel, currentXp, form.dailyXp, form.extraDailyXp, form.clothingToXp, form.autoToXp]);

  const result = useMemo(() => simulateProgress({ ...params, days: effectiveDays }), [params, effectiveDays]);
  const currentLeft = useMemo(() => xpLeftToGoal(currentLevel, currentXp), [currentLevel, currentXp]);
  const requiredDaily = useMemo(() => minBaseXpPerDay(params, effectiveDays), [params, effectiveDays]);
  const remainingAfterPlan = useMemo(
    () => result.done ? 0 : xpLeftToGoal(result.level, result.xpInLevel),
    [result.done, result.level, result.xpInLevel]
  );
  const progress = Math.min(100, Math.max(0, (totalXpAt(currentLevel, currentXp) / totalXpAt(GOAL_LEVEL, 0)) * 100));
  const hasTime = effectiveDays > 0;
  const onTrack = result.done;

  const reset = () => {
    hapticImpact("medium");
    setForm({
      level: 1,
      xpInLevel: 0,
      deadlineMode: "date",
      endDate: defaultDeadline(),
      daysManual: 30,
      dailyXp: DEFAULT_DAILY_XP,
      extraDailyXp: 0,
      clothingToXp: true,
      autoToXp: true,
    });
  };

  return (
    <div className="bp-calc">
      <section className="bp-calc__hero">
        <div>
          <p className="bp-calc__eyebrow"><Trophy size={14} /> NIGHTCOREX · BP</p>
          <h1>BP-калькулятор</h1>
          <p>Введи текущий прогресс и актуальный срок сезона — расчёт обновится сразу.</p>
        </div>
        <button type="button" className="bp-reset" onClick={reset}><RefreshCcw size={16} /> Сбросить</button>
      </section>

      <section className="bp-progress-card" aria-label="Текущий прогресс">
        <div className="bp-progress-card__top">
          <span>Текущий прогресс</span>
          <strong>Уровень {currentLevel} / {GOAL_LEVEL}</strong>
        </div>
        <div className="bp-progress-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.45 }} /></div>
        <div className="bp-progress-card__bottom">
          <span>До цели сейчас</span>
          <b>{formatNumber(currentLeft)} XP</b>
        </div>
      </section>

      <section className="bp-card bp-card--inputs">
        <div className="bp-card__heading"><Gauge size={18} /><div><h2>Текущий прогресс</h2><p>Данные берутся только из твоих полей.</p></div></div>
        <div className="bp-grid bp-grid--two">
          <NumberField label="Текущий уровень" icon={TrendingUp} value={currentLevel} onChange={(value) => setField("level", value)} min={1} max={GOAL_LEVEL} />
          <NumberField label="XP в текущем уровне" icon={Zap} value={currentXp} onChange={(value) => setField("xpInLevel", value)} min={0} max={maxLevelXp} hint={currentLevel < GOAL_LEVEL ? `До ${formatNumber(maxLevelXp)} XP` : "Цель уже достигнута"} disabled={currentLevel >= GOAL_LEVEL} />
        </div>
      </section>

      <section className="bp-card">
        <div className="bp-card__heading"><CalendarDays size={18} /><div><h2>Срок сезона</h2><p>Проверь дату окончания BP перед расчётом.</p></div></div>
        <div className="bp-mode-switch" role="tablist" aria-label="Способ указать срок">
          <button type="button" className={form.deadlineMode === "date" ? "is-active" : ""} onClick={() => setField("deadlineMode", "date")}>По дате</button>
          <button type="button" className={form.deadlineMode === "days" ? "is-active" : ""} onClick={() => setField("deadlineMode", "days")}>По дням</button>
        </div>
        {form.deadlineMode === "date" ? (
          <label className="bp-date-field">
            <span><CalendarDays size={15} /> Дата окончания</span>
            <input type="date" value={form.endDate} onChange={(event) => setField("endDate", event.target.value)} />
            <small>До окончания: <b>{effectiveDays} дн.</b></small>
          </label>
        ) : (
          <NumberField label="Дней до окончания" icon={Clock3} value={form.daysManual} onChange={(value) => setField("daysManual", value)} min={0} max={10000} hint="Укажи количество дней вручную" />
        )}
      </section>

      <section className="bp-card">
        <div className="bp-card__heading"><Zap size={18} /><div><h2>Твой темп</h2><p>Сколько XP ты стабильно получаешь каждый день.</p></div></div>
        <div className="bp-grid bp-grid--two">
          <NumberField label="Основной XP в день" icon={Zap} value={form.dailyXp} onChange={(value) => setField("dailyXp", value)} min={0} max={200000} />
          <NumberField label="Дополнительно XP в день" icon={Sparkles} value={form.extraDailyXp} onChange={(value) => setField("extraDailyXp", value)} min={0} max={200000} hint="Добавляется каждый день" />
        </div>
      </section>

      <section className="bp-card">
        <div className="bp-card__heading"><Coins size={18} /><div><h2>Бонусы за уровни</h2><p>Включай только то, что действительно используешь.</p></div></div>
        <div className="bp-toggle-list">
          <Toggle checked={form.clothingToXp} onChange={(value) => setField("clothingToXp", value)} title="Меняю одежда-кейсы на XP" description="+1 000 XP на уровнях с одеждой" />
          <Toggle checked={form.autoToXp} onChange={(value) => setField("autoToXp", value)} title="Меняю авто-кейсы на XP" description="+5 000 XP на авто-уровнях" />
        </div>
      </section>

      <motion.section
        className={`bp-result ${onTrack ? "is-success" : "is-warning"}`}
        key={`${result.level}-${result.xpInLevel}-${effectiveDays}-${form.dailyXp}-${form.extraDailyXp}`}
        initial={{ opacity: 0.65, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <div className="bp-result__status">
          <span className="bp-result__icon">{onTrack ? <CheckCircle2 size={24} /> : <XCircle size={24} />}</span>
          <div>
            <p>{onTrack ? "Ты успеваешь" : hasTime ? "Нужно увеличить темп" : "Срок уже закончился"}</p>
            <h2>{onTrack ? `К цели за ${effectiveDays} дн.` : `Финиш: уровень ${result.level}`}</h2>
          </div>
        </div>

        <div className="bp-result__grid">
          <div><span>Итоговый уровень</span><b>{result.level}</b></div>
          <div><span>XP после расчёта</span><b>{formatNumber(result.xpInLevel)}</b></div>
          <div><span>Нужно в день</span><b>{requiredDaily === null ? "—" : `${formatNumber(requiredDaily)} XP`}</b></div>
          <div><span>{onTrack ? "Запас по сроку" : "Не хватит"}</span><b>{onTrack ? "Цель достижима" : `${formatNumber(remainingAfterPlan)} XP`}</b></div>
        </div>

        {!onTrack && hasTime ? <p className="bp-result__hint"><CircleAlert size={15} /> Подними основной XP в день хотя бы до {requiredDaily === null ? "достижимого значения" : `${formatNumber(requiredDaily)} XP`}.</p> : null}
        <p className="bp-result__note"><Target size={14} /> Расчёт ориентировочный: он зависит от актуальных правил и наград BP.</p>
      </motion.section>
    </div>
  );
}
