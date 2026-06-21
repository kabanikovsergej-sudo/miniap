import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search, Check, Plus, Minus, RotateCcw, Eye, EyeOff, Star, StarOff, Lock, Cog } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { fetchMe, getApiBase } from "@/lib/auth";
import { ensureAnalyticsSession, trackFarmSession, trackTodayProgress, resetTodayProgressGraph } from "@/lib/analytics";


/* -------------------------------------------------------------------------- */
/* DATA & CONFIG                                                              */
/* -------------------------------------------------------------------------- */


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

const LS_KEYS = {
  STATE: "bp_state_v5_premium",
  HISTORY: "bp_history_v4",
  PREFS: "bp_prefs_v1",
};

const REPEATABLE_ID = "актуальные_для_всех_3_часа_в_онлайне_можно_выполнять_многократно_за_день";
const MAX_HOURS = 12;

const TASKS_DATA = [
  // ★ Самое первое: онлайн (повторяемое)
  { id: "актуальные_для_всех_3_часа_в_онлайне_можно_выполнять_многократно_за_день", title: "3 часа в онлайне (можно многократно)", group: "Актуальные для всех", bpBase: 2, bpPlat: 4, repeatable: true },

  /* ========================= НОВОЕ (c 20.10.2025) ========================= */

  // Мини / Social
  { id: "new_visit_site", title: "Посетить любой сайт в браузере", group: "Новое: Мини", bpBase: 1, bpPlat: 2 },
  { id: "new_brawl_channel", title: "Зайти в любой канал в Brawl", group: "Новое: Мини", bpBase: 1, bpPlat: 2 },
  { id: "new_match_like", title: "Поставить лайк любой анкете в Match", group: "Новое: Мини", bpBase: 1, bpPlat: 2 },

  // DP / Casino
  { id: "new_dp_case_spin", title: "Прокрутить за DP серебряный/золотой/driver кейс", group: "Новое: Казино", bpBase: 10, bpPlat: 20 },
  { id: "new_casino_interserver_wheel_bet", title: "Ставка в колесе удачи в казино (межсерверное колесо)", group: "Новое: Казино", bpBase: 3, bpPlat: 6 },
  { id: "new_casino_mafia", title: "Сыграть в мафию в казино", group: "Новое: Казино", bpBase: 3, bpPlat: 6 },

  // Pet
  { id: "new_pet_ball_15", title: "Кинуть мяч питомцу 15 раз", group: "Новое: Питомец", bpBase: 2, bpPlat: 4 },
  { id: "new_pet_commands_15", title: "15 выполненных питомцем команд", group: "Новое: Питомец", bpBase: 2, bpPlat: 4 },

  // Transport
  { id: "new_metro_1_station", title: "Проехать 1 станцию на метро", group: "Новое: Транспорт", bpBase: 2, bpPlat: 4 },

  // Farm / Clubs
  { id: "new_fish_20", title: "Поймать 20 рыб", group: "Новое: Фарм", bpBase: 4, bpPlat: 8 },
  { id: "new_clubs_2_quests", title: "Выполнить 2 квеста любых клубов", group: "Новое: Клубы", bpBase: 4, bpPlat: 8 },

  // Auto service
  { id: "new_autoservice_fix_part", title: "Починить деталь в автосервисе", group: "Новое: Автосервис", bpBase: 1, bpPlat: 2 },

  // Sport / Mini-games
  { id: "new_sport_basketball_2", title: "Забросить 2 мяча в баскетболе", group: "Новое: Спорт", bpBase: 1, bpPlat: 2 },
  { id: "new_sport_football_2", title: "Забить 2 гола в футболе", group: "Новое: Спорт", bpBase: 1, bpPlat: 2 },
  { id: "new_sport_armwrestling_win", title: "Победить в армрестлинге", group: "Новое: Спорт", bpBase: 1, bpPlat: 2 },
  { id: "new_sport_darts_win", title: "Победить в дартс", group: "Новое: Спорт", bpBase: 1, bpPlat: 2 },
  { id: "new_sport_volleyball_1m", title: "Поиграть 1 минуту в волейбол", group: "Новое: Спорт", bpBase: 1, bpPlat: 2 },
  { id: "new_sport_table_tennis_1m", title: "Поиграть 1 минуту в настольный теннис", group: "Новое: Спорт", bpBase: 1, bpPlat: 2 },
  { id: "new_sport_tennis_1m", title: "Поиграть 1 минуту в большой теннис", group: "Новое: Спорт", bpBase: 1, bpPlat: 2 },

  // Finance
  { id: "new_leasing_payment", title: "Сделать платеж по лизингу", group: "Новое: Финансы", bpBase: 1, bpPlat: 2 },

  // Weed / Lab / Airdrops
  { id: "new_greenhouse_plant", title: "Посадить траву в теплице", group: "Новое: Криминал", bpBase: 4, bpPlat: 8 },
  { id: "new_lab_painkillers", title: "Запустить переработку обезболивающих в лаборатории", group: "Новое: Криминал", bpBase: 4, bpPlat: 8 },
  { id: "new_airdrops_2", title: "Принять участие в двух аирдропах", group: "Новое: Криминал", bpBase: 4, bpPlat: 8 },

  /* ======================= 🚓 ФРАКЦИОННЫЕ СПОСОБЫ ======================== */

  { id: "frac_graffiti_7", title: "7 закрашенных граффити", group: "Фракции", bpBase: 1, bpPlat: 2 },
  { id: "frac_contraband_5", title: "Сдать 5 контрабанды", group: "Фракции", bpBase: 2, bpPlat: 4 },
  { id: "frac_war_participation", title: "Участие в каптах/бизварах", group: "Фракции", bpBase: 1, bpPlat: 2 },
  { id: "frac_vzh_hummer", title: "Сдать Хаммер с ВЗХ", group: "Фракции", bpBase: 3, bpPlat: 6 },
  { id: "frac_ems_medcards_5", title: "5 выданных медкарт в EMS", group: "Фракции: EMS", bpBase: 2, bpPlat: 4 },
  { id: "frac_ems_calls_15", title: "Закрыть 15 вызовов в EMS", group: "Фракции: EMS", bpBase: 2, bpPlat: 4 },
  { id: "frac_wn_ads_40", title: "Отредактировать 40 объявлений в WN", group: "Фракции: WN", bpBase: 2, bpPlat: 4 },
  { id: "frac_locks_15", title: "Взломать 15 замков (дома/автоугоны)", group: "Фракции", bpBase: 2, bpPlat: 4 },
  { id: "frac_codes_5", title: "Закрыть 5 кодов в силовых структурах", group: "Фракции", bpBase: 2, bpPlat: 4 },
  { id: "frac_lspd_register_2", title: "Поставить на учет 2 автомобиля (LSPD)", group: "Фракции: LSPD", bpBase: 1, bpPlat: 2 },
  { id: "frac_kpz_arrest_1", title: "Произвести 1 арест в КПЗ", group: "Фракции", bpBase: 1, bpPlat: 2 },
  { id: "frac_kpz_buyout_2", title: "Выкупить двух человек из КПЗ", group: "Фракции", bpBase: 2, bpPlat: 4 },

  /* =================== 👍 АКТУАЛЬНЫЕ ДЛЯ ВСЕХ (повторяемые) =============== */

  { id: "all_casino_zeros", title: "Нули в казино", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_construction_25", title: "25 действий на стройке", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_port_25", title: "25 действий в порту", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_mine_25", title: "25 действий в шахте", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_dancebattles_3", title: "3 победы в Дэнс Баттлах", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_business_materials_order", title: "Заказ материалов для бизнеса вручную (вкл/выкл)", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_gym_20", title: "20 подходов в тренажерном зале", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_range_training", title: "Успешная тренировка в тире", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_post_10", title: "10 посылок на почте", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_cinema_rent", title: "Арендовать киностудию", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_lottery_buy", title: "Купить лотерейный билет", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_karting_win", title: "Выиграть гонку в картинге", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_farm_10", title: "10 действий на ферме (коровы/пшеница и т.д.)", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_firefighter_25", title: "Потушить 25 \"огоньков\" пожарным", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_treasure_1", title: "Выкопать 1 сокровище (не мусор)", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_street_race_1", title: "Проехать 1 уличную гонку (ставка от 1000$)", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_trucker_3", title: "Выполнить 3 заказа дальнобойщиком", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_ems_surgery_2", title: "Два раза оплатить смену внешности у хирурга в EMS", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_cinema_add_5_videos", title: "Добавить 5 видео в кинотеатре", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_training_complex_win_5", title: "Выиграть 5 игр в тренировочном комплексе со ставкой (от 100$)", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_arena_win_3", title: "Выиграть 3 любых игры на арене со ставкой (от 100$)", group: "Актуальные для всех", bpBase: 1, bpPlat: 2 },
  { id: "all_busdriver_2_laps", title: "2 круга на любом маршруте автобусника", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
  { id: "all_animals_skin_5", title: "5 раз снять 100% шкуру с животных", group: "Актуальные для всех", bpBase: 2, bpPlat: 4 },
];

/* -------------------------------------------------------------------------- */
/* UTILS                                                                      */
/* -------------------------------------------------------------------------- */

const safeParse = (json) => { try { return JSON.parse(json); } catch { return null; } };
const ymdLocal = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};


const DEFAULT_PREFS = {
  // Which categories are visible/enabled for VIP (and apply to list filtering)
  catsEnabled: {
    "Фракционные": true,
    "Крайм": true,
    "Развлечения": true,
    "Работы": true,
    // custom cats will be added dynamically
  },
  // Custom user categories (VIP)
  customCats: [], // [{ id: "cat_xxx", name: "Моя категория" }]
  // Task category overrides (VIP). Value: category name OR "__AUTO__"
  taskCatOverride: {}, // { [taskId]: "Моя категория" | "Фракционные" | "__AUTO__" }
  defaultGroup: "Все",
};

const loadPrefs = () => DEFAULT_PREFS;

const taskCats = (t) => {
  const id = String(t?.id || "");

  // 1) Спец-задача "3 часа" — вне категорий
  if (id === REPEATABLE_ID) return []; // значит "не относится ни к одной вкладке"

  // 2) ФРАКЦИОННЫЕ (то что ты называл "Гос")
  const FRACTION_IDS = new Set([
    "frac_ems_medcards_5",
    "frac_ems_calls_15",
    "frac_wn_ads_40",
    "frac_codes_5",
    "frac_lspd_register_2",
    "frac_kpz_arrest_1",
    "frac_kpz_buyout_2",
  ]);

  // 3) КРАЙМ
  const CRIME_IDS = new Set([
    "frac_graffiti_7",
    "frac_contraband_5",
    "frac_war_participation",
    "frac_vzh_hummer",
    "frac_locks_15",
    "new_greenhouse_plant",
  ]);

  // 4) Аирдропы — ОДНО задание, ДВЕ вкладки
  if (id === "new_airdrops_2") return ["Крайм", "Фракционные"];

  if (FRACTION_IDS.has(id)) return ["Фракционные"];
  if (CRIME_IDS.has(id)) return ["Крайм"];

  // 5) РАБОТЫ (актуальные работы)
  const WORK_IDS = new Set([
    "all_construction_25",
    "all_port_25",
    "all_mine_25",
    "all_post_10",
    "all_farm_10",
    "all_firefighter_25",
    "all_trucker_3",
    "all_busdriver_2_laps",
  ]);
  if (WORK_IDS.has(id)) return ["Работы"];

  // Всё остальное — Развлечения (чтобы ничего не пропало по вкладкам)
  return ["Развлечения"];
};


const effectiveTaskCats = (t, prefs, isPrivileged) => {
  const id = String(t?.id || "");
  if (!isPrivileged) return taskCats(t);

  const ov = prefs?.taskCatOverride?.[id];
  if (!ov || ov === "__AUTO__") return taskCats(t);

  // online special stays outside tabs
  if (id === REPEATABLE_ID) return [];
  return [String(ov)];
};

const getAllCategoryNames = (prefs) => {
  const builtIn = ["Фракционные", "Крайм", "Развлечения", "Работы"];
  const custom = (prefs?.customCats || []).map((c) => c?.name).filter(Boolean);
  const uniq = Array.from(new Set([...builtIn, ...custom]));
  return uniq;
};


const sortTypeOfTask = (task) => {
  const title = String(task?.title || "").toLowerCase();
  const group = String(task?.group || "").toLowerCase();
  const isFraction = ["ems", "wn", "гос", "криминал", "фрак"].some((k) => group.includes(k));
  if (isFraction) return "fraction";
  const isPair = /(^|\s)2(\s|$)/.test(title) || title.includes("двух") || title.includes("два ") || title.includes("2 ");
  if (isPair) return "pair";
  const bp = Number(task?.bpBase || 0);
  if (bp <= 1) return "solo_easy";
  if (bp <= 2) return "solo_medium";
  return "solo_hard";
};

/* -------------------------------------------------------------------------- */
/* HOOKS                                                                      */
/* -------------------------------------------------------------------------- */

function useBPLogic() {
  const [state, setState] = useState(() => ({
    checked: {},
    qty: {},
    hidden: {},
    favorites: {},
    isPlat: false,
    serverX2: false,
    onlyUnchecked: false,
    activeGroup: "Все",
  }));


  const [history, setHistory] = useState(() => ({ byDay: {}, recentActions: [], actionStack: [], bpGainStack: [] }));


// ===== Progress graph for TODAY (tasks checked/qty) =====
useEffect(() => {
  try {
    // total = все задачи, которые не скрыты
    const total = TASKS_DATA.filter(t => !state.hidden?.[t.id]).length;

    // done = отмеченные + repeatable qty>0
    let done = 0;
    for (const t of TASKS_DATA) {
      if (state.hidden?.[t.id]) continue;
      if (state.checked?.[t.id]) { done++; continue; }
      if (t.repeatable && Number(state.qty?.[t.id] || 0) > 0) { done++; continue; }
    }

    trackTodayProgress(total, done, { maxPoints: 8, resetOnDrop: true, dropThresholdPct: 15 });
  } catch {}
}, [state.checked, state.qty, state.hidden]);


  const API_BASE = useMemo(() => {
    try {
      return typeof getApiBase === "function" ? getApiBase() : "";
    } catch {
      return "";
    }
  }, []);

  const [characterId, setCharacterId] = useState(null);

  // keep character in sync with Settings/topbar switcher
  useEffect(() => {
    const onChar = (e) => {
      const id = String(e?.detail || "");
      if (id) setCharacterId(id);
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

  const hydratedRef = useRef(false);

  // Load from DB
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!API_BASE || !characterId) return;
        const token = localStorage.getItem("auth_token");
        if (!token) return;

        const r = await fetch(`${API_BASE}/cstate/${characterId}/bp_v1`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json().catch(() => ({}));
        if (!mounted) return;

        const v = j?.value;
        if (v && typeof v === "object") {
          if (v.state && typeof v.state === "object") {
            setState((prev) => ({
              ...(prev || {}),
              ...(v.state || {}),
              hidden: { ...(prev?.hidden || {}), ...((v.state || {}).hidden || {}) },
              favorites: { ...(prev?.favorites || {}), ...((v.state || {}).favorites || {}) },
            }));
          }
          if (v.history && typeof v.history === "object") {
            setHistory((prev) => ({
              ...(prev || {}),
              ...(v.history || {}),
              recentActions: Array.isArray(v.history?.recentActions) ? v.history.recentActions : (prev?.recentActions || []),
              actionStack: Array.isArray(v.history?.actionStack) ? v.history.actionStack : (prev?.actionStack || []),
              bpGainStack: Array.isArray(v.history?.bpGainStack) ? v.history.bpGainStack : (prev?.bpGainStack || []),
              byDay: (v.history?.byDay && typeof v.history.byDay === "object") ? v.history.byDay : (prev?.byDay || {}),
            }));
          }
        }
      } catch {}
      hydratedRef.current = true;
    })();
    return () => { mounted = false; };
  }, [API_BASE, characterId]);

  // Save to DB (debounced)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!API_BASE || !characterId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    const payload = { state, history };
    const t = setTimeout(() => {
      fetch(`${API_BASE}/cstate/${characterId}/bp_v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: payload }),
      }).catch(() => {});
    }, 800);

    return () => clearTimeout(t);
  }, [API_BASE, characterId, state, history]);

    
  const totalBP = useMemo(() => {
    const pointsMult = (state.isPlat ? 2 : 1) * (state.serverX2 ? 2 : 1);

    return TASKS_DATA.reduce((acc, t) => {
      const base = Number(t.bpBase || 0);

      // ⭐ онлайн считается по qty, без галочки
      if (t.id === REPEATABLE_ID) {
        const q = Number(state.qty[t.id] ?? 0);
        return acc + base * pointsMult * q;
      }

      // обычные задания — по галочке
      if (!state.checked[t.id]) return acc;
      return acc + base * pointsMult;
    }, 0);
  }, [state]);


  const pushAction = useCallback((action) => {
    setHistory((h) => ({ ...h, actionStack: [action, ...(h.actionStack || [])].slice(0, 100) }));
  }, []);

  const pushBPGain = useCallback((action) => {
    setHistory((h) => ({ ...h, bpGainStack: [action, ...(h.bpGainStack || [])].slice(0, 5) }));
  }, []);

  const toggleTask = useCallback((id) => {
    setState((prev) => {
      const prevChecked = !!prev.checked[id];
      const nextCheckedVal = !prevChecked;
      const nextChecked = { ...prev.checked, [id]: nextCheckedVal };
      const task = TASKS_DATA.find((t) => t.id === id);
      const ts = Date.now();
      pushAction({ type: "toggle", id, title: task?.title, ts, prevChecked, nextChecked: nextCheckedVal });
      if (nextCheckedVal) {
        pushBPGain({ type: "toggle", id, title: task?.title, ts, prevChecked, nextChecked: nextCheckedVal });
        setHistory((h) => ({
          ...h,
          recentActions: [{ id, title: task?.title, time: ts }, ...(h.recentActions || [])].slice(0, 5),
        }));
      }
      return { ...prev, checked: nextChecked };
    });
  }, [pushAction, pushBPGain]);


  const hideTask = useCallback((id) => {
    setState((p) => ({ ...p, hidden: { ...(p.hidden || {}), [id]: true } }));
  }, []);

  const unhideTask = useCallback((id) => {
    setState((p) => {
      const next = { ...(p.hidden || {}) };
      delete next[id];
      return { ...p, hidden: next };
    });
  }, []);



  const toggleFavorite = useCallback((id) => {
    setState((p) => {
      const next = { ...(p.favorites || {}) };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { ...p, favorites: next };
    });
  }, []);



  const removeRecentAction = (actionTime, taskId) => {
    setHistory((h) => ({ ...h, recentActions: (h.recentActions || []).filter((a) => a.time !== actionTime) }));
    setState((prev) => ({ ...prev, checked: { ...prev.checked, [taskId]: false } }));
  };

  const undoLastAction = useCallback(() => {
    // Basic undo logic kept simplified for length
    setHistory((h) => {
      const stack = Array.isArray(h.actionStack) ? h.actionStack : [];
      if (stack.length === 0) return h;
      const actionToUndo = stack[0];
      if (actionToUndo.type === "toggle") {
        setState((prev) => ({ ...prev, checked: { ...prev.checked, [actionToUndo.id]: !!actionToUndo.prevChecked } }));
      } else if (actionToUndo.type === "qty") {
        setState((prev) => ({ ...prev, qty: { ...prev.qty, [actionToUndo.id]: actionToUndo.prevQty || 1 } }));
      }
      return { ...h, actionStack: stack.slice(1) };
    });
  }, []);

  const undoLastBPGain = useCallback(() => {
    setHistory((h) => {
      const stack = Array.isArray(h.bpGainStack) ? h.bpGainStack : [];
      if (stack.length === 0) return h;
      const gain = stack[0];
      if (gain.type === "toggle") {
        setState((prev) => ({ ...prev, checked: { ...prev.checked, [gain.id]: false } }));
        setHistory((hist) => ({ ...hist, recentActions: (hist.recentActions || []).filter(a => a.time !== gain.ts) }));
      } else if (gain.type === "qty") {
        setState((prev) => ({ ...prev, qty: { ...prev.qty, [gain.id]: gain.prevQty || 1 } }));
      }
      return { ...h, bpGainStack: stack.slice(1) };
    });
  }, []);

  const resetAllTasks = () => { resetTodayProgressGraph(); setState(prev => ({ ...prev, checked: {}, qty: {} })); };
  const resetHistory = () => setHistory({ byDay: {}, recentActions: [], actionStack: [], bpGainStack: [] });

  useEffect(() => {
    const today = ymdLocal();
    setHistory((prev) => {
      const cur = Number(prev.byDay?.[today] || 0);
      if (cur === Number(totalBP || 0)) return prev;
      return { ...prev, byDay: { ...(prev.byDay || {}), [today]: Number(totalBP || 0) } };
    });
  }, [totalBP]);

  return {
    ...state,
    history,
    characterId,

    hideTask,
    unhideTask,
    toggleFavorite,

    totalBP,
    toggleTask,

    setTaskQty: (id, val) =>
      setState((p) => ({
        ...p,
        qty: {
          ...p.qty,
          [id]: Math.max(0, Math.min(MAX_HOURS, Number(val) || 0)),
        },
      })),

    resetAllTasks,
    undoLastAction,

    setPlat: (v) => setState((p) => ({ ...p, isPlat: v })),
    setServerX2: (v) => setState((p) => ({ ...p, serverX2: v })),
    setOnlyUnchecked: (v) => setState((p) => ({ ...p, onlyUnchecked: v })),
    setGroup: (v) => setState((p) => ({ ...p, activeGroup: v })),
  };

}

/* -------------------------------------------------------------------------- */
/* ACCESS / PAYWALL                                                          */
/* -------------------------------------------------------------------------- */

const inferPrivileged = (me) => {
  const role = String(me?.role || me?.tier || me?.plan || "").toLowerCase();
  if (["admin", "owner", "support", "gold", "vip", "pro", "premium"].includes(role)) return true;


  const vipUntil = me?.vip_until || me?.vipUntil;
  if (vipUntil) {
    const t = typeof vipUntil === "number" ? vipUntil : Date.parse(String(vipUntil));
    if (Number.isFinite(t) && t > Date.now()) return true;
  }

  if (me?.is_privileged || me?.isPrivileged || me?.is_vip || me?.isVip) return true;

  return false;
};

const PaywallModal = ({ open, onClose, title = "VIP функция", subtitle, bullets = [] }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="w-full sm:w-[420px] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#111318] border border-slate-200/60 dark:border-white/10 p-4 sm:p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2">
                  <div className="w-8 h-8 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/15 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                  </div>
                  <div className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                    {title}
                  </div>
                </div>
                {subtitle && (
                  <div className="mt-2 text-sm text-slate-500 dark:text-slate-300 leading-snug">
                    {subtitle}
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                className="p-2 -mr-1 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/10 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {bullets?.length > 0 && (
              <div className="mt-3 space-y-2">
                {bullets.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-200">
                    <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span className="leading-snug">{b}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 h-11 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-black font-bold text-sm active:scale-[0.99] transition"
              >
                Ок
              </button>
            </div>

            <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-400">
              Подсказка: VIP открывает персональные категории, избранное и скрытые задания.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};



const SettingsModal = ({ open, onClose, prefs, setPrefs, isPrivileged, showHidden, setShowHidden, hiddenCount }) => {
  const builtIn = ["Фракционные", "Крайм", "Развлечения", "Работы"];

  const [newCatName, setNewCatName] = useState("");
  const [taskSearch, setTaskSearch] = useState("");

  const custom = (prefs?.customCats || []);
  const customNames = custom.map((c) => c?.name).filter(Boolean);

  const addCategory = () => {
    const name = String(newCatName || "").trim();
    if (!name) return;

    // prevent duplicates (case-insensitive)
    const exists = [...builtIn, ...customNames].some(
      (x) => String(x).toLowerCase() === name.toLowerCase()
    );
    if (exists) return;

    const id = "cat_" + Math.random().toString(36).slice(2, 9);

    setPrefs((p) => ({
      ...p,
      customCats: [...(p.customCats || []), { id, name }],
      catsEnabled: { ...(p.catsEnabled || {}), [name]: true },
      // если вдруг defaultGroup пустой — можно поставить новую категорию
      defaultGroup: p.defaultGroup || "Все",
    }));

    setNewCatName("");
  };

  const deleteCategory = (name) => {
    setPrefs((p) => {
      const nextCustom = (p.customCats || []).filter((c) => c?.name !== name);

      // remove overrides that point to this category
      const nextOv = { ...(p.taskCatOverride || {}) };
      Object.keys(nextOv).forEach((tid) => {
        if (nextOv[tid] === name) nextOv[tid] = "__AUTO__";
      });

      const nextEnabled = { ...(p.catsEnabled || {}) };
      delete nextEnabled[name];

      const nextDefault =
        p.defaultGroup === name ? "Все" : (p.defaultGroup || "Все");

      return {
        ...p,
        customCats: nextCustom,
        taskCatOverride: nextOv,
        catsEnabled: nextEnabled,
        defaultGroup: nextDefault,
      };
    });
  };

  const toggleCatEnabled = (cat) => {
    setPrefs((p) => ({
      ...p,
      catsEnabled: {
        ...(p.catsEnabled || {}),
        [cat]: (p.catsEnabled || {})[cat] === false ? true : false,
      },
    }));
  };

  const setTaskOverride = (taskId, cat) => {
    setPrefs((p) => ({
      ...p,
      taskCatOverride: { ...(p.taskCatOverride || {}), [taskId]: cat },
    }));
  };

  const enabledCats = ["Все", ...[...builtIn, ...customNames].filter((c) => (prefs?.catsEnabled || {})[c] !== false)];
  const effectiveDefault = String(prefs?.defaultGroup || "Все");

  const tasksForEdit = TASKS_DATA
    .filter((t) => t.id !== REPEATABLE_ID)
    .filter((t) => {
      const q = String(taskSearch || "").trim().toLowerCase();
      if (!q) return true;
      return (
        String(t.title || "").toLowerCase().includes(q) ||
        String(t.group || "").toLowerCase().includes(q)
      );
    });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="w-full sm:w-[520px] max-h-[85vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#111318] border border-slate-200/60 dark:border-white/10 p-4 sm:p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2">
                  <div className="w-8 h-8 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/15 flex items-center justify-center">
                    <Cog className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                  </div>
                  <div className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                    Настройки заданий
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 -mr-1 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/10 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {!isPrivileged ? (
              <div className="mt-4 rounded-2xl border border-slate-200/60 dark:border-white/10 p-3 text-sm text-slate-600 dark:text-slate-200">
                Доступно только VIP / Gold.
              </div>
            ) : (
              <div className="mt-4 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(85vh - 140px)" }}>
                {/* 0) Скрытые задания */}
                <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-2xl flex items-center justify-center ${showHidden ? "bg-slate-900 text-white dark:bg-white dark:text-black" : "bg-slate-100/70 dark:bg-white/5 text-slate-500 dark:text-slate-200"}`}>
                        {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-500">Скрытые задания</div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {Number(hiddenCount || 0) > 0 ? `Скрыто: ${hiddenCount}` : "Нет скрытых"}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (!isPrivileged) return;
                        if (typeof setShowHidden === "function") setShowHidden((v) => !v);
                      }}
                      className={`h-10 px-3 rounded-2xl text-xs font-black transition
                        ${showHidden ? "bg-slate-900 text-white dark:bg-white dark:text-black" : "bg-slate-100/70 dark:bg-white/5 text-slate-600 dark:text-slate-200"}`}
                    >
                      {showHidden ? "Скрыть" : "Показать"}
                    </button>
                  </div>
                </div>

                {/* 1) Categories */}
                <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 p-3">
                  <div className="text-xs font-bold text-slate-500 mb-2">Категории (вкладки)</div>

                  <div className="space-y-2">
                    {[...builtIn, ...customNames].map((cat) => {
                      const on = (prefs?.catsEnabled || {})[cat] !== false;
                      const isCustom = customNames.includes(cat);
                      return (
                        <div key={cat} className="flex items-center gap-2">
                          <button
                            onClick={() => toggleCatEnabled(cat)}
                            className={`flex-1 flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition
                              ${on ? "bg-indigo-500/10 text-slate-900 dark:text-white" : "bg-slate-100/70 dark:bg-white/5 text-slate-500"}`}
                          >
                            <span className="inline-flex items-center gap-2 min-w-0">
                              {on ? <Eye className="w-4 h-4 shrink-0" /> : <EyeOff className="w-4 h-4 shrink-0" />}
                              <span className="truncate">{cat}</span>
                            </span>
                            <span className={`text-[11px] font-black px-2 py-1 rounded-xl ${on ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-300/30 text-slate-500 dark:text-slate-300"}`}>
                              {on ? "ON" : "OFF"}
                            </span>
                          </button>

                          {isCustom && (
                            <button
                              onClick={() => deleteCategory(cat)}
                              className="h-10 px-3 rounded-2xl text-xs font-black bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/15 transition"
                              title="Удалить категорию"
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add custom category */}
                  <div className="mt-3 flex gap-2">
                    <input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="Новая категория…"
                      className="flex-1 h-10 px-3 rounded-2xl bg-slate-100/70 dark:bg-white/5 text-sm font-semibold outline-none"
                    />
                    <button
                      onClick={addCategory}
                      className="h-10 px-4 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-black font-black text-sm active:scale-[0.99] transition"
                    >
                      Добавить
                    </button>
                  </div>
                </div>

                {/* 2) Default tab */}
                <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 p-3">
                  <div className="text-xs font-bold text-slate-500 mb-2">Стартовая вкладка</div>
                  <div className="flex flex-wrap gap-2">
                    {enabledCats.map((g) => (
                      <button
                        key={g}
                        onClick={() => setPrefs((p) => ({ ...p, defaultGroup: g }))}
                        className={`px-3 py-2 rounded-2xl text-xs font-bold transition
                          ${effectiveDefault === g ? "bg-slate-900 text-white dark:bg-white dark:text-black" : "bg-slate-100/70 dark:bg-white/5 text-slate-500 dark:text-slate-200"}`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3) Move tasks between categories */}
                <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-500">Категория для каждого задания</div>
                    <div className="text-[11px] text-slate-400">“Авто” = по умолчанию</div>
                  </div>

                  <div className="mt-2">
                    <input
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder="Поиск задания…"
                      className="w-full h-10 px-3 rounded-2xl bg-slate-100/70 dark:bg-white/5 text-sm font-semibold outline-none"
                    />
                  </div>

                  <div className="mt-3 space-y-2">
                    {tasksForEdit.slice(0, 60).map((t) => {
                      const cur = prefs?.taskCatOverride?.[t.id] || "__AUTO__";
                      const label =
                        cur === "__AUTO__"
                          ? (taskCats(t).length ? taskCats(t).join(", ") : t.group)
                          : String(cur);

                      return (
                        <div key={t.id} className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 dark:bg-white/5 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{t.title}</div>
                            <div className="text-[11px] text-slate-400 truncate">Сейчас: {label}</div>
                          </div>

                          <select
                            value={cur}
                            onChange={(e) => setTaskOverride(t.id, e.target.value)}
                            className="h-9 max-w-[180px] rounded-2xl bg-white dark:bg-[#0f1116] border border-slate-200/60 dark:border-white/10 text-xs font-black px-3 outline-none"
                            title="Переместить в категорию"
                          >
                            <option value="__AUTO__">Авто</option>
                            {builtIn.map((c) => <option key={c} value={c}>{c}</option>)}
                            {customNames.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      );
                    })}

                    {tasksForEdit.length > 60 && (
                      <div className="text-[11px] text-slate-400">
                        Показаны первые 60. Уточни поиск, чтобы найти нужное.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-2 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 h-11 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-black font-bold text-sm active:scale-[0.99] transition"
              >
                Готово
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


/* -------------------------------------------------------------------------- */
/* COMPONENTS                                                                 */
/* -------------------------------------------------------------------------- */

const MinimalTaskItem = ({ task, displayCats, isChecked, qty, isPlat, serverX2, isFav, onFav, onToggle, onQtyChange, onHide }) => {
  const base = Number(task.bpBase || 0);
  const pointsMult = (isPlat ? 2 : 1) * (serverX2 ? 2 : 1);
  const singleTaskPoints = base * pointsMult;
  const totalPoints = singleTaskPoints * (task.repeatable ? (qty || 1) : 1);

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: isChecked ? 0.7 : 1 }}
      className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200
        ${isChecked
          ? "bg-indigo-50 dark:bg-indigo-900/10 text-slate-500"
          : "bg-white dark:bg-[#1A1D24] hover:bg-slate-50 dark:hover:bg-[#22252b] text-slate-900 dark:text-slate-100"
        }
      `}
      onClick={onToggle}
    >
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        {/* Check Circle */}
        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors
          ${isChecked
            ? "bg-indigo-500 border-indigo-500"
            : "border-slate-300 dark:border-slate-600 group-hover:border-indigo-400"
          }`}>
          <Check className={`w-3.5 h-3.5 text-white transition-opacity ${isChecked ? "opacity-100" : "opacity-0"}`} strokeWidth={3} />
        </div>

        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-medium truncate ${isChecked && "line-through opacity-80"}`}>
            {task.title}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            {(displayCats?.length ? displayCats.join(" • ") : task.group)}
          </span>

        </div>
      </div>

      <div className="flex items-center gap-3 pl-2" onClick={e => e.stopPropagation()}>
        {task.repeatable && isChecked && (
          <div className="flex items-center gap-1 bg-white dark:bg-black/20 rounded-md p-0.5 border border-slate-100 dark:border-white/5">
            <button className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded" onClick={() => onQtyChange((qty || 1) - 1)}><Minus className="w-3 h-3" /></button>
            <span className="text-[10px] w-4 text-center font-bold">{qty || 1}</span>
            <button className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded" onClick={() => onQtyChange((qty || 1) + 1)}><Plus className="w-3 h-3" /></button>
          </div>
        )}

        <button
          className={`p-1 rounded hover:bg-slate-200/60 dark:hover:bg-white/10
    ${isFav ? "text-amber-500" : "text-slate-400 hover:text-slate-700"}`}
          title={isFav ? "Убрать из избранного" : "В избранное"}
          onClick={(e) => { e.stopPropagation(); onFav?.(); }}
        >
          {isFav ? <Star className="w-4 h-4 fill-current" /> : <Star className="w-4 h-4" />}
        </button>



        <button
          className="p-1 rounded hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700"
          title="Скрыть задание"
          onClick={(e) => { e.stopPropagation(); onHide?.(); }}
        >
          <EyeOff className="w-4 h-4" />
        </button>

        <div className={`text-xs font-bold font-mono px-2 py-1 rounded bg-slate-100 dark:bg-white/5 min-w-[40px] text-center
           ${isChecked ? "text-indigo-600 dark:text-indigo-400 bg-indigo-100/50 dark:bg-indigo-500/10" : "text-slate-500 dark:text-slate-400"}`}>
          +{totalPoints}
        </div>
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* MAIN PAGE                                                                  */
/* -------------------------------------------------------------------------- */

export default function BP() {
  const navigate = useNavigate();
  const API_BASE = useMemo(() => (typeof getApiBase === "function" ? getApiBase() : ""), []);

  const {
    checked, qty, hidden, favorites, hideTask, unhideTask, toggleFavorite,
    isPlat, serverX2, onlyUnchecked, activeGroup, history, characterId, totalBP,
    toggleTask, setTaskQty, resetAllTasks,
    setPlat, setServerX2, setOnlyUnchecked, setGroup
  } = useBPLogic();

  // App subscription (VIP/Gold/Admin) — NOT the in-game VIP multiplier toggle.
  const [me, setMe] = useState(null);
  const [isPrivileged, setIsPrivileged] = useState(false);

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCfg, setPaywallCfg] = useState({
    title: "VIP функция",
    subtitle: "Эта возможность доступна только VIP / Gold.",
    bullets: ["Персональные категории", "Избранное", "Скрытые задания"],
  });


  const [prefs, setPrefs] = useState(() => loadPrefs());

  // Load prefs from DB
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!API_BASE || !characterId) return;
        const token = localStorage.getItem("auth_token");
        if (!token) return;
        const r = await fetch(`${API_BASE}/cstate/${characterId}/bp_prefs`, { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json().catch(() => ({}));
        if (!mounted) return;
        const v = j?.value;
        if (v && typeof v === "object") {
          setPrefs((prev) => ({
            ...DEFAULT_PREFS,
            ...v,
            catsEnabled: { ...DEFAULT_PREFS.catsEnabled, ...(v.catsEnabled || {}) },
          }));
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, [API_BASE, characterId]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const didApplyDefaultRef = useRef(false);

  useEffect(() => {
    if (!API_BASE || !characterId) return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    const t = setTimeout(() => {
      fetch(`${API_BASE}/cstate/${characterId}/bp_prefs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: prefs || null }),
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [API_BASE, characterId, prefs]);


  const openPaywall = (kind = "VIP функция") => {
    setPaywallCfg((p) => ({ ...p, title: kind }));
    setPaywallOpen(true);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchMe?.();
        if (!alive) return;
        setMe(data || null);
        setIsPrivileged(inferPrivileged(data));
      } catch {
        if (!alive) return;
        setIsPrivileged(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Free users: lock to "Все"
  useEffect(() => {
    if (!isPrivileged && activeGroup !== "Все") setGroup("Все");
  }, [isPrivileged, activeGroup, setGroup]);







  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [sortPreset, setSortPreset] = useState("none");

  const [showFavorites, setShowFavorites] = useState(false);

  const favoritesCount = useMemo(
    () => Object.keys(favorites || {}).length,
    [favorites]
  );


  useEffect(() => {
    if (showFavorites && favoritesCount === 0) {
      setShowFavorites(false);
    }
  }, [showFavorites, favoritesCount]);

  useEffect(() => {
    if (!isPrivileged) {
      if (showFavorites) setShowFavorites(false);
      if (showHidden) setShowHidden(false);
    }
  }, [isPrivileged, showFavorites, showHidden]);

  useEffect(() => {
    if (!isPrivileged) return;
    if (activeGroup !== "Все" && (prefs?.catsEnabled || {})[activeGroup] === false) {
      setGroup("Все");
    }
  }, [isPrivileged, activeGroup, prefs, setGroup]);




  const onlineTask = useMemo(
    () => TASKS_DATA.find(t => t.id === REPEATABLE_ID),
    []
  );

  const fav = favorites || {};

  const filteredTasks = useMemo(() => {
    const q = query.toLowerCase().trim();

    let list = TASKS_DATA.filter((t) => {
      if (t.id === REPEATABLE_ID) return false;
      if (hidden?.[t.id]) return false;

      // избранное — только те, у кого реально стоит звезда
      if (showFavorites && !fav[t.id]) return false;

      const cats = effectiveTaskCats(t, prefs, isPrivileged);

      // VIP prefs: disable categories (НЕ влияет на вкладку "Все")
      if (isPrivileged && activeGroup !== "Все") {
        const enabled = prefs?.catsEnabled || {};
        // If task belongs to at least one category, require at least one enabled
        if (cats.length > 0) {
          const ok = cats.some((c) => enabled[c] !== false);
          if (!ok) return false;
        }
      }

      if (activeGroup !== "Все") {
        if (cats.length === 0) return false;
        if (!cats.includes(activeGroup)) return false;
      }

      if (onlyUnchecked && checked[t.id]) return false;

      return !q || t.title.toLowerCase().includes(q) || t.group.toLowerCase().includes(q);
    });

    if (sortPreset !== "none") {
      const matches = (t) => {
        const typ = sortTypeOfTask(t);
        if (sortPreset === "single") return typ !== "pair" && typ !== "fraction";
        return typ === sortPreset;
      };
      list = [...list].sort((a, b) => (matches(a) ? 0 : 1) - (matches(b) ? 0 : 1));
    }

    return list;
  }, [
    query,
    activeGroup,
    onlyUnchecked,
    checked,
    sortPreset,
    hidden,
    showFavorites,
    fav,
    prefs,
    isPrivileged,
  ]);



  const last3 = useMemo(() => {
    const d0 = new Date();
    const d1 = new Date(d0);
    d1.setDate(d0.getDate() - 1);
    const d2 = new Date(d0);
    d2.setDate(d0.getDate() - 2);

    const k0 = ymdLocal(d0);
    const k1 = ymdLocal(d1);
    const k2 = ymdLocal(d2);

    return {
      today: Number(totalBP || 0),
      yesterday: Number(history?.byDay?.[k1] || 0),
      beforeYesterday: Number(history?.byDay?.[k2] || 0),
    };
  }, [history, totalBP]);




  // Last 3 days quick stats (today / yesterday / day before)
  return (
    <div className="relative h-full w-full max-w-6xl mx-auto overflow-hidden text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      <style>{`
        .custom-bp-scroll::-webkit-scrollbar { width: 6px; }
        .custom-bp-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-bp-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); border-radius: 999px; }
        .custom-bp-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.55); }
        .custom-page-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-page-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-page-scroll::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); border-radius: 999px; }
      `}</style>

      {/* 1. MINIMAL HEADER */}
      <header className="shrink-0 px-4 py-4 max-w-5xl w-full mx-auto flex items-center justify-between">
        <button onClick={() => navigate("/menu")} className="p-2 -ml-2 text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">


          <div className="text-right">
            <h1 className="text-lg font-bold tracking-tight">Bonus Points</h1>
            <div className="flex items-center justify-end gap-2 text-indigo-600 dark:text-indigo-400">
              <span className="text-2xl font-black">{totalBP}</span>
              <span className="text-sm font-medium text-slate-400">/ 440</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Мини-статистика за 3 дня */}
      <div className="shrink-0 max-w-5xl w-full mx-auto px-4 -mt-1 mb-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/80 dark:bg-[#1A1D24] border border-slate-100 dark:border-white/5 p-3">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Сегодня</div>
            <div className="mt-1 text-xl font-black text-indigo-600 dark:text-indigo-400">{last3.today}</div>
          </div>
          <div className="rounded-2xl bg-white/80 dark:bg-[#1A1D24] border border-slate-100 dark:border-white/5 p-3">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Вчера</div>
            <div className="mt-1 text-xl font-black text-slate-800 dark:text-white">{last3.yesterday}</div>
          </div>
          <div className="rounded-2xl bg-white/80 dark:bg-[#1A1D24] border border-slate-100 dark:border-white/5 p-3">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Позавчера</div>
            <div className="mt-1 text-xl font-black text-slate-800 dark:text-white">{last3.beforeYesterday}</div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl w-full mx-auto px-4 flex-1 min-h-0 flex flex-col">

        {/* 2. CONTROLS (Unified Row) */}
        <div className="shrink-0 mb-4 space-y-4">

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-[#1A1D24] rounded-xl text-sm font-medium outline-none focus:ring-2 ring-indigo-500/20 transition-all placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={resetAllTasks}
              className="px-3 py-2 rounded-xl text-xs font-bold transition-all
              bg-white dark:bg-[#1A1D24] text-slate-400
              hover:text-slate-600 dark:hover:text-slate-200"
              title="Сбросить выполненные задания"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>


            {/* Настройки (VIP) */}
            <button
              onClick={() => {
                if (!isPrivileged) return openPaywall("Настройки");
                setSettingsOpen(true);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1
                ${settingsOpen ? "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200" : "bg-white dark:bg-[#1A1D24] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}
                ${!isPrivileged ? "opacity-60" : ""}`}
              title={isPrivileged ? "Настройки" : "Только VIP"}
            >
              <Cog className="w-3.5 h-3.5" />
              {!isPrivileged && <Lock className="w-3.5 h-3.5 opacity-80" />}
            </button>


            {/* Minimal Toggles */}
            <button onClick={() => setPlat(!isPlat)} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${isPlat ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-white dark:bg-[#1A1D24] text-slate-400"}`}>VIP</button>
            <button onClick={() => setServerX2(!serverX2)} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${serverX2 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-white dark:bg-[#1A1D24] text-slate-400"}`}>X2</button>

            <button
              onClick={() => setOnlyUnchecked(!onlyUnchecked)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 ${onlyUnchecked
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                : "bg-white dark:bg-[#1A1D24] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              title="Скрывать выполненные"
            >
              {onlyUnchecked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Выполн.</span>
            </button>


            {/* Избранное (VIP) */}
            <button
              onClick={() => {
                if (!isPrivileged) return openPaywall("Избранное");
                setShowFavorites(v => !v);
                setShowHidden(false);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1
    ${showFavorites
                  ? "bg-amber-100/70 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "bg-white dark:bg-[#1A1D24] text-slate-400"
                } ${!isPrivileged ? "opacity-60" : ""}`}
              title={isPrivileged ? "Избранные задания" : "Только VIP"}
            >
              <Star className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Избранное</span>
              {!isPrivileged && <Lock className="w-3.5 h-3.5 opacity-80" />}
            </button>




          </div>


          {/* Clean Filters (Scrollable Tabs) */}
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar pb-1">
            {["Все", ...getAllCategoryNames(prefs)].map((g) => {
              const locked = !isPrivileged && g !== "Все";
              const disabledByPrefs = isPrivileged && g !== "Все" && (prefs?.catsEnabled || {})[g] === false;
              if (disabledByPrefs) return null;

              return (
                <button
                  key={g}
                  onClick={() => {
                    if (locked) return openPaywall("Категории заданий");
                    setGroup(g);
                  }}
                  className={`text-sm whitespace-nowrap font-medium transition-colors relative inline-flex items-center gap-2
        ${activeGroup === g ? "text-slate-900 dark:text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"}
        ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
                  title={locked ? "Только VIP" : undefined}
                >
                  <span>{g}</span>
                  {locked && <Lock className="w-3.5 h-3.5 opacity-80" />}
                  {activeGroup === g && !locked && (
                    <motion.div layoutId="underline" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                  )}
                </button>
              );
            })}

          </div>
        </div>

        {/* 3. TASK LIST (Flat Design) */}
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-2 pb-6 custom-bp-scroll">
          {onlyUnchecked && (
            <div className="text-xs text-slate-400 mb-1">Скрыты выполненные задания</div>
          )}

          {/* ⭐ Всегда сверху, вне категорий */}
          {onlineTask && (

            <div className="mb-3">
              <div className="group flex items-center justify-between p-3 rounded-lg
  bg-white dark:bg-[#1A1D24] hover:bg-slate-50 dark:hover:bg-[#22252b]
  text-slate-900 dark:text-slate-100 transition-all duration-200">


                <div className="flex flex-col">
                  <span className="text-sm font-semibold">
                    {onlineTask.title}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Онлайн • счётчик часов
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* СЧЁТЧИК */}
                  <div className="flex items-center gap-1 bg-white dark:bg-black/20 rounded-md p-0.5">
                    <button
                      className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded"
                      onClick={() => setTaskQty(
                        onlineTask.id,
                        Math.max(0, (qty[onlineTask.id] ?? 0) - 1)
                      )}
                    >
                      <Minus className="w-3 h-3" />
                    </button>

                    <span className="text-xs w-6 text-center font-bold">
                      {qty[onlineTask.id] ?? 0}
                    </span>

                    <button
                      className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded"
                      onClick={() => setTaskQty(
                        onlineTask.id,
                        Math.min(MAX_HOURS, (qty[onlineTask.id] ?? 0) + 1)
                      )}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* BP */}
                  <div className="text-xs font-bold font-mono px-2 py-1 rounded bg-slate-100 dark:bg-white/5 min-w-[40px] text-center
  text-indigo-600 dark:text-indigo-400 bg-indigo-100/50 dark:bg-indigo-500/10">

                    +{(onlineTask.bpBase * (qty[onlineTask.id] ?? 0)) * (isPlat ? 2 : 1) * (serverX2 ? 2 : 1)}
                  </div>
                </div>
              </div>

            </div>
          )}


          <AnimatePresence mode="popLayout">
            {filteredTasks.map(task => (
              <MinimalTaskItem
                key={task.id}
                task={task}
                displayCats={effectiveTaskCats(task, prefs, isPrivileged)}
                isChecked={!!checked[task.id]}
                qty={qty[task.id]}
                isPlat={isPlat}
                serverX2={serverX2}
                isFav={!!favorites?.[task.id]}
                onFav={() => toggleFavorite(task.id)}
                onToggle={() => toggleTask(task.id)}
                onQtyChange={(v) => setTaskQty(task.id, v)}
                onHide={() => hideTask(task.id)}
              />


            ))}
          </AnimatePresence>

          {showHidden && (
            <div className="mt-4 rounded-2xl bg-white/80 dark:bg-[#1A1D24] border border-slate-100 dark:border-white/5 p-3">
              <div className="text-xs font-bold text-slate-500 mb-2">Скрытые задания</div>

              {Object.keys(hidden || {}).length === 0 ? (
                <div className="text-sm text-slate-400">Нет скрытых заданий</div>
              ) : (
                <div className="space-y-2">
                  {Object.keys(hidden || {}).map((id) => {
                    const t = TASKS_DATA.find(x => x.id === id);
                    if (!t) return null;
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-white/5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{t.title}</div>
                          <div className="text-[10px] text-slate-400">{t.group}</div>
                        </div>
                        <button
                          className="px-2 py-1 rounded-lg text-xs font-bold bg-indigo-100/70 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                          onClick={() => unhideTask(id)}
                        >
                          Вернуть
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {filteredTasks.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm">Ничего не найдено</div>
          )}
        </div>
      </main>



      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        setPrefs={setPrefs}
        isPrivileged={isPrivileged}
        showHidden={showHidden}
        setShowHidden={setShowHidden}
        hiddenCount={Object.keys(hidden || {}).length}
      />

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        title={paywallCfg.title}
        subtitle={paywallCfg.subtitle}
        bullets={paywallCfg.bullets}
      />

    </div>
  );
}