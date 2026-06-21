import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchMe, getApiBase } from "@/lib/auth";
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Pencil,
  Check,
  X,
  Car,
  RefreshCw,
  ChartNoAxesCombined,
  ImagePlus,
  Lock,
  Boxes,
  Layers3,
  ChevronDown,
  ChevronUp, // Добавил иконку для сворачивания
  LayoutDashboard,
  History, // Иконка истории
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";

// ⚠️ В браузерной версии (Vite) нельзя использовать require().
const fetchMeSafe = fetchMe;


// ===== Characters (multi-profile) =====
async function ensureActiveCharacterId(API_BASE) {
  const cached = localStorage.getItem("active_character_id");
  if (cached) return cached;

  const token = localStorage.getItem("auth_token");
  if (!token || !API_BASE) return null;

  const res = await fetch(`${API_BASE}/characters`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const list = await res.json();
  const firstId = list?.[0]?.id;
  if (firstId) localStorage.setItem("active_character_id", firstId);
  return firstId || null;
}

// ====== LS keys ======
const LS_KEY_ENTRIES = "resale_calc_entries_v3";
const LS_KEY_CHART = "resale_calc_chart_v2";
const LS_KEY_RENTALS = "resale_rentals_v4";
const LS_KEY_ENTRY_IMAGES = "resale_calc_entry_images_v1";
const LS_KEY_TG_ENABLED = "resale_tg_enabled_v1";
const LS_KEY_CHART_TAB = "resale_chart_tab_v1";
const LS_KEY_VEHICLE_DIR = "resale_vehicle_dir_v1";
const LS_KEY_AUTO_STATS_HIDDEN = "resale_auto_stats_hidden_v1";
const LS_KEY_SHOW_ENTRIES = "resale_show_entries_v1"; // Новый ключ для сохранения состояния списка
const LS_KEY_INITIAL_BALANCE = "resale_initial_balance_v1";

// ====== helpers ======
function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = String(v || "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function formatThousandsDots(raw) {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  const clean = digits.replace(/^0+(?=\d)/, "");
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseThousandsDots(raw) {
  const s = String(raw ?? "").replace(/\./g, "").replace(/\s/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}


function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0";
  const rounded = Math.round(v);
  return `$${formatThousandsDots(rounded)}`;
}

function moneyCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${Math.round(v / 1000)}k`;
  if (abs >= 1_000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

function dateKeyLocalFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function niceMoneyTick(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function clampNum(n, fallback = 0) {
  const v = parseThousandsDots(n);
  return Number.isFinite(v) ? v : fallback;
}

function calcEntryAmount(e) {
  if (typeof e?.amount === "number") return e.amount;
  const buy = Number(e?.buy);
  const sell = Number(e?.sell);
  const b = Number.isFinite(buy) ? buy : 0;
  const s = Number.isFinite(sell) ? sell : 0;
  if (!s) return -Math.abs(b || 0);
  return s - Math.abs(b || 0);
}

function getEntryCategory(e) {
  const c = String(e?.category || "").toLowerCase();
  if (c === "auto") return "auto";
  if (c === "items") return "items";
  if (c === "property") return "property";
  if (c === "bags") return "bags";
  // legacy: "all" treated as "other"
  if (c === "other" || c === "all") return "other";
  return "other";
}

function isRentalChartEntry(e) {
  const id = String(e?.id || "");
  return id.startsWith("rent_") || id.startsWith("rent_done_");
}

function buildSeries(entries, daysBack = 30, startBalance = 0) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (daysBack - 1));

  const daily = new Map();
  for (const e of entries || []) {
    const ts = e?.timestamp;
    if (!ts) continue;
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    if (d < start || d > end) continue;
    const key = dateKeyLocalFromDate(d);
    const amt = calcEntryAmount(e);
    daily.set(key, (daily.get(key) || 0) + (Number(amt) || 0));
  }

  const out = [];
  let cur = new Date(start);
  let cum = Number(startBalance) || 0;
  while (cur <= end) {
    const key = dateKeyLocalFromDate(cur);
    const sum = daily.get(key) || 0;
    cum += sum;
    out.push({ date: key, sum, cumulative: cum });
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ====== small icon button ======
function IconBtn({ title, onClick, disabled, children, className = "", ...rest }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      {...rest}
      className={[
        "grid h-9 w-9 place-items-center rounded-xl border transition duration-150",
        "border-white/10 bg-white/[0.035] text-white/65",
        disabled
          ? "cursor-not-allowed opacity-35"
          : "hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-95",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ====== pop menu (custom dropdown) ======
function PopMenu({
  value,
  options = [],
  onChange,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  disabled = false,
  width = "w-full",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      setOpen(false);
    };

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("touchstart", onDown, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("touchstart", onDown, true);
    };
  }, [open]);

  const pick = (nextValue) => {
    setOpen(false);
    onChange?.(nextValue);
  };

  return (
    <div ref={ref} className={`relative ${width} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={[
          "flex h-11 w-full items-center justify-between gap-3 rounded-2xl border px-3.5 text-left transition duration-150",
          "border-white/10 bg-black/20 text-white",
          disabled
            ? "cursor-not-allowed opacity-40"
            : "hover:border-white/20 hover:bg-white/[0.045]",
          buttonClassName,
        ].join(" ")}
      >
        <span className="truncate text-sm font-semibold">
          {current?.label ?? "Выбрать"}
        </span>
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-white/45 transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.14 }}
            className={[
              "absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border",
              "border-white/10 bg-[#101116]/[0.98] shadow-2xl shadow-black/60 backdrop-blur-xl",
              menuClassName,
            ].join(" ")}
          >
            <div className="p-1.5">
              {options.map((option) => {
                const active = String(option.value) === String(value);
                const Icon = option.icon;

                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => pick(option.value)}
                    className={[
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition",
                      active
                        ? "bg-white/[0.10] text-white"
                        : "text-white/60 hover:bg-white/[0.06] hover:text-white",
                    ].join(" ")}
                  >
                    {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" /> : null}
                    <span className="truncate">{option.label}</span>
                    {active ? <Check className="ml-auto h-4 w-4 shrink-0 text-white/70" /> : null}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
// ====== Category menu (dropdown) ======
const CATEGORY_OPTIONS = [
  { value: "items", label: "Одежда", icon: Boxes },
  { value: "bags", label: "Сумки", icon: Layers3 },
  { value: "property", label: "Имущество", icon: LayoutDashboard },
  { value: "auto", label: "Авто", icon: Car },
  { value: "other", label: "Прочее", icon: Layers3 },
];

function CategoryMenu({ value, onChange, disabled = false }) {
  return (
    <PopMenu
      value={value}
      options={CATEGORY_OPTIONS}
      onChange={onChange}
      disabled={disabled}
      width="w-full"
      buttonClassName="h-11 rounded-2xl"
      menuClassName="rounded-2xl"
    />
  );
}


// ====== Category segmented (pill) ======

function CategoryBadge({ cat }) {
  const map = {
    auto: { label: "Авто", cls: "border-amber-300/20 bg-amber-300/10 text-amber-100" },
    items: { label: "Одежда", cls: "border-sky-300/20 bg-sky-300/10 text-sky-100" },
    bags: { label: "Сумки", cls: "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100" },
    property: { label: "Имущество", cls: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" },
    other: { label: "Прочее", cls: "border-white/10 bg-white/[0.06] text-white/70" },
  };

  const current = map[cat] || map.other;

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide",
        current.cls,
      ].join(" ")}
    >
      {current.label}
    </span>
  );
}
function CategorySegmented({ value, onChange }) {
  const Item = ({ id, label, Icon }) => {
    const active = value === id;
    return (
      <button
        type="button"
        onClick={() => onChange?.(id)}
        className={[
          "flex-1 h-10 px-3 rounded-2xl",
          "flex items-center justify-center gap-2",
          "text-sm font-semibold transition",
          active
            ? "bg-white/[0.10] text-white shadow-sm ring-1 ring-white/15"
            : "text-white/52 hover:bg-white/[0.06] hover:text-white",

        ].join(" ")}
      >
        <Icon className={["w-4 h-4", active ? "opacity-100" : "opacity-70"].join(" ")} />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <div
      className={[
        "rounded-2xl p-1.5",
        "border border-white/10",
        "bg-black/20 backdrop-blur-xl",
        "shadow-sm",
      ].join(" ")}
    >
      <div className="flex gap-1.5">
        <Item id="items" label="Одежда" Icon={Boxes} />
        <Item id="bags" label="Сумки" Icon={Layers3} />
        <Item id="property" label="Имущество" Icon={LayoutDashboard} />
        <Item id="auto" label="Авто" Icon={Car} />
        <Item id="other" label="Прочее" Icon={Layers3} />
      </div>
    </div>
  );
}


// ====== Type segmented (Expense/Income) ======
function TypeSegmented({ value, onChange }) {
  const isIncome = value === "income";
  const items = [
    { id: "expense", label: "Расход", Icon: TrendingDown },
    { id: "income", label: "Доход", Icon: TrendingUp },
  ];

  return (
    <div className="relative h-11 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-1">
      <div
        className={[
          "absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-xl",
          "bg-white/[0.09] ring-1 ring-white/10 transition-transform duration-200 ease-out",
          isIncome ? "translate-x-full" : "translate-x-0",
        ].join(" ")}
      />

      <div className="relative z-10 grid h-full grid-cols-2 gap-1">
        {items.map(({ id, label, Icon }) => {
          const active = value === id;
          const income = id === "income";

          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange?.(id)}
              className={[
                "flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition",
                active ? "text-white" : "text-white/42 hover:text-white/75",
              ].join(" ")}
            >
              <Icon
                className={[
                  "h-4 w-4",
                  income
                    ? active
                      ? "text-emerald-300"
                      : "text-emerald-300/45"
                    : active
                      ? "text-rose-300"
                      : "text-rose-300/45",
                ].join(" ")}
              />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LockedBlock({
  title = "Доступно только VIP",
  subtitle = "Обнови статус выше FREE, чтобы открыть функцию.",
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-6 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]">
        <Lock className="h-5 w-5 text-white/60" />
      </div>
      <div className="mt-3 text-sm font-bold text-white">{title}</div>
      <div className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-white/45">{subtitle}</div>
    </div>
  );
}

// ====== Auto stats (UNDER chart) ======
// ====== Auto stats (UNDER chart) ======
function AutoStatsUnderChart({ rentals, vehicleDir }) {
  return null;
}

// ====== Chart (RIGHT) ======
function DailySideChart({ chartEntries, onResetChart, title, subtitle, startBalance = 0 }) {
  const series = useMemo(() => buildSeries(chartEntries, 30, startBalance), [chartEntries, startBalance]);
  const [hover, setHover] = useState(null);

  const w = 1000;
  const h = 300;
  const padL = 92;
  const padR = 24;
  const padT = 22;
  const padB = 48;

  const vals = series.map((d) => d.cumulative);
  let minV = vals.length ? Math.min(...vals) : 0;
  let maxV = vals.length ? Math.max(...vals) : 0;

  if (minV === maxV) { minV -= 1; maxV += 1; }
  const range = maxV - minV;
  const extra = range * 0.12;
  minV -= extra;
  maxV += extra;

  const xFor = (i) => {
    const n = series.length - 1;
    if (n <= 0) return padL;
    return padL + (i / n) * (w - padL - padR);
  };

  const yFor = (v) => {
    const t = (v - minV) / (maxV - minV || 1);
    return padT + (1 - t) * (h - padT - padB);
  };

  const pts = series.map((d, i) => [xFor(i), yFor(d.cumulative)]);

  const path = (() => {
    if (!pts.length) return "";
    let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      const cx = ((px + x) / 2).toFixed(2);
      const cy = ((py + y) / 2).toFixed(2);
      d += ` Q ${px.toFixed(2)} ${py.toFixed(2)} ${cx} ${cy}`;
    }
    const last = pts[pts.length - 1];
    d += ` T ${last[0].toFixed(2)} ${last[1].toFixed(2)}`;
    return d;
  })();

  const areaPath = (() => {
    if (!pts.length) return "";
    const first = pts[0];
    const last = pts[pts.length - 1];
    const baseY = h - padB;
    return `${path} L ${last[0].toFixed(2)} ${baseY} L ${first[0].toFixed(2)} ${baseY} Z`;
  })();

  const pickIndex = (clientX, rect) => {
    const mx = clientX - rect.left;
    const x0 = (mx / rect.width) * w;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = Math.abs(pts[i][0] - x0);
      if (dx < bestDist) { bestDist = dx; best = i; }
    }
    return best;
  };

  const onMove = (e) => {
    if (!pts.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(pickIndex(e.clientX, rect));
  };

  const hi = hover ?? Math.max(0, series.length - 1);
  const hd = series[hi] || { date: "—", sum: 0, cumulative: 0 };
  const hx = series.length ? xFor(hi) : padL;
  const hy = series.length ? yFor(hd.cumulative) : h - padB;

  const yTicks = 4;
  const tickVals = useMemo(() => {
    const out = [];
    for (let i = 0; i <= yTicks; i++) {
      const tt = i / yTicks;
      const v = maxV - tt * (maxV - minV);
      out.push(Math.abs(v) < 1e-9 ? 0 : v);
    }
    return out;
  }, [minV, maxV]);

  const ticks = tickVals.map((v) => ({ v, y: yFor(v) }));
  const canReset = (chartEntries?.length || 0) > 0;
  const formatX = (key) => `${key.slice(5, 7)}/${key.slice(8, 10)}`;

  return (
    <div className="rounded-[26px] border border-white/10 bg-[#101116] p-5 shadow-2xl shadow-black/20">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-white/75">
              <ChartNoAxesCombined className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{title}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{subtitle}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right mr-1 hidden sm:block">
            <div className="text-[11px] text-white/40">Текущий выбор</div>
            <div className="text-sm font-semibold text-white">
              {hd.date} • {money(hd.cumulative)}
            </div>
          </div>

          <IconBtn title="Сбросить график" onClick={onResetChart} disabled={!canReset}>
            <RefreshCw className="w-4 h-4 text-white/75" />
          </IconBtn>
        </div>
      </div>

      <div className="relative w-full overflow-hidden" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${w} ${h}`} className="h-[230px] w-full select-none text-white">
          <defs>
            <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {ticks.map((tt, idx) => (
            <g key={idx}>
              <line x1={padL} y1={tt.y} x2={w - padR} y2={tt.y} className="stroke-white/[0.09]" strokeWidth="1" />
              <text x={padL - 16} y={tt.y + 6} textAnchor="end" className="fill-white/35" fontSize="16">
                ${niceMoneyTick(tt.v)}
              </text>
            </g>
          ))}
          <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} className="stroke-white/[0.09]" strokeWidth="1" />
          <path d={areaPath} fill="url(#areaGrad)" />
          <path d={path} fill="none" className="stroke-white/75" strokeWidth="3" strokeLinecap="round" />
          {series.length > 0 && (
            <>
              <line x1={hx} y1={padT} x2={hx} y2={h - padB} className="stroke-white/20" strokeWidth="1" />
              <circle cx={hx} cy={hy} r="6" className="fill-[#111217] stroke-white/80" strokeWidth="3" />
            </>
          )}
        </svg>
        {/* Tooltip intentionally removed: current selection is already shown above ("Текущий выбор"). */}
        {series.length > 0 ? (
          <div className="mt-2 flex justify-between text-[11px] tabular-nums text-white/35">
            <span>{formatX(series[0].date)}</span>
            <span>{formatX(series[Math.floor(series.length / 2)].date)}</span>
            <span>{formatX(series[series.length - 1].date)}</span>
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-white/35">Нет данных для графика.</div>
        )}
      </div>
    </div>
  );
}

// ====== Main ======
export default function Calculator() {
  const API_BASE = useMemo(() => (typeof getApiBase === "function" ? getApiBase() : ""), []);

  const [characterId, setCharacterId] = useState(null);


// keep character in sync with Settings/topbar switcher
useEffect(() => {
  const onChar = (e) => {
    const id = String(e?.detail || "");
    if (!id) return;
    setCharacterId(id);

    // clear UI immediately so you don't see previous character stats
    hydratedRef.current = false;
    setEntries([]);
    setChartStore([]);
    setRentals([]);
    setVehicleDir([]);
    setEntryImages({});
    setShowEntries(true);
    setInitialBalance(0);
  };
  window.addEventListener("nightcore:character", onChar);
  return () => window.removeEventListener("nightcore:character", onChar);
}, []);


  useEffect(() => {
    let mounted = true;
    (async () => {
      const id = await ensureActiveCharacterId(API_BASE);
      if (mounted) setCharacterId(id);
    })();
    return () => { mounted = false; };
  }, [API_BASE]);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("items");
  const [entryType, setEntryType] = useState("expense");

  const lastEntryIdRef = useRef(null);
  const pasteTargetIdRef = useRef(null);

  const [entries, setEntries] = useState([]);
  const [chartStore, setChartStore] = useState([]);
  const [chartResetKey, setChartResetKey] = useState(0);
  const [rentals, setRentals] = useState([]);

  // State to toggle entries list visibility
  const [showEntries, setShowEntries] = useState(() => true);
  const hydratedRef = useRef(false);

  const [vehicleDir, setVehicleDir] = useState(() => []);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editBuy, setEditBuy] = useState("");
  const [editSell, setEditSell] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editCategory, setEditCategory] = useState("items");

  const [entryImages, setEntryImages] = useState(() => ({}));

  const [lightboxImg, setLightboxImg] = useState(null);
  const amountRef = useRef(null);

  const [me, setMe] = useState(null);
  const [tier, setTier] = useState("FREE");
  const [tierLoaded, setTierLoaded] = useState(false);
  const [meRefreshKey, setMeRefreshKey] = useState(0);

  useEffect(() => {
    const onMe = () => setMeRefreshKey((k) => k + 1);
    window.addEventListener("nightcore:me", onMe);
    return () => window.removeEventListener("nightcore:me", onMe);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setMeRefreshKey((k) => k + 1);
    };
    tick();
    const interval = setInterval(tick, 10000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const canPro = tier !== "FREE";

  const [tgEnabled, setTgEnabled] = useState(() => false);

  const chartTab = "all";

  const [chartOpen, setChartOpen] = useState(false);

  // Initial balance (start point)
  const [initialBalance, setInitialBalance] = useState(() => 0);
  const [initialBalanceOpen, setInitialBalanceOpen] = useState(false);
  const [initialBalanceDraft, setInitialBalanceDraft] = useState("");

  const handleResetChart = () => {
    resetChartOnly();
    setChartResetKey((k) => k + 1);
  };

  const TAB_ORDER = ["all", "auto", "items"];
  const [chartDir, setChartDir] = useState(0);

  const selectChartTab = (next) => {
    const curIdx = TAB_ORDER.indexOf(chartTab);
    const nextIdx = TAB_ORDER.indexOf(next);
    setChartDir(nextIdx - curIdx);
    setChartTab(next);
  };

    
  // Save visibility preference
  

  const uploadEntryImage = (entryId, file) => {
    if (!entryId || !file) return;
    if (!file.type?.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEntryImages((prev) => ({ ...(prev || {}), [entryId]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const deleteEntryImage = (entryId) => {
    if (!entryId) return;
    setEntryImages((prev) => {
      const next = { ...(prev || {}) };
      delete next[entryId];
      return next;
    });
    if (lightboxImg) setLightboxImg(null);
  };

  // load/save (DB via /cstate/<character>/calculator_v1)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        hydratedRef.current = false;
        if (!API_BASE || !characterId) return;
        const token = localStorage.getItem("auth_token");
        if (!token) return;

        // reset state for this character before loading
        setEntries([]);
        setChartStore([]);
        setRentals([]);
        setVehicleDir([]);
        setEntryImages({});
        // TG enabled is stored in users table
        try {
          const rTg = await fetch(`${API_BASE}/settings/telegram`, { headers: { Authorization: `Bearer ${token}` } });
          const jTg = await rTg.json().catch(() => ({}));
          if (mounted && typeof jTg?.tg_enabled === "boolean") setTgEnabled(!!jTg.tg_enabled);
        } catch {}

        const r = await fetch(`${API_BASE}/cstate/${characterId}/calculator_v1`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json().catch(() => ({}));
        if (!mounted) return;
        const v = j?.value;
        if (v && typeof v === "object") {
          if (Array.isArray(v.entries)) setEntries(v.entries);
          if (Array.isArray(v.chartStore)) setChartStore(v.chartStore);
          if (Array.isArray(v.rentals)) setRentals(v.rentals);
          if (Array.isArray(v.vehicleDir)) setVehicleDir(v.vehicleDir);
          if (v.entryImages && typeof v.entryImages === "object") setEntryImages(v.entryImages);
          if (typeof v.showEntries === "boolean") setShowEntries(v.showEntries);
          if (typeof v.initialBalance === "number" && Number.isFinite(v.initialBalance)) setInitialBalance(v.initialBalance);
        }
      } catch {}
      hydratedRef.current = true;
    })();

    return () => { mounted = false; };
  }, [API_BASE, characterId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!API_BASE || !characterId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    const payload = {
      entries,
      chartStore,
      rentals,
      vehicleDir,
      entryImages,
      showEntries,
      initialBalance,
    };

    const t = setTimeout(() => {
      fetch(`${API_BASE}/cstate/${characterId}/calculator_v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: payload }),
      }).catch(() => {});
    }, 800);

    return () => clearTimeout(t);
  }, [API_BASE, characterId, entries, chartStore, rentals, vehicleDir, entryImages, showEntries, initialBalance]);

  // Paste images
  useEffect(() => {
    const onPaste = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!canPro) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          const targetId = editingId || pasteTargetIdRef.current || lastEntryIdRef.current;
          if (!targetId) return;
          e.preventDefault();
          uploadEntryImage(targetId, file);
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canPro, editingId]);

  // Try fetch me
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (fetchMeSafe) {
          const m = await fetchMeSafe();
          if (!mounted) return;
          setMe(m);
          const role = String(m?.role || m?.user?.role || "").toLowerCase();
          const isAdmin = role === "admin" || role === "owner" || role === "superadmin";
          const vipUntilRaw = m?.vip_until || m?.vipUntil || null;
          const vipUntil = vipUntilRaw ? new Date(vipUntilRaw) : null;
          const vipByDate = vipUntil && !Number.isNaN(vipUntil.getTime()) ? vipUntil.getTime() > Date.now() : false;
          const isVip = isAdmin || role === "vip" || !!m?.vip_active || vipByDate;
          setTier(isAdmin ? "ADMIN" : isVip ? "VIP" : "FREE");
          setTierLoaded(true);
        }
      } catch { }
    })();
    return () => { mounted = false; };
  }, [meRefreshKey]);

  const handleSave = () => {
    const v = clampNum(amount, NaN);
    if (!Number.isFinite(v) || v <= 0) return;

    const amt = Math.abs(v);
    const isIncome = entryType === "income";

    const newEntry = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      category,
      // keep legacy structure: buy/sell so totals, filters and chart keep working
      buy: isIncome ? 0 : amt,
      sell: isIncome ? amt : 0,
      note: note.trim() || "Без записи",
      timestamp: new Date().toISOString()
    };
    lastEntryIdRef.current = newEntry.id;
    setEntries((prev) => [newEntry, ...prev]);
    setChartStore((prev) => [newEntry, ...prev]);
    setAmount("");
    setNote("");
    setShowEntries(true); // Auto show list when adding
    requestAnimationFrame(() => amountRef.current?.focus?.());
  };

  const handleDelete = (id) => {
    if (editingId === id) {
      setEditingId(null);
      setEditBuy("");
      setEditSell("");
      setEditNote("");
      setEditCategory("items");
    }

    setEntries((prev) => prev.filter((e) => e.id !== id));
    setChartStore((prev) => prev.filter((e) => e.id !== id)); // ✅ ДОБАВЬ

    setEntryImages((prev) => {
      const next = { ...(prev || {}) };
      delete next[id];
      return next;
    });
  };


  const resetEntriesOnly = () => {
    setEditingId(null);
    setEditBuy("");
    setEditSell("");
    setEditNote("");
    setEditCategory("items");
    setEntries([]);
    setEntryImages({});
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    if (typeof e?.amount === "number") {
      const a = Number(e.amount);
      setEditBuy(formatThousandsDots(a < 0 ? Math.abs(a) : 0));
      setEditSell(formatThousandsDots(a > 0 ? a : 0));
    } else {
      setEditBuy(formatThousandsDots(e.buy ?? ""));
      setEditSell(formatThousandsDots(e.sell ?? ""));
    }
    setEditNote(String(e.note ?? ""));
    setEditCategory(getEntryCategory(e));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBuy("");
    setEditSell("");
    setEditNote("");
    setEditCategory("items");
  };

  const saveEdit = (id) => {
    const buy = clampNum(editBuy, NaN);
    const sell = clampNum(editSell, 0);
    if (!Number.isFinite(buy) || buy < 0) return;
    const nextNote = String(editNote || "").trim() || "Без записи";
    const nextCategory =
      ["auto", "items", "bags", "property"].includes(editCategory)
        ? editCategory
        : "other";

    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, amount: undefined, buy: Math.abs(buy || 0), sell: Math.max(0, sell || 0), note: nextNote, category: nextCategory } : e));
    setChartStore((prev) => prev.map((e) => e.id === id ? { ...e, amount: undefined, buy: Math.abs(buy || 0), sell: Math.max(0, sell || 0), note: nextNote, category: nextCategory } : e));
    cancelEdit();
  };

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, e) => {
        const a = calcEntryAmount(e);
        acc.total += a;
        if (a > 0) acc.positive += a;
        if (a < 0) acc.negative += Math.abs(a);
        return acc;
      },
      { total: initialBalance, positive: 0, negative: 0 }
    );
  }, [entries, initialBalance]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      const a = calcEntryAmount(e);
      if (filter === "positive" && a <= 0) return false;
      if (filter === "negative" && a >= 0) return false;
      if (!q) return true;
      return String(e.note || "").toLowerCase().includes(q);
    });
  }, [entries, filter, search]);

  const chartEntries = useMemo(() => {
    return Array.isArray(chartStore)
      ? chartStore.filter((e) => !isRentalChartEntry(e))
      : [];
  }, [chartStore]);


  const resetChartOnly = () => {
    const tab = chartTab;
    if (tab === "auto") { setChartStore((prev) => (Array.isArray(prev) ? prev.filter((e) => !isRentalChartEntry(e)) : [])); return; }
    if (tab === "items") { setChartStore((prev) => (Array.isArray(prev) ? prev.filter((e) => isRentalChartEntry(e)) : [])); return; }
    setChartStore((prev) => (Array.isArray(prev) ? prev.filter((e) => isRentalChartEntry(e)) : []));
  };

  const chartTitle = "График";
  const chartSubtitle = "Доход и расход за последние 30 дней.";


  return (
    <>
      <div className="calculator-shell mx-auto w-full max-w-[1360px] rounded-[32px] border border-white/10 bg-[#0b0c10]/94 p-4 text-slate-100 shadow-[0_22px_70px_rgba(0,0,0,0.34)] sm:p-5">
        <style>{`
          .calculator-shell {
            color: #f8fafc;
            isolation: isolate;
          }

          /* Полностью убираем видимые рамки у карточек, кнопок, меню и модальных окон. */
          .calculator-shell,
          .calculator-shell *,
          .calculator-shell *::before,
          .calculator-shell *::after {
            border-color: transparent !important;
            --tw-ring-color: transparent !important;
            --tw-ring-shadow: 0 0 #0000 !important;
            --tw-ring-offset-shadow: 0 0 #0000 !important;
          }

          .calculator-shell input,
          .calculator-shell textarea {
            background-color: #111318 !important;
            border: 0 !important;
            color: #f8fafc !important;
            caret-color: #f8fafc;
          }

          .calculator-shell input::placeholder,
          .calculator-shell textarea::placeholder {
            color: rgba(248,250,252,0.42) !important;
            opacity: 1;
          }

          .calculator-shell input:-webkit-autofill,
          .calculator-shell input:-webkit-autofill:hover,
          .calculator-shell input:-webkit-autofill:focus {
            -webkit-text-fill-color: #f8fafc !important;
            -webkit-box-shadow: 0 0 0 1000px #111318 inset !important;
            box-shadow: 0 0 0 1000px #111318 inset !important;
            transition: background-color 9999s ease-out 0s;
          }

          .calculator-shell input:focus,
          .calculator-shell textarea:focus {
            border: 0 !important;
            outline: none;
            box-shadow: none !important;
          }

          .custom-page-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
          .custom-page-scroll::-webkit-scrollbar-track { background: transparent; }
          .custom-page-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 999px; }
          .custom-page-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); }
        `}</style>

        {/* Analytics */}
        <AnimatePresence>
          {chartOpen && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                aria-label="Закрыть"
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                onClick={() => setChartOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.985 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="relative w-full max-w-3xl overflow-hidden rounded-[30px] border border-white/10 bg-[#111217] shadow-2xl shadow-black/70"
              >
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/80">
                      <ChartNoAxesCombined className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">Аналитика</div>
                      <div className="mt-0.5 text-[11px] text-white/40">Динамика баланса за 30 дней</div>
                    </div>
                  </div>
                  <IconBtn title="Закрыть" onClick={() => setChartOpen(false)}>
                    <X className="h-4 w-4" />
                  </IconBtn>
                </div>

                <div className="p-4 sm:p-5">
                  {canPro ? (
                    <DailySideChart
                      key={chartResetKey}
                      chartEntries={chartEntries}
                      onResetChart={handleResetChart}
                      title={chartTitle}
                      subtitle={chartSubtitle}
                      startBalance={initialBalance}
                    />
                  ) : (
                    <LockedBlock
                      title="Графики недоступны"
                      subtitle="Аналитика открывается для пользователей выше FREE."
                    />
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Starting balance */}
        <AnimatePresence>
          {initialBalanceOpen && (
            <motion.div
              className="fixed inset-0 z-[105] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                aria-label="Закрыть"
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                onClick={() => setInitialBalanceOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.985 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-white/10 bg-[#111217] shadow-2xl shadow-black/70"
              >
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/80">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">Исходный баланс</div>
                      <div className="mt-0.5 text-[11px] text-white/40">Стартовая точка для расчётов</div>
                    </div>
                  </div>
                  <IconBtn title="Закрыть" onClick={() => setInitialBalanceOpen(false)}>
                    <X className="h-4 w-4" />
                  </IconBtn>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
                      Сумма ($)
                    </label>
                    <Input
                      value={initialBalanceDraft}
                      onChange={(e) => setInitialBalanceDraft(formatThousandsDots(e.target.value))}
                      placeholder="Например: 5.000"
                      className="h-12 border-white/10 bg-black/25 text-lg font-semibold text-white placeholder:text-white/25 focus-visible:ring-white/20"
                      inputMode="decimal"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setInitialBalance(clampNum(initialBalanceDraft, 0));
                        setInitialBalanceOpen(false);
                      }}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-black transition hover:bg-white/90 active:scale-[0.99]"
                    >
                      <Check className="h-4 w-4" /> Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => setInitialBalanceOpen(false)}
                      className="h-11 rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/65 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      Отмена
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInitialBalanceDraft("0")}
                    className="text-xs text-white/40 transition hover:text-white underline underline-offset-4"
                  >
                    Сбросить в 0
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Photo preview */}
        <AnimatePresence>
          {lightboxImg && (
            <motion.div
              className="fixed inset-0 z-[110] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxImg(null)}
            >
              <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
              <motion.img
                src={lightboxImg}
                alt="Фото записи"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.16 }}
                className="relative max-h-[86vh] max-w-[92vw] rounded-[24px] border border-white/10 bg-[#111217] object-contain shadow-2xl shadow-black/80"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setLightboxImg(null)}
                className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-black/45 text-white/75 transition hover:bg-white/[0.10] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-4 flex flex-col gap-4 pt-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">finance control</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">Калькулятор</h1>
            <p className="mt-1 text-sm text-white/42">Доходы, расходы и история операций в одном месте.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canPro}
              title={canPro ? "Открыть аналитику" : "Аналитика доступна только VIP"}
              onClick={() => canPro && setChartOpen(true)}
              className={[
                "flex h-10 items-center gap-2 rounded-2xl border px-3.5 text-xs font-bold transition",
                canPro
                  ? "border-white/10 bg-white/[0.045] text-white/75 hover:bg-white/[0.09] hover:text-white"
                  : "cursor-not-allowed border-white/5 bg-white/[0.02] text-white/25",
              ].join(" ")}
            >
              {canPro ? <ChartNoAxesCombined className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              Аналитика
            </button>

            <button
              type="button"
              onClick={() => {
                setInitialBalanceDraft(formatThousandsDots(initialBalance));
                setInitialBalanceOpen(true);
              }}
              className="flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3.5 text-xs font-bold text-white/75 transition hover:bg-white/[0.09] hover:text-white"
            >
              <DollarSign className="h-4 w-4" />
              Стартовый баланс
            </button>
          </div>
        </div>

        {/* Balance and compact stats */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_repeat(3,minmax(0,0.72fr))]">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className={[
              "relative overflow-hidden rounded-[28px] border p-5 shadow-2xl shadow-black/20 md:col-span-2 xl:col-span-1",
              totals.total >= 0 ? "border-emerald-300/20 bg-emerald-300/[0.055]" : "border-rose-300/20 bg-rose-300/[0.055]",
            ].join(" ")}
          >
            <div className="absolute inset-y-0 left-0 w-1 bg-white/45" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                  <LayoutDashboard className="h-3.5 w-3.5" /> Текущий баланс
                </div>
                <div className="mt-2 truncate text-3xl font-semibold tracking-tight tabular-nums text-white sm:text-[34px]" title={money(totals.total)}>
                  {totals.total >= 0 ? "+" : "-"}{money(Math.abs(totals.total))}
                </div>
                <div className="mt-1 text-xs text-white/38">
                  Начальная сумма: {money(initialBalance)}
                </div>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/15">
                {totals.total >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-200" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-rose-200" />
                )}
              </div>
            </div>
          </motion.section>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.04 }}
            className="rounded-[24px] border border-white/10 bg-black/20 p-4"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/36">Операций</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{entries.length}</div>
            <div className="mt-1 text-xs text-white/35">Всего сохранено</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.08 }}
            className="rounded-[24px] border border-emerald-300/15 bg-emerald-300/[0.035] p-4"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100/70">Доход</div>
            <div className="mt-2 truncate text-2xl font-semibold tabular-nums text-emerald-100" title={money(totals.positive)}>
              {moneyCompact(totals.positive)}
            </div>
            <div className="mt-1 text-xs text-emerald-100/55">За все записи</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.12 }}
            className="rounded-[24px] border border-rose-300/15 bg-rose-300/[0.035] p-4"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-100/70">Расход</div>
            <div className="mt-2 truncate text-2xl font-semibold tabular-nums text-rose-100" title={money(totals.negative)}>
              {moneyCompact(totals.negative)}
            </div>
            <div className="mt-1 text-xs text-rose-100/55">За все записи</div>
          </motion.div>
        </div>

        <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-[minmax(330px,0.82fr)_minmax(0,1.4fr)]">
          {/* New entry */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.1 }}
            className="rounded-[28px] border border-white/10 bg-[#101116] p-5 shadow-2xl shadow-black/15"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/80">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Новая операция</h2>
                  <p className="mt-0.5 text-[11px] text-white/38">Добавь доход или расход</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.78fr)]">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
                    Тип операции
                  </label>
                  <TypeSegmented value={entryType} onChange={setEntryType} />
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
                    Сумма ($)
                  </label>
                  <Input
                    ref={amountRef}
                    value={amount}
                    onChange={(e) => setAmount(formatThousandsDots(e.target.value))}
                    placeholder="10.000"
                    className="h-11 border-white/10 bg-black/20 text-base font-semibold tabular-nums text-white placeholder:text-white/25 focus-visible:ring-white/20"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
                  Категория
                </label>
                <CategoryMenu value={category} onChange={setCategory} />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
                  Описание
                </label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Например: Покупка футболки"
                  rows={3}
                  className="min-h-[84px] resize-none border-white/10 bg-black/20 text-sm text-white placeholder:text-white/25 focus-visible:ring-white/20"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-black transition hover:bg-white/90 active:scale-[0.99]"
              >
                <Plus className="h-4 w-4" /> Добавить операцию
              </button>
            </div>
          </motion.section>

          {/* History */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.14 }}
            className="flex h-[clamp(380px,49vh,570px)] min-w-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#101116] p-4 shadow-2xl shadow-black/15 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/80">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">История операций</h2>
                  <p className="mt-0.5 text-[11px] text-white/38">
                    {filteredEntries.length} {filteredEntries.length === 1 ? "запись" : "записей"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowEntries((v) => !v)}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-bold text-white/60 transition hover:bg-white/[0.08] hover:text-white"
              >
                {showEntries ? (
                  <>Скрыть <ChevronUp className="h-3.5 w-3.5" /></>
                ) : (
                  <>Показать <ChevronDown className="h-3.5 w-3.5" /></>
                )}
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_260px]">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по описанию..."
                className="h-10 border-white/10 bg-black/20 text-sm text-white placeholder:text-white/25 focus-visible:ring-white/20"
              />

              <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-black/20 p-1">
                {[
                  { id: "all", label: "Все" },
                  { id: "positive", label: "Доход" },
                  { id: "negative", label: "Расход" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={[
                      "h-8 rounded-xl px-2 text-[11px] font-bold transition",
                      filter === item.id
                        ? "bg-white/[0.10] text-white"
                        : "text-white/40 hover:text-white/70",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {showEntries && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.16 }}
                  className="custom-page-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
                >
                  {filteredEntries.length === 0 ? (
                    <div className="grid h-full min-h-[230px] place-items-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.018] px-4 text-center">
                      <div>
                        <Boxes className="mx-auto h-10 w-10 text-white/20" />
                        <div className="mt-3 text-sm font-semibold text-white/55">Список пуст</div>
                        <div className="mt-1 text-xs text-white/32">Добавь первую операцию слева.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredEntries.map((entry) => {
                        const isEditing = editingId === entry.id;
                        const hasImg = !!entryImages?.[entry.id];
                        const entryAmount = calcEntryAmount(entry);
                        const entryCategory = getEntryCategory(entry);

                        return (
                          <motion.div
                            key={entry.id}
                            layout="position"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.16 }}
                            onMouseEnter={() => (pasteTargetIdRef.current = entry.id)}
                            onMouseLeave={() => {
                              if (pasteTargetIdRef.current === entry.id) pasteTargetIdRef.current = null;
                            }}
                            className="rounded-[20px] border border-white/8 bg-white/[0.028] p-3 transition hover:border-white/15 hover:bg-white/[0.045]"
                          >
                            {!isEditing ? (
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                {hasImg && (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxImg(entryImages?.[entry.id] || null)}
                                    className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10"
                                    title="Открыть фото"
                                  >
                                    <img
                                      src={entryImages?.[entry.id]}
                                      alt="Фото записи"
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  </button>
                                )}

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <CategoryBadge cat={entryCategory} />
                                    <span className="text-[11px] text-white/34">
                                      {format(new Date(entry.timestamp), "d MMM, HH:mm")}
                                    </span>
                                  </div>
                                  <div className="mt-2 break-words text-sm leading-snug text-white/76">
                                    {entry.note}
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-3 sm:justify-end">
                                  <div
                                    className={[
                                      "text-right text-base font-semibold tabular-nums",
                                      entryAmount >= 0 ? "text-emerald-200" : "text-rose-200",
                                    ].join(" ")}
                                  >
                                    {entryAmount >= 0 ? "+" : ""}{money(entryAmount)}
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <label
                                      title={canPro ? "Добавить фото" : "Фото доступно только VIP"}
                                      className={[
                                        "grid h-8 w-8 place-items-center rounded-lg border border-white/10 transition",
                                        canPro
                                          ? "cursor-pointer text-white/48 hover:bg-white/[0.08] hover:text-white"
                                          : "cursor-not-allowed text-white/20",
                                      ].join(" ")}
                                    >
                                      {canPro ? <ImagePlus className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        disabled={!canPro}
                                        onChange={(event) => {
                                          if (!canPro) return;
                                          const file = event.target.files?.[0];
                                          if (file) uploadEntryImage(entry.id, file);
                                          event.target.value = "";
                                        }}
                                      />
                                    </label>

                                    <button
                                      type="button"
                                      title="Редактировать"
                                      onClick={() => startEdit(entry)}
                                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/48 transition hover:bg-white/[0.08] hover:text-white"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      title="Удалить"
                                      onClick={() => handleDelete(entry.id)}
                                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/40 transition hover:border-rose-300/25 hover:bg-rose-300/10 hover:text-rose-100"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {hasImg && (
                                  <button
                                    type="button"
                                    onClick={() => deleteEntryImage(entry.id)}
                                    className="text-[10px] text-white/30 transition hover:text-rose-200 sm:self-end"
                                  >
                                    Удалить фото
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs font-bold text-white">Редактирование операции</div>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="text-[11px] font-semibold text-white/40 transition hover:text-white"
                                  >
                                    Отмена
                                  </button>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Покупка</label>
                                    <Input
                                      value={editBuy}
                                      onChange={(event) => setEditBuy(formatThousandsDots(event.target.value))}
                                      className="h-10 border-white/10 bg-black/20 text-sm text-white placeholder:text-white/25 focus-visible:ring-white/20"
                                      inputMode="decimal"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Продажа</label>
                                    <Input
                                      value={editSell}
                                      onChange={(event) => setEditSell(formatThousandsDots(event.target.value))}
                                      className="h-10 border-white/10 bg-black/20 text-sm text-white placeholder:text-white/25 focus-visible:ring-white/20"
                                      inputMode="decimal"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Описание</label>
                                  <Textarea
                                    value={editNote}
                                    onChange={(event) => setEditNote(event.target.value)}
                                    rows={2}
                                    className="min-h-[64px] resize-none border-white/10 bg-black/20 text-sm text-white placeholder:text-white/25 focus-visible:ring-white/20"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Категория</label>
                                  <CategoryMenu value={editCategory} onChange={setEditCategory} />
                                </div>

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveEdit(entry.id)}
                                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-xs font-bold text-black transition hover:bg-white/90"
                                  >
                                    <Check className="h-4 w-4" /> Сохранить
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                                    title="Отмена"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {!showEntries && (
              <div className="grid flex-1 place-items-center text-center">
                <div>
                  <History className="mx-auto h-8 w-8 text-white/18" />
                  <div className="mt-2 text-xs text-white/35">История скрыта</div>
                </div>
              </div>
            )}
          </motion.section>
        </div>
      </div>
    </>
  );
}
