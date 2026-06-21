import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Car,
  Home,
  Plus,
  X,
  Clock,
  Trash2,
  Info,
  Pin,
  ArrowUp,
  ArrowDown,
  Send,
  Calculator,
  Lock,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { fetchMe, getApiBase } from "@/lib/auth";

/* =========================
   BRAND DETECT
========================= */

const BRAND_ALIASES = [
  { brand: "BMW", keys: ["bmw", "бмв", "беха", "бех", "бумер"] },
  { brand: "Mercedes", keys: ["mercedes", "mb", "мерс", "мерседес", "мерин", "benz", "бенц"] },
  { brand: "Tesla", keys: ["tesla", "тесла"] },
  { brand: "Toyota", keys: ["toyota", "тойота"] },
  { brand: "Nissan", keys: ["nissan", "ниссан"] },
  { brand: "Porsche", keys: ["porsche", "порше"] },
  { brand: "Ferrari", keys: ["ferrari", "феррари"] },
  { brand: "Lamborghini", keys: ["lamborghini", "ламбо", "ламборгини"] },
  { brand: "Bugatti", keys: ["bugatti", "бугатти"] },
  { brand: "McLaren", keys: ["mclaren", "макларен"] },
  { brand: "Maserati", keys: ["maserati", "мазерати"] },
  { brand: "Rolls-Royce", keys: ["rolls", "rollsroyce", "rolls-royce", "роллс", "ролс", "роллс-ройс", "ройс"] },
  { brand: "Bentley", keys: ["bentley", "бентли"] },
  { brand: "Ford", keys: ["ford", "форд"] },
  { brand: "Kia", keys: ["kia", "киа"] },
  // если у тебя файл Hyunda.svg
  { brand: "Hyunda", keys: ["hyundai", "хендай", "хундай", "хёндай"] },
  // если у тебя файл Infinity.svg
  { brand: "Infinity", keys: ["infiniti", "infinity", "инфинити"] },
  { brand: "Jeep", keys: ["jeep", "джип"] },
  { brand: "Jaguar", keys: ["jaguar", "ягуар"] },
  { brand: "Peugeot", keys: ["peugeot", "пежо"] },
  { brand: "Genesis", keys: ["genesis", "дженезис", "генезис"] },
  { brand: "Mazda", keys: ["mazda", "мазда"] },
  // если у тебя файл Honda.svg
  { brand: "Honda", keys: ["honda", "хонда"] },
  { brand: "Hummer", keys: ["hummer", "хаммер"] },
];

function normalizeNameForBrand(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectBrandFromName(name) {
  const s = normalizeNameForBrand(name);
  if (!s) return null;
  const tokens = s.split(/[\s-]+/g).filter(Boolean);

  for (const rule of BRAND_ALIASES) {
    for (const k of rule.keys) {
      if (tokens.includes(k)) return rule.brand;
    }
  }
  for (const rule of BRAND_ALIASES) {
    for (const k of rule.keys) {
      if (s.includes(k)) return rule.brand;
    }
  }
  return null;
}

function getBrandLogoUrl(brand) {
  if (!brand) return null;
  return new URL(`./vectors/car-logo/${brand}.svg`, import.meta.url).href;
}

/* =========================
   STORAGE + HELPERS
========================= */

const STORAGE_KEY = "nx_rentals_v5";

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

const LS_KEY_TG_ENABLED = "nx_rentals_tg_enabled_v1";

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function clampNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function calcDiscountedRate({ baseRate, hours, stepHours, discountPerStep }) {
  const br = Number(baseRate) || 0;
  const h = Number(hours) || 0;
  const sh = Number(stepHours) || 0;
  const ds = Number(discountPerStep) || 0;

  if (br <= 0 || h <= 0 || sh <= 0 || ds <= 0) {
    return { effectiveRate: br, steps: 0, discountPerHour: 0 };
  }

  const steps = Math.floor(h / sh);
  const discountPerHour = steps * ds;
  const effectiveRate = Math.max(0, br - discountPerHour);

  return { effectiveRate, steps, discountPerHour };
}

function formatMoney(amount) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTimeLeft(endTime, now) {
  if (!endTime) return "";
  const diff = endTime - now;
  if (diff <= 0) return "00:00";

  const totalSec = Math.floor(diff / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  // если больше часа — показываем H:MM:SS
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${pad2(mm)}:${pad2(s)}`;
  }
  return `${pad2(m)}:${pad2(s)}`;
}

function normalizeCar(raw) {
  const id = typeof raw?.id === "number" || typeof raw?.id === "string" ? raw.id : Date.now();
  const name = typeof raw?.name === "string" && raw.name.trim() ? raw.name : "Без названия";
  const plate = typeof raw?.plate === "string" && raw.plate.trim() ? raw.plate : "Без номера";

  const status = raw?.status === "active" ? "active" : "available";
  const brand = raw?.brand || detectBrandFromName(name) || null;

  const rentalEndTime =
    raw?.rentalEndTime === null || raw?.rentalEndTime === undefined ? null : Number(raw.rentalEndTime);

  const incomeRaw = raw?.income || {};
  const income = {
    week: Number(incomeRaw.week) || 0,
    month: Number(incomeRaw.month) || 0,
    total: Number(incomeRaw.total) || 0,
  };

  const lastRentalEarned = Number(raw?.lastRentalEarned) || 0;
  const lastRate = Number(raw?.lastRate) || 250;





  const pricingRaw = raw?.pricing || {};
  const pricing = {
    baseRate: Number(pricingRaw.baseRate) || lastRate || 50,
    stepHours: clampNum(pricingRaw.stepHours ?? 0, 0, 999),
    discountPerStep: clampNum(pricingRaw.discountPerStep ?? 0, 0, 999),
  };






  const history = Array.isArray(raw?.history) ? raw.history : [];
  const pinned = !!raw?.pinned;
  const priority = clampNum(raw?.priority ?? 0, 0, 10);
  const notifiedAt = raw?.notifiedAt ? Number(raw.notifiedAt) : null;

  const timerId =
    typeof raw?.timerId === "string"
      ? raw.timerId
      : typeof raw?.timer_id === "string"
        ? raw.timer_id
        : null;

  return {
    type: "car",
    id,
    name,
    plate,
    status,
    brand,
    rentalEndTime: Number.isFinite(rentalEndTime) ? rentalEndTime : null,
    income,
    lastRentalEarned,
    lastRate,
    pricing,
    history,
    pinned,
    priority,
    notifiedAt,
    timerId,
  };
}

function normalizeHome(raw) {
  const id = typeof raw?.id === "number" || typeof raw?.id === "string" ? raw.id : Date.now();
  const name = typeof raw?.name === "string" && raw.name.trim() ? raw.name : "Без названия";

  const status = raw?.status === "active" ? "active" : "available";

  const rentalEndTime =
    raw?.rentalEndTime === null || raw?.rentalEndTime === undefined ? null : Number(raw.rentalEndTime);

  const incomeRaw = raw?.income || {};
  const income = {
    week: Number(incomeRaw.week) || 0,
    month: Number(incomeRaw.month) || 0,
    total: Number(incomeRaw.total) || 0,
  };

  const lastRentalEarned = Number(raw?.lastRentalEarned) || 0;
  const lastRate = Number(raw?.lastRate) || 50;


  const pricingRaw = raw?.pricing || {};
  const pricing = {
    baseRate: Number(pricingRaw.baseRate) || (lastRate > 0 ? lastRate : 250) || 250, // ✅ жильё = 250
    minHours: clampNum(pricingRaw.minHours ?? 1, 1, 999),
    maxHours: clampNum(pricingRaw.maxHours ?? 10, 1, 999),
    stepHours: clampNum(pricingRaw.stepHours ?? 0, 0, 999),
    discountPerStep: clampNum(pricingRaw.discountPerStep ?? 0, 0, 999),
  };


  const history = Array.isArray(raw?.history) ? raw.history : [];
  const pinned = !!raw?.pinned;
  const priority = clampNum(raw?.priority ?? 0, 0, 10);
  const notifiedAt = raw?.notifiedAt ? Number(raw.notifiedAt) : null;

  const timerId =
    typeof raw?.timerId === "string"
      ? raw.timerId
      : typeof raw?.timer_id === "string"
        ? raw.timer_id
        : null;

  return {
    type: "home",
    id,
    name,
    status,
    rentalEndTime: Number.isFinite(rentalEndTime) ? rentalEndTime : null,
    income,
    lastRentalEarned,
    lastRate,
    pricing,
    history,
    pinned,
    priority,
    notifiedAt,
    timerId,
  };
}

function normalizeRental(raw) {
  return (raw?.type || "car") === "home" ? normalizeHome(raw) : normalizeCar(raw);
}

function makeUuid() {
  try {
    if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}



/* =========================
   COMPONENT
========================= */

export default function Rentals() {
  const API_BASE = useMemo(() => (typeof getApiBase === "function" ? getApiBase() : ""), []);

  const [characterId, setCharacterId] = useState(null);


// keep character in sync with Settings/topbar switcher
useEffect(() => {
  const onChar = (e) => {
    const id = String(e?.detail || "");
    if (!id) return;
    setCharacterId(id);
    hydratedRef.current = false;
    setRentals([]);
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

  const [now, setNow] = useState(Date.now());

  const [tier, setTier] = useState("FREE"); // FREE | VIP | GOLD | ADMIN | PROMO
  const isAdmin = tier === "ADMIN";
  const isGold = tier === "GOLD" || isAdmin;
  const isVip = tier === "VIP" || isGold;
  const canPro = tier !== "FREE";
  const canHousing = isVip; // VIP / GOLD / ADMIN

  const [rentType, setRentType] = useState("car"); // car | home
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (!canHousing && rentType === "home") setRentType("car");
  }, [canHousing, rentType]);
  const rentLabel = rentType === "car" ? "Авто" : "Дом/квартира";
  const addLabel = rentType === "car" ? "Добавить авто" : "Добавить жильё";

  const [tgEnabled, setTgEnabled] = useState(() => false);

  const [rentals, setRentals] = useState(() => ([]));

  const hydratedRef = useRef(false);

  // Load TG enabled from DB
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!API_BASE || !characterId) return;
        const token = localStorage.getItem("auth_token");
        if (!token) return;
        const r = await fetch(`${API_BASE}/settings/telegram`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json().catch(() => ({}));
        if (!mounted) return;
        if (j && typeof j.tg_enabled === "boolean") setTgEnabled(!!j.tg_enabled);
      } catch {}
    })();
    return () => { mounted = false; };
  }, [API_BASE]);


  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [rentModalCar, setRentModalCar] = useState(null);
  const [infoCar, setInfoCar] = useState(null);

  /* =========================
     TIMER TICK
  ========================= */

  useEffect(() => {
    if (isAddModalOpen || rentModalCar || infoCar || confirmDelete) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isAddModalOpen, rentModalCar, infoCar, confirmDelete]);



  /* =========================
     ROLE CHECK (каждые 10 сек)
     — как ты просил
  ========================= */

  useEffect(() => {
    let mounted = true;

    const computeTier = (data) => {
      const role = String(data?.role || data?.user?.role || "").toLowerCase();

      const isAdminRole = role === "admin" || role === "owner" || role === "superadmin" || role === "staff";

      const vipUntilRaw = data?.vip_until || data?.vipUntil || data?.vip_till || null;
      const promoUntilRaw = data?.promo_until || data?.promoUntil || data?.promo_till || null;
      const goldUntilRaw = data?.gold_until || data?.goldUntil || data?.gold_till || null;

      const vipUntil = vipUntilRaw ? new Date(vipUntilRaw) : null;
      const promoUntil = promoUntilRaw ? new Date(promoUntilRaw) : null;
      const goldUntil = goldUntilRaw ? new Date(goldUntilRaw) : null;

      const vipByDate = vipUntil && !Number.isNaN(vipUntil.getTime()) ? vipUntil.getTime() > Date.now() : false;
      const promoByDate = promoUntil && !Number.isNaN(promoUntil.getTime()) ? promoUntil.getTime() > Date.now() : false;
      const goldByDate = goldUntil && !Number.isNaN(goldUntil.getTime()) ? goldUntil.getTime() > Date.now() : false;

      const isGold = isAdminRole || role === "gold" || role === "gold_vip" || !!data?.gold_active || goldByDate;
      const isVip = isAdminRole || isGold || role === "vip" || !!data?.vip_active || vipByDate;
      const isPromo = isAdminRole || role === "promo" || !!data?.promo_active || promoByDate;

      return isAdminRole ? "ADMIN" : isGold ? "GOLD" : isVip ? "VIP" : isPromo ? "PROMO" : "FREE";
    };

    const load = async () => {
      try {
        const me = await fetchMe();
        if (!mounted) return;
        setTier(computeTier(me));
      } catch {
        if (!mounted) return;
        setTier("FREE");
      }
    };

    load();
    const t = setInterval(load, 10000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  /* =========================
     LOAD/SAVE RENTALS (DB via /state)
  ========================= */

  // Load rentals from DB
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!API_BASE || !characterId) return;
        const token = localStorage.getItem("auth_token");
        if (!token) return;
        const r = await fetch(`${API_BASE}/cstate/${characterId}/rentals_v5`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json().catch(() => ({}));
        if (!mounted) return;
        const v = j?.value;
        if (Array.isArray(v)) {
          setRentals(v.map(normalizeRental));
        }
      } catch {}
      hydratedRef.current = true;
    })();
    return () => { mounted = false; };
  }, [API_BASE, characterId]);

  // Save rentals to DB (debounced)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!API_BASE || !characterId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    const t = setTimeout(() => {
      fetch(`${API_BASE}/cstate/${characterId}/rentals_v5`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: rentals || [] }),
      }).catch(() => {});
    }, 700);

    return () => clearTimeout(t);
  }, [API_BASE, characterId, rentals]);


  /* =========================
     TG: only VIP/GOLD/ADMIN
  ========================= */

  useEffect(() => {
    // если пользователь потерял доступ — выключаем переключатель
    if (!canPro && tgEnabled) {
      setTgEnabled(false);

    }
  }, [canPro]); // eslint-disable-line

  const toggleTg = () => {
    if (!canPro) return;
    setTgEnabled((v) => {
      const next = !v;


      // ✅ сохраняем переключатель на сервере,
      // чтобы backend-watcher реально знал, можно ли слать TG
      (async () => {
        try {
          if (!API_BASE || !characterId) return;
          const token = localStorage.getItem("auth_token");
          if (!token) return;
          await fetch(`${API_BASE}/settings/telegram`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ tg_notify_enabled: next }),
          });
        } catch { }
      })();

      return next;
    });
  };

  // on mount: sync tg setting from server (so it matches watcher)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!API_BASE || !characterId) return;
        const token = localStorage.getItem("auth_token");
        if (!token) return;
        const res = await fetch(`${API_BASE}/settings/telegram`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const js = await res.json().catch(() => null);
        if (!mounted || !js) return;
        const serverEnabled = js?.tg_notify_enabled !== false;
        setTgEnabled(serverEnabled);
      } catch { }
    })();
    return () => {
      mounted = false;
    };
  }, [API_BASE]);

  /* =========================
     AUTO FINISH + TG NOTIFY
  ========================= */

  useEffect(() => {
    setRentals((prev) => {
      let changed = false;
      const next = prev.map((car) => {
        if (car.status !== "active" || !car.rentalEndTime) return car;
        if (car.rentalEndTime <= now) {
          changed = true;
          return { ...car, status: "available", rentalEndTime: null };
        }
        return car;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);


  /* =========================
     SORT + TOP WEEK
  ========================= */


  const visibleRentals = useMemo(() => rentals.filter((r) => (r?.type || "car") === rentType), [rentals, rentType]);

  const topWeekId = useMemo(() => {
    let best = null;
    for (const c of visibleRentals) {
      const v = Number(c?.income?.week) || 0;
      if (!best || v > best.v) best = { id: c.id, v };
    }
    return best?.id ?? null;
  }, [visibleRentals]);

  const sortedRentals = useMemo(() => {
    const copy = [...visibleRentals];
    copy.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), "ru");
    });
    return copy;
  }, [visibleRentals]);

  /* =========================
     ACTIONS
  ========================= */

  const handleAddItem = (e) => {
    e.preventDefault();

    // LIMIT: FREE can add максимум 1 авто
    if (tier === "FREE" && rentType === "car") {
      const carsCount = rentals.filter((r) => (r?.type || "car") === "car").length;
      if (carsCount >= 1) {
        alert("FREE аккаунт: можно добавить максимум 1 авто. VIP / GOLD / ADMIN — без лимита.");
        return;
      }
    }
    const fd = new FormData(e.target);

    const name = String(fd.get("name") || "").trim();
    const plateOrAddressRaw = String(fd.get("plate") || "").trim();

    const newItem =
      rentType === "home"
        ? normalizeHome({
          id: Date.now(),
          name,
          status: "available",
          rentalEndTime: null,
          income: { week: 0, month: 0, total: 0 },
          lastRentalEarned: 0,
          lastRate: 50,
          pricing: { baseRate: 250, minHours: 1, maxHours: 10, stepHours: 0, discountPerStep: 0 },
          history: [],
          pinned: false,
          priority: 0,
          notifiedAt: null,
        })
        : normalizeCar({
          id: Date.now(),
          name,
          plate: plateOrAddressRaw || "Без номера",
          status: "available",
          rentalEndTime: null,
          income: { week: 0, month: 0, total: 0 },
          lastRentalEarned: 0,
          lastRate: 250,
          pricing: { baseRate: 250, stepHours: 0, discountPerStep: 0 },
          history: [],
          pinned: false,
          priority: 0,
          notifiedAt: null,
        });

    setRentals((prev) => [...prev, newItem]);
    setIsAddModalOpen(false);
    e.target.reset?.();
  };

  const handleDeleteCar = (car) => {
    setConfirmDelete({
      id: car.id,
      name: car.name,
      type: car.type,
    });
  };


  const togglePinned = (id) => {
    setRentals((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  };

  const changePriority = (id, delta) => {
    setRentals((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = clampNum((c.priority || 0) + delta, 0, 10);
        return { ...c, priority: next };
      })
    );
  };

  /* =========================
     SERVER TIMERS (for rental-end TG)
     We store rental end as a normal server timer, so backend watcher can notify
     even when the app is closed.
  ========================= */

  const apiUpsertTimer = async ({ id, label, endAt }) => {
    try {
      if (!API_BASE) return false;
      const token = localStorage.getItem("auth_token");
      if (!token) return false;
      const res = await fetch(`${API_BASE}/timers/upsert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id,
          label,
          endAt,
          fired: false,
          notified: false,
          running: true,
        }),
      });
      return !!res.ok;
    } catch {
      return false;
    }
  };

  const apiDeleteTimer = async (id) => {
    try {
      if (!API_BASE) return false;
      const token = localStorage.getItem("auth_token");
      if (!token) return false;
      const res = await fetch(`${API_BASE}/timers/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      return !!res.ok;
    } catch {
      return false;
    }
  };

  const stopRent = (id) => {
    let timerIdToCancel = null;
    setRentals((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        timerIdToCancel = c.timerId || null;
        return { ...c, status: "available", rentalEndTime: null, notifiedAt: null, timerId: null };
      })
    );
    if (timerIdToCancel) apiDeleteTimer(timerIdToCancel);
  };

  const startRent = ({ id, baseRate, durationValue, durationUnit, pricing }) => {
    const dv = Number(durationValue) || 0;
    if (dv <= 0) {
      alert("Введите корректное время (больше нуля).");
      return;
    }

    let durMs = 0;
    if (durationUnit === "days") durMs = dv * 86400000;
    else if (durationUnit === "sec") durMs = dv * 1000;
    else if (durationUnit === "min") durMs = dv * 60 * 1000;
    else durMs = dv * 60 * 60 * 1000;

    const endAt = Date.now() + durMs;

    // prepare server timer id (stable uuid)
    const existing = rentals.find((x) => x.id === id);
    const timerId = existing?.timerId || makeUuid();

    // create/refresh server timer so backend can notify even if app is closed
    // (server will check tg_notify_enabled itself)
    const endAtIso = new Date(endAt).toISOString();
    const extra = existing?.type === "home" ? "" : existing?.plate;
    const serverLabel = `Аренда: ${existing?.name || id}${extra ? ` (${extra})` : ""}`;
    apiUpsertTimer({ id: timerId, label: serverLabel, endAt: endAtIso });

    // hours for discount calc
    const hours = durationUnit === "days" ? dv * 24 : durMs / 3600000;

    const cfg = pricing || existing?.pricing || {};
    const br = Number(baseRate) || Number(cfg.baseRate) || 0;

    if (br <= 0) {
      alert("Введите корректную цену (больше нуля).");
      return;
    }

    const { effectiveRate, steps, discountPerHour } = calcDiscountedRate({
      baseRate: br,
      hours,
      stepHours: cfg.stepHours,
      discountPerStep: cfg.discountPerStep,
    });

    // стоимость: авто = $/час * часы (со скидкой), жильё = $/день * дни
    const total =
      durationUnit === "days" ? Math.round(br * dv) : Math.round(effectiveRate * hours);

    setRentals((prev) =>
      prev.map((car) => {
        if (car.id !== id) return car;

        const entry = {
          startAt: Date.now(),
          endAt,
          baseRate: br,
          rate: effectiveRate,
          hours,
          discountSteps: steps,
          discountPerHour,
          pricing: { ...cfg, baseRate: br },
          total,
        };

        return {
          ...car,
          status: "active",
          rentalEndTime: endAt,
          notifiedAt: null,
          timerId,
          lastRate: br,
          pricing: { ...(car.pricing || {}), ...cfg, baseRate: br },
          lastRentalEarned: total,
          history: [entry, ...(Array.isArray(car.history) ? car.history : [])].slice(0, 200),
          income: {
            week: (car.income.week || 0) + total,
            month: (car.income.month || 0) + total,
            total: (car.income.total || 0) + total,
          },
        };
      })
    );
  };


  /* =========================
     UI
  ========================= */

  return (
    <div className="relative h-full w-full max-w-6xl mx-auto overflow-hidden text-gray-200 px-4 py-4 font-sans flex flex-col">
      <style>{`
        .custom-page-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-page-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-page-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); border-radius: 999px; }
        .custom-page-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.55); }
      `}</style>
      {/* HEADER */}
      <div className="shrink-0 flex justify-between items-end mb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Аренда</h1>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>Роль:</span>
            <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-gray-200 text-xs">
              {tier}
            </span>

            <div className="ml-2 inline-flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
              <button
                onClick={() => setRentType("car")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${rentType === "car"
                  ? "bg-indigo-500/15 text-indigo-200 border border-indigo-500/20"
                  : "text-gray-400 hover:text-gray-200"
                  }`}
                title="Показать аренду авто"
              >
                🚗 Авто
              </button>
              <button
                onClick={() => {
                  if (!canHousing) return;
                  setRentType("home");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${rentType === "home"
                  ? "bg-indigo-500/15 text-indigo-200 border border-indigo-500/20"
                  : !canHousing
                    ? "text-gray-600 cursor-not-allowed opacity-60"
                    : "text-gray-400 hover:text-gray-200"
                  }`}
                title={canHousing ? "Показать аренду жилья" : "Жильё доступно только VIP / GOLD / ADMIN"}
              >
                <span className="inline-flex items-center gap-1">
                  🏠 Жильё {!canHousing && <Lock size={12} className="opacity-80" />}
                </span>
              </button>
            </div>
            <span className="text-gray-500">•</span>
            <span className="text-gray-500">{rentLabel}: {visibleRentals.length} • Всего: {rentals.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* TG toggle only PRO */}
          {canPro && (
            <button
              onClick={toggleTg}
              className={`px-3 py-2 rounded-xl border transition flex items-center gap-2 ${tgEnabled
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                }`}
              title="Telegram уведомления (VIP/GOLD/ADMIN)"
            >
              <Send size={16} />
              <span className="text-sm">{tgEnabled ? "ON" : "OFF"}</span>
            </button>
          )}

          {!canPro && (
            <div className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs text-gray-400">
              TG уведомления: <span className="text-gray-200">VIP/GOLD</span>
            </div>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
          >
            <Plus size={18} />
            <span>{addLabel}</span>
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 min-h-0 overflow-auto custom-page-scroll">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
              <th className="p-5 font-medium">{rentType === "car" ? "Автомобиль" : "Жильё"}</th>
              <th className="p-5 font-medium">Статус</th>
              <th className="p-5 font-medium">Таймер</th>
              <th className="p-5 font-medium text-right">Заработано</th>
              <th className="p-5 font-medium text-center">Действия</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {sortedRentals.map((car) => {
              const timeLeft = car.status === "active" ? formatTimeLeft(car.rentalEndTime, now) : "—";
              const isExpired = car.status === "active" && car.rentalEndTime && car.rentalEndTime <= now;
              const isTopWeek = car.id === topWeekId && (Number(car?.income?.week) || 0) > 0;

              return (
                <tr key={car.id} className="hover:bg-gray-800/30 transition-colors group">
                  {/* car */}
                  <td className="p-5">
                    <div className="flex items-center gap-4 min-w-[280px]">
                      {/* logo */}
                      <div className="w-10 h-10 flex items-center justify-center">
                        {car.type === "home" ? (
                          <Home size={26} className="text-gray-400" />
                        ) : car.brand ? (
                          <div className="w-10 h-10 flex items-center justify-center">
                            {car.type === "home" ? (
                              <Home size={26} className="text-gray-400" />
                            ) : car.brand ? (
                              <div className="w-8 h-8">
                                <img
                                  src={getBrandLogoUrl(car.brand)}
                                  alt={car.brand}
                                  className="w-8 h-8 object-contain"
                                  draggable={false}
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    const fb = e.currentTarget.nextElementSibling;
                                    if (fb) fb.style.display = "block";
                                  }}
                                />
                                <span style={{ display: "none" }}>
                                  <Car size={26} className="text-gray-400" />
                                </span>
                              </div>
                            ) : (
                              <Car size={26} className="text-gray-400" />
                            )}
                          </div>

                        ) : (
                          <Car size={26} className="text-gray-400" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-white font-medium text-sm truncate">{car.name}</div>

                          {car.pinned && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full border border-indigo-500/25 bg-indigo-500/10 text-indigo-300">
                              PIN
                            </span>
                          )}
                          {isTopWeek && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-300">
                              TOP WEEK
                            </span>
                          )}
                          {car.priority > 0 && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full border border-white/10 bg-white/5 text-gray-200">
                              P{car.priority}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-gray-500 truncate">
                          {car.type === "home" ? "—" : car.plate}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* status */}
                  <td className="p-5">
                    <div className="flex items-center">
                      {car.status === "active" ? (
                        <span className="px-3 py-1 rounded-full text-xs font-medium border bg-indigo-500/10 text-indigo-300 border-indigo-500/20">
                          В аренде
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Свободна
                        </span>
                      )}
                    </div>
                  </td>

                  {/* timer */}
                  <td className="p-5">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className={car.status === "active" ? "text-indigo-300" : "text-gray-500"} />
                      <span
                        className={`text-sm font-semibold tabular-nums ${isExpired ? "text-red-400" : car.status === "active" ? "text-white" : "text-gray-500"
                          }`}
                      >
                        {car.status === "active" ? timeLeft : "—"}
                      </span>
                    </div>
                  </td>

                  {/* earned + info */}
                  <td className="p-5 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <span className="font-bold text-white">{formatMoney(car.lastRentalEarned || 0)}</span>

                      <button
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Статистика + график + прогноз (VIP/GOLD)"
                        onClick={() => setInfoCar(car)}
                      >
                        <Info size={16} />
                      </button>
                    </div>
                  </td>

                  {/* actions */}
                  <td className="p-5">
                    <div className="flex justify-center items-center gap-2">
                      <button
                        onClick={() => togglePinned(car.id)}
                        className={`p-2 rounded-lg border transition ${car.pinned
                          ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
                          : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                          }`}
                        title="Закрепить"
                      >
                        <Pin size={16} />
                      </button>

                      {/* priority up/down */}
                      <button
                        onClick={() => changePriority(car.id, +1)}
                        className="p-2 rounded-lg border bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 transition"
                        title="Приоритет +"
                      >
                        <ArrowUp size={16} />
                      </button>

                      <button
                        onClick={() => changePriority(car.id, -1)}
                        className="p-2 rounded-lg border bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 transition"
                        title="Приоритет -"
                      >
                        <ArrowDown size={16} />
                      </button>

                      {car.status === "available" ? (
                        <>
                          <button
                            onClick={() => setRentModalCar(car)}
                            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition-all shadow-lg shadow-indigo-500/10"
                          >
                            Сдать
                          </button>

                          <button
                            onClick={() => handleDeleteCar(car)}
                            className="
    p-2 rounded-xl
    border border-red-500/20
    bg-red-500/5
    text-red-400
    hover:bg-red-500/15
    hover:text-red-300
    hover:shadow-lg hover:shadow-red-500/20
    transition-all
  "
                            title="Удалить"
                          >
                            <Trash2 size={16} />
                          </button>

                        </>
                      ) : (
                        <button
                          onClick={() => stopRent(car.id)}
                          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded-lg transition-all border border-gray-600"
                        >
                          Завершить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!sortedRentals.length && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-500">
                  {rentType === "car" ? "Машин нет." : "Объектов жилья нет."} Нажми <span className="text-gray-200 font-semibold">“{addLabel}”</span>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <ModalShell title={rentType === "car" ? "Новое авто" : "Новое жильё"} onClose={() => setIsAddModalOpen(false)}>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">{rentType === "car" ? "Название авто" : "Название объекта"}</label>
              <input
                required
                name="name"
                type="text"
                placeholder={rentType === "car" ? "BMW M5 F90" : "2BR Downtown / House #12"}
                className="w-full bg-[#0f1115] border border-gray-700 rounded-lg p-3 text-white focus:border-indigo-500 outline-none"
              />
              <div className="text-[11px] text-gray-500 mt-2">
                {rentType === "car" ? "Авто-лого по названию (бмв/беха/мерс/мерседес и т.д.)" : "Без адреса и GM (упрощённо)."}
              </div>
            </div>

            {rentType === "car" && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Гос. номер (опционально)</label>
                <input
                  name="plate"
                  type="text"
                  placeholder="Не указан"
                  className="w-full bg-[#0f1115] border border-gray-700 rounded-lg p-3 text-white focus:border-indigo-500 outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors"
            >
              Сохранить
            </button>
          </form>
        </ModalShell>
      )}

      {/* RENT MODAL */}
      {rentModalCar && (
        <RentModal
          tier={tier}
          car={rentModalCar}
          onClose={() => setRentModalCar(null)}
          onStart={(payload) => {
            startRent(payload);
            setRentModalCar(null);
          }}
        />
      )}

      {/* INFO MODAL */}
      {infoCar && (
        <IncomeModal
          tier={tier}
          car={infoCar}
          onClose={() => setInfoCar(null)}
        />
      )}
      {/* DELETE CONFIRM MODAL */}
      {confirmDelete && (
        <ModalShell title="Удаление" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <div className="text-sm text-gray-300">
              Ты реально хочешь удалить{" "}
              <span className="text-white font-semibold">«{confirmDelete.name}»</span>?
            </div>

            <div className="text-xs text-gray-500">
              Это действие <span className="text-red-400">нельзя отменить</span>.
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="
            flex-1 py-2 rounded-xl
            bg-white/5 border border-white/10
            text-gray-300 hover:bg-white/10
            transition
          "
              >
                Отмена
              </button>

              <button
                onClick={() => {
                  const item = rentals.find((r) => r.id === confirmDelete.id);
                  if (item?.timerId) apiDeleteTimer(item.timerId);

                  setRentals((prev) => prev.filter((r) => r.id !== confirmDelete.id));
                  setConfirmDelete(null);
                }}
                className="
            flex-1 py-2 rounded-xl
            bg-red-600/90 hover:bg-red-600
            text-white font-medium
            shadow-lg shadow-red-500/30
            transition-all
          "
              >
                Удалить
              </button>
            </div>
          </div>
        </ModalShell>
      )}

    </div>

  );
}

/* =========================
   UI PARTS
========================= */

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-[#181b21] border border-gray-700 rounded-2xl p-6 w-[460px] shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* =========================
   RENT MODAL
   - no renter field
   - ADMIN can pick sec/min
   - autopopulate price from lastRate
========================= */

function RentModal({ tier, car, onClose, onStart }) {
  const isAdmin = tier === "ADMIN";
  const isHome = (car?.type || "car") === "home";

  const cfg = car?.pricing || {};
  // Чтобы можно было стирать значение (не залипать на 0) — держим строки.
  // авто: $/час, жильё: $/день
  const initialBaseRate = Number(cfg.baseRate) || Number(car?.lastRate) || (isHome ? 250 : 50);
  const [baseRateStr, setBaseRateStr] = useState(String(initialBaseRate));

  // скидки (для авто)
  const [stepHoursStr, setStepHoursStr] = useState(String(cfg.stepHours ?? ""));
  const [discountPerStepStr, setDiscountPerStepStr] = useState(String(cfg.discountPerStep ?? ""));

  const stepHours = Number(stepHoursStr) || 0;
  const discountPerStep = Number(discountPerStepStr) || 0;



  // авто: hours/min/sec (мин/сек только ADMIN), жильё: days (всегда)
  const [unit, setUnit] = useState(isHome ? "days" : "hours"); // hours/min/sec/days
  const initialValue = isHome ? 1 : 1;
  const [valueStr, setValueStr] = useState(String(initialValue));

  useEffect(() => {
    if (isHome) {
      setUnit("days");
      return;
    }
    if (!isAdmin) setUnit("hours");
  }, [isAdmin, isHome]); // eslint-disable-line

  // Максимум: 99 часов (и эквиваленты для мин/сек)
  const maxForUnit = useMemo(() => {
    if (isHome) return 99;
    if (unit === "min") return 99 * 60;
    if (unit === "sec") return 99 * 3600;
    return 99; // hours
  }, [unit, isHome]);

  const parsePositiveNumber = (s) => {
    if (s === "" || s === null || s === undefined) return 0;
    const n = Number(String(s).replace(",", "."));
    if (!Number.isFinite(n)) return 0;
    return n;
  };

  const baseRate = useMemo(() => parsePositiveNumber(baseRateStr), [baseRateStr]);
  const value = useMemo(() => parsePositiveNumber(valueStr), [valueStr]);

  const calc = useMemo(() => {
    const r = Number(baseRate) || 0;
    const v = Math.min(Number(value) || 0, maxForUnit);
    if (r <= 0 || v <= 0) {
      return { total: 0, effectiveRate: r, steps: 0, discountPerHour: 0, hours: 0 };
    }

    if (isHome) {
      return { total: r * v, effectiveRate: r, steps: 0, discountPerHour: 0, hours: v * 24 };
    }

    const hours = unit === "hours" ? v : unit === "min" ? v / 60 : v / 3600;

    const { effectiveRate, steps, discountPerHour } = calcDiscountedRate({
      baseRate: r,
      hours,
      stepHours,
      discountPerStep,
    });

    return { total: effectiveRate * hours, effectiveRate, steps, discountPerHour, hours };
  }, [baseRate, value, unit, isHome, stepHours, discountPerStep, maxForUnit]);

  const priceLabel = isHome ? "$ / день" : "$ / час";
  const timeLabel = isHome ? "Дни" : "Время";

  return (
    <ModalShell title="Сдать в аренду" onClose={onClose}>
      <div className="text-xs text-gray-500 mb-4">
        {car.name} • последняя цена:{" "}
        <span className="text-white font-semibold">
          ${Number(car?.lastRate || 0)}/{isHome ? "день" : "час"}
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();

          const r = Number(baseRate) || 0;
          const v = Number(value) || 0;
          if (r <= 0) {
            alert("Введите корректную цену (больше нуля).");
            return;
          }
          if (v <= 0) {
            alert("Введите корректное время (больше нуля).");
            return;
          }

          // clamp по максимуму 99ч
          const clampedV = Math.min(v, maxForUnit);

          onStart({
            id: car.id,
            baseRate: r,
            durationValue: clampedV,
            durationUnit: isHome ? "days" : unit === "hours" ? "hours" : unit === "min" ? "min" : "sec",
            pricing: { baseRate: r, stepHours, discountPerStep },
          });
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{priceLabel}</label>
            <input
              type="number"
              min="1"
              inputMode="decimal"
              value={baseRateStr}
              onChange={(e) => setBaseRateStr(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full bg-[#0f1115] border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">{timeLabel}</label>
            <input
              type="number"
              min={isHome ? "1" : "1"}
              max={String(maxForUnit)}
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full bg-[#0f1115] border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
            />
            {!isHome && unit === "hours" && (
              <div className="text-[11px] text-gray-500 mt-2">Максимум: 99 часов</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-400">Ед:</div>

          {isHome ? (
            <div
              className="bg-[#0f1115] border border-gray-800 rounded-lg px-3 py-2 text-white outline-none text-sm opacity-80"
              title="Для жилья таймер считается в днях"
            >
              Дни
            </div>
          ) : (
            <>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={!isAdmin}
                className={`bg-[#0f1115] border rounded-lg px-3 py-2 text-white outline-none text-sm ${isAdmin ? "border-gray-700" : "border-gray-800 opacity-60 cursor-not-allowed"
                  }`}
                title={isAdmin ? "ADMIN может тестить сек/мин" : "Только ADMIN: сек/мин"}
              >
                <option value="hours">Часы</option>
                <option value="min">Минуты (ADMIN)</option>
                <option value="sec">Секунды (ADMIN)</option>
              </select>

              {!isAdmin && <div className="text-[11px] text-gray-500">сек/мин только ADMIN</div>}
            </>
          )}
        </div>

        {!isHome && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Шаг часов для скидки
                </label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={stepHoursStr}
                  onChange={(e) => setStepHoursStr(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full bg-[#0f1115] border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Скидка $/час за шаг
                </label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={discountPerStepStr}
                  onChange={(e) => setDiscountPerStepStr(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full bg-[#0f1115] border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="col-span-2 text-[11px] text-gray-500">
                0 = скидка отключена
              </div>
            </div>


            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-400">Фактическая ставка:</span>
                <span className="font-semibold">${Math.round(calc.effectiveRate)}/час</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-400">Скидка:</span>
                <span className="font-semibold">-${Math.round(calc.discountPerHour)} /час (шагов: {calc.steps})</span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-[#0f1115] border border-gray-700 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-400">
            <Calculator size={18} />
            <span className="text-sm">Итого:</span>
          </div>
          <span className="text-xl font-bold text-emerald-400">
            ${Math.round(Number(calc.total || 0)).toLocaleString()}
          </span>
        </div>

        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-xl transition-colors"
        >
          Запустить таймер
        </button>
      </form>
    </ModalShell>
  );
}

/* =========================
   INCOME MODAL
   - Better chart
   - Pro-only forecast + charts
========================= */

function IncomeModal({ tier, car, onClose }) {
  const isAdmin = tier === "ADMIN";
  const isGold = tier === "GOLD" || isAdmin;
  const isVip = tier === "VIP" || isGold;
  const canPro = tier !== "FREE";
  const [range, setRange] = useState("week"); // "week" | "month" | "year"


  const week = Number(car?.income?.week) || 0;
  const month = Number(car?.income?.month) || 0;
  const total = Number(car?.income?.total) || 0;

  const historyAll = useMemo(() => {
    if (!Array.isArray(car?.history)) return [];
    // было slice(0,30) — теперь берём всё
    return car.history.slice().reverse();
  }, [car]);

  const hasAnyHistory = historyAll.length > 0;

  // 1) возраст статистики (сколько дней с первой аренды)
  const firstTs = useMemo(() => {
    if (!historyAll.length) return null;
    let min = Infinity;
    for (const h of historyAll) {
      const t = Number(h?.startAt ?? h?.endAt ?? 0);
      if (Number.isFinite(t) && t > 0) min = Math.min(min, t);
    }
    return Number.isFinite(min) ? min : null;
  }, [historyAll]);

  const ageDays = useMemo(() => {
    if (!firstTs) return 0;
    return (Date.now() - firstTs) / 86400000;
  }, [firstTs]);

  // 2) правила “достаточно статистики”
  const rangeGate = useMemo(() => {
    if (!hasAnyHistory) return { ok: false, reason: "График пуст — аренды ещё не запускались." };

    if (range === "month" && ageDays < 7) {
      return { ok: false, reason: "Недостаточно статистики для месяца (нужно минимум 7 дней)." };
    }
    if (range === "year" && ageDays < 30) {
      return { ok: false, reason: "Недостаточно статистики для года (нужно минимум 30 дней)." };
    }

    return { ok: true, reason: "" };
  }, [hasAnyHistory, range, ageDays]);


  const rangeMs = useMemo(() => {
    if (range === "week") return 7 * 86400000;
    if (range === "month") return 30 * 86400000;
    return 365 * 86400000; // year
  }, [range]);

  const cutoff = useMemo(() => Date.now() - rangeMs, [rangeMs]);

  const srcForRange = useMemo(() => {
    if (!hasAnyHistory) return [];
    return historyAll.filter((h) => {
      const t = Number(h?.endAt ?? h?.startAt ?? 0);
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [historyAll, hasAnyHistory, cutoff]);


  const hasAnyValueInRange = useMemo(() => {
    // считаем “есть статистика”, если хотя бы 1 запись дала total > 0
    return srcForRange.some((h) => (Number(h?.total) || 0) > 0);
  }, [srcForRange]);

  const emptyReason = useMemo(() => {
    if (!hasAnyHistory) return "График пуст — аренды ещё не запускались.";
    if (!srcForRange.length) return "Нет данных за выбранный период.";
    if (!hasAnyValueInRange) {
      // можно точнее под period
      return range === "month"
        ? "Нет статистики за последние 30 дней."
        : range === "year"
          ? "Нет статистики за год."
          : "Нет статистики за неделю.";
    }
    return "";
  }, [hasAnyHistory, srcForRange.length, hasAnyValueInRange, range]);


  // для среднего — оставим последние 30 (как было по смыслу)
  const history = useMemo(() => historyAll.slice(-30), [historyAll]);

  const avgRate = useMemo(() => {
    if (!history.length) return Number(car?.lastRate) || 50;
    let s = 0;
    let c = 0;
    for (const h of history) {
      const r = Number(h?.rate);
      if (Number.isFinite(r) && r > 0) {
        s += r;
        c += 1;
      }
    }
    return c ? Math.round(s / c) : (Number(car?.lastRate) || 50);
  }, [history, car]);

  // Прогноз показываем только если уже была хотя бы 1 аренда.
  const forecast = useMemo(() => {
    if (!hasAnyHistory) return null;
    const hoursPerDay = 6;
    const day = avgRate * hoursPerDay;
    return {
      day,
      week: day * 7,
      month: day * 30,
      hoursPerDay,
    };
  }, [avgRate, hasAnyHistory]);

  // dataset for chart from history totals
  const points = useMemo(() => {
    if (!srcForRange.length) return [];
    return srcForRange.map((h, i) => ({
      label: String(i + 1),
      value: Math.max(0, Number(h?.total) || 0),
    }));
  }, [srcForRange]);

  const hasAnyPointValue = useMemo(() => {
    return points.some((p) => Number(p?.value || 0) > 0);
  }, [points]);




  return (
    <ModalShell title="Статистика" onClose={onClose}>
      <div className="text-xs text-gray-500 mb-4">{car.name}</div>

      {/* Always show quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard label="Неделя" value={formatMoney(week)} />
        <StatCard label="Месяц" value={formatMoney(month)} />
        <StatCard label="Всё время" value={formatMoney(total)} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
        ].map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setRange(b.key)}
            className={[
              "rounded-xl border px-4 py-4 text-center transition",
              "bg-[#0f1115] border-white/10 hover:bg-white/5",
              range === b.key ? "ring-2 ring-indigo-500/40 border-indigo-500/30" : "",
            ].join(" ")}
          >
            <div className="text-white font-semibold">{b.label}</div>
            <div className="text-xs text-gray-500 mt-1">{b.sub}</div>
          </button>
        ))}
      </div>


      {!canPro ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-gray-300">
          График + прогноз доступны только для <span className="text-white font-semibold">VIP / GOLD</span>.
        </div>
      ) : (
        <>
          {/* Better chart */}
          {/* Better chart */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-400">График дохода</div>

              {/* маленький сегмент (можешь удалить) */}
              <div className="flex rounded-lg border border-white/10 bg-black/20 p-1">
                {[
                  { key: "week", label: "Неделя" },
                  { key: "month", label: "Месяц" },
                  { key: "year", label: "Год" },
                ].map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setRange(b.key)}
                    className={[
                      "px-3 py-1 text-xs rounded-md transition",
                      range === b.key ? "bg-white text-black" : "text-gray-300 hover:bg-white/10",
                    ].join(" ")}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[320px]">
              {rangeGate.ok && points.length > 0 && hasAnyValueInRange ? (
                <ProChartRecharts points={points} />
              ) : (
                <EmptyChart text={rangeGate.ok ? emptyReason : rangeGate.reason} />
              )}
            </div>


          </div>


          {/* Forecast */}
          {!forecast ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2 text-sm text-gray-300">
              Прогноз появится после первой аренды.
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mt-2">
              <div className="text-xs text-emerald-200/80">
                Прогноз (средняя ставка ${avgRate}/час)
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <StatMini label={`в день (${forecast.hoursPerDay}ч)`} value={formatMoney(forecast.day)} />
                <StatMini label="в неделю" value={formatMoney(forecast.week)} />
                <StatMini label="в месяц" value={formatMoney(forecast.month)} />
              </div>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

function EmptyChart({ text }) {
  return (
    <div className="h-full w-full flex items-center justify-center rounded-xl border border-white/10 bg-black/20">
      <div className="text-center px-6">
        <div className="text-white font-semibold">Нет статистики</div>
        <div className="text-xs text-gray-400 mt-1">{text}</div>
      </div>
    </div>
  );
}


function StatCard({ label, value }) {
  return (
    <div className="bg-[#0f1115] border border-gray-700 rounded-xl p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-white font-bold mt-1">{value}</div>
    </div>
  );
}

function StatMini({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-emerald-200/70">{label}</div>
      <div className="text-white font-bold">{value}</div>
    </div>
  );
}

/* =========================
   PRO CHART (SVG)
   - Bars + trend line
   - Labels min/max
========================= */
function ProChartRecharts({ points }) {
  const safe = Array.isArray(points) && points.length ? points : [{ label: "1", value: 0 }];
  const [hover, setHover] = React.useState(null);

  const Dot = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;

    const value = Number(payload?.value || 0);
    const label = payload?.label ?? "";

    return (
      <circle
        cx={cx}
        cy={cy}
        r={hover?.label === label ? 6 : 3}
        fill="white"
        opacity={hover?.label === label ? 0.95 : 0.7}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHover({ cx, cy, label, value })}
        onMouseLeave={() => setHover(null)}
      />
    );
  };

  return (
    <div className="h-full w-full relative">
      {/* tooltip только при наведении на точку */}
      {hover && (
        <div
          style={{
            position: "absolute",
            left: hover.cx,
            top: hover.cy,
            transform: "translate(-50%, -120%)",
            background: "#0f1115",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: "10px 12px",
            color: "white",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ opacity: 0.7, fontSize: 12 }}>{hover.label}</div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>
            Доход: ${hover.value.toLocaleString()}
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={safe} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
            axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
            axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
            tickLine={false}
            width={34}
          />

          {/* ✅ УБРАЛИ <Tooltip /> полностью */}

          <Line
            type="natural"
            dataKey="value"
            stroke="rgba(99,102,241,0.95)"
            strokeWidth={2.2}
            dot={<Dot />}
            activeDot={false}  // чтобы Recharts сам не делал "активную" точку по курсору
            isAnimationActive
            animationDuration={450}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}