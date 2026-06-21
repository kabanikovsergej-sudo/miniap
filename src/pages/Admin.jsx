// src/pages/Admin.jsx
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  RefreshCw,
  Plus,
  Search,
  Copy,
  Trash2,
  Save,
  Tag,
  User,
  StickyNote,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Crown,
  Wand2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

const FILTERS = [
  { label: "Все", value: "all" },
  { label: "Активные", value: "active" },
  { label: "Скоро истекут", value: "expiring" },
  { label: "Истекшие", value: "expired" },
  { label: "Закончились (uses)", value: "depleted" }
];

const SORTS = [
  { label: "Истекают скоро", value: "exp_soon" },
  { label: "Истекают позже", value: "exp_late" },
  { label: "Сначала новые", value: "created_desc" },
  { label: "Сначала старые", value: "created_asc" },
  { label: "Сначала depleted", value: "depleted_first" }
];

const KEY_TYPES = [
  { label: "VIP", value: "vip" },
  { label: "GOLD", value: "gold" }
];


const EXPIRING_SOON_DAYS = 3;

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
function daysLeft(expiresAt) {
  const d = toDate(expiresAt);
  if (!d) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
function normalize(s) {
  return String(s || "").trim().toLowerCase();
}
function fmtDate(v) {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleString();
}
function clampStr(s, n) {
  return String(s ?? "").slice(0, n);
}

function makeCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = ["code", "type", "vip_days", "max_uses", "used_count", "created_at", "expires_at", "tag", "assigned_user"];
  const lines = [header.map(esc).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.code || r.key || r.id,
        (r.type || r.key_type || r.role_type || r.plan || "vip"),
        r.vip_days ?? r.duration,
        r.max_uses,
        r.used_count,
        r.created_at,
        r.expires_at,
        r.tag,
        r.assigned_user
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n");
}

function PageBg() {
  return;
}

function GlassSelect({
  value,
  onChange,
  options,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  icon: Icon = null,
  placeholder = "Выбери…"
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });

  // ✅ IMPORTANT: меню рендерится через portal и может быть вне ThemeProvider,
  // поэтому dark: классы иногда не срабатывают. Определяем тему напрямую по <html class="dark">.
  const [isDark, setIsDark] = useState(() => {
    try {
      return document.documentElement.classList.contains("dark");
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const el = document.documentElement;
      const update = () => setIsDark(el.classList.contains("dark"));
      update();
      const obs = new MutationObserver(update);
      obs.observe(el, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    } catch {
      // ignore
    }
  }, []);

  const current = options.find((o) => String(o.value) === String(value));

  function calcPos() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.round(r.left),
      top: Math.round(r.bottom + 8),
      width: Math.round(r.width)
    });
  }

  useEffect(() => {
    function onDoc(e) {
      const root = rootRef.current;
      if (root && root.contains(e.target)) return;
      const menu = document.getElementById(menuId);
      if (menu && menu.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  useEffect(() => {
    if (!open) return;
    calcPos();
    const onScroll = () => calcPos();
    const onResize = () => calcPos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={"relative " + className}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          "w-full flex items-center justify-between gap-2 " +
          "rounded-2xl border border-slate-200/70 dark:border-white/10 " +
          "bg-background/70 text-foreground px-3 py-2 outline-none " +
          "hover:bg-muted/40 transition shadow-sm " +
          buttonClassName
        }
      >
        <span className="flex items-center gap-2 text-sm min-w-0">
          {Icon ? <Icon className="w-4 h-4 text-muted-foreground shrink-0" /> : null}
          <span className="truncate">{current?.label || placeholder}</span>
        </span>
        <ChevronDown className={"w-4 h-4 text-muted-foreground transition " + (open ? "rotate-180" : "")} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              id={menuId}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              style={{ left: pos.left, top: pos.top, width: pos.width, position: "fixed" }}
              className={
                "z-[9999] overflow-hidden " +
                "rounded-2xl border border-slate-200/70 dark:border-white/10 " +
                (isDark
                  ? "bg-slate-950/92 text-slate-50 shadow-[0_20px_60px_rgba(0,0,0,0.65)]"
                  : "bg-white/95 text-slate-900 shadow-[0_20px_60px_rgba(0,0,0,0.25)]") +
                " backdrop-blur-xl " +
                "max-h-[320px] overflow-y-auto " +
                menuClassName
              }
            >
              {options.map((opt) => {
                const active = String(opt.value) === String(value);
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={
                      "w-full px-4 py-3 text-left text-sm transition flex items-center justify-between gap-3 " +
                      (active
                        ? (isDark ? "bg-white/10 text-slate-50" : "bg-primary/10 text-slate-900")
                        : (isDark ? "text-slate-100 hover:bg-white/10" : "text-slate-900 hover:bg-slate-100/70"))
                    }
                  >
                    <span className="truncate">{opt.label}</span>
                    {active ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : null}
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

export default function Admin() {
  // ✅ Access: ADMIN or STAFF
  const [roleLoading, setRoleLoading] = useState(true);
  const [roleDenied, setRoleDenied] = useState(false);
  const [myRole, setMyRole] = useState("unknown");

  const [keys, setKeys] = useState([]);
  const [vipDays, setVipDays] = useState(7);
  const [keyType, setKeyType] = useState("vip");
  const [customCode, setCustomCode] = useState("");
  const [maxUses, setMaxUses] = useState(1);

  // expiry (optional absolute datetime)
  const [expiresAt, setExpiresAt] = useState(""); // datetime-local

  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const [q, setQ] = useState("");
  const [sortMode, setSortMode] = useState("exp_soon");
  const [filter, setFilter] = useState("all"); // all | active | expiring | expired | depleted
  const [editing, setEditing] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [bumpingId, setBumpingId] = useState(null);

  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const toggleOpen = (id) => setOpenId((cur) => (cur === id ? null : id));

  // toasts
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(1);
  function pushToast(type, text) {
    const id = toastId.current++;
    setToasts((p) => [...p, { id, type, text }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 2600);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await api("/me"); // expected: { role: "admin" | "staff" | ... }
        if (!mounted) return;
        const role = String(me?.role || me?.user?.role || "").toLowerCase();
        setMyRole(role || "unknown");
        const ok = ["admin", "owner", "superadmin"].includes(role);
        setRoleDenied(!ok);
      } catch {
        if (!mounted) return;
        setMyRole("unknown");
        setRoleDenied(true);
      } finally {
        if (mounted) setRoleLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function loadKeys() {
    setLoadingList(true);
    try {
      const data = await api("/admin/keys");
      // backend returns { keys: [...] }, but keep fallback compatibility
      const list = Array.isArray(data?.keys) ? data.keys : Array.isArray(data) ? data : [];
      setKeys(list);
      setSelected(new Set());
    } catch (e) {
      console.error(e);
      pushToast("err", "Не удалось загрузить ключи");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!roleLoading && !roleDenied) loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, roleDenied]);

  async function createKey() {
    setLoadingCreate(true);
    try {
      const dur = Math.max(1, Number(vipDays || 0));

      // one simple expiry control: datetime-local (optional)
      let expires_at;
      if (expiresAt) {
        // treat as local time in the browser, convert to ISO
        expires_at = new Date(expiresAt).toISOString();
      }

      const body = {
        type: keyType,
        duration: dur,
        max_uses: maxUses ? Number(maxUses) : undefined,
        custom_code: customCode.trim() || undefined,
        expires_at
      };

      await api("/admin/keys", {
        method: "POST",
        body: JSON.stringify(body),
      });


      pushToast("ok", `${keyType.toUpperCase()}-ключ создан`);
      setCustomCode("");
      await loadKeys();
    } catch (e) {
      console.error(e);
      pushToast("err", "Не удалось создать ключ");
    } finally {
      setLoadingCreate(false);
    }
  }

  async function deleteKey(id) {
    if (!confirm(`Удалить ключ ${id}?`)) return;
    try {
      await api(`/admin/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      pushToast("ok", "Ключ удалён");
      await loadKeys();
    } catch (e) {
      console.error(e);
      pushToast("err", "Не удалось удалить ключ");
    }
  }

  function copy(text) {
    navigator.clipboard.writeText(String(text || ""));
    pushToast("ok", "Скопировано");
  }

  function getEdit(id, field, fallback) {
    const e = editing[id];
    if (e && typeof e[field] !== "undefined") return e[field];
    return fallback ?? "";
  }
  function setEdit(id, patch) {
    setEditing((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }

  async function saveMeta(id) {
    const tag = clampStr(getEdit(id, "tag", ""), 60).trim();
    const assigned_user = clampStr(getEdit(id, "assigned_user", ""), 80).trim();
    const note = clampStr(getEdit(id, "note", ""), 300).trim();

    setSavingId(id);
    try {
      await api(`/admin/keys/${encodeURIComponent(id)}/meta`, {
        method: "PATCH",
        // ✅ бекенды иногда ждут другие имена полей — отправляем совместимо
        body: JSON.stringify({
          tag,
          tags: tag,
          assigned_user,
          assignedUser: assigned_user,
          user: assigned_user,
          note,
          notes: note
        })
      });
      pushToast("ok", "Сохранено");
      await loadKeys();
    } catch (e) {
      console.error(e);
      pushToast("err", "Ошибка сохранения");
    } finally {
      setSavingId(null);
    }
  }

  async function updateMaxUses(id, newMax) {
    const max_uses = Number(newMax || 0);
    if (!Number.isFinite(max_uses) || max_uses < 1) {
      pushToast("err", "max uses должно быть >= 1");
      return;
    }

    setBumpingId(id);
    try {
      // 1) основной путь: PATCH самого ключа
      try {
        await api(`/admin/keys/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ max_uses })
        });
      } catch {
        // 2) fallback: некоторые бекенды принимают max_uses в /meta
        await api(`/admin/keys/${encodeURIComponent(id)}/meta`, {
          method: "PATCH",
          body: JSON.stringify({ max_uses })
        });
      }

      pushToast("ok", `Max uses обновлено → ${max_uses}`);
      await loadKeys();
    } catch (e) {
      console.error(e);
      pushToast("err", "Не удалось обновить max uses");
    } finally {
      setBumpingId(null);
    }
  }

  async function bumpMaxUses(id, delta) {
    const k = (keys || []).find((x) => (x.code || x.key || x.id) === id);
    const curMax = Number(k?.max_uses || 0);
    const used = Number(k?.used_count || 0);

    // если max=0/undefined считаем "∞" — прибавлять не нужно
    if (!curMax) {
      pushToast("err", "У этого ключа uses: ∞ — увеличивать не нужно");
      return;
    }

    const next = Math.max(curMax + Number(delta || 0), used);
    await updateMaxUses(id, next);
  }



  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(ids) {
    setSelected(new Set(ids));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkDelete(ids) {
    if (!ids.length) return;
    if (!confirm(`Удалить ${ids.length} ключ(ей)?`)) return;
    try {
      for (const id of ids) {
        await api(`/admin/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      pushToast("ok", `Удалено: ${ids.length}`);
      await loadKeys();
    } catch (e) {
      console.error(e);
      pushToast("err", "Bulk delete: ошибка");
    }
  }

  function statusOf(k) {
    const used = Number(k.used_count || 0);
    const max = Number(k.max_uses || 0);
    const depleted = max > 0 && used >= max;

    const exp = k._expiresAt;
    const left = k._daysLeft;

    const expired = !!exp && left !== null && left < 0;
    const expSoon = !!exp && left !== null && left >= 0 && left <= EXPIRING_SOON_DAYS;

    const active = !expired && !depleted;
    return { depleted, expired, expSoon, active };
  }

  const prepared = useMemo(() => {
    const query = normalize(q);

    const list = (keys || [])
      .map((k) => {
        const expiresAt = k.expires_at || k.expiresAt || null;
        const createdAt = k.created_at || k.createdAt || null;
        const left = daysLeft(expiresAt);
        const code = k.code || k.key || k.id;

        return {
          ...k,
          _type: String(k.type || k.key_type || k.role_type || k.plan || "vip").toLowerCase(),
          _id: code,
          _expiresAt: expiresAt,
          _createdAt: createdAt,
          _daysLeft: left,
          _tag: k.tag || k.tags || k.meta?.tag || "",
          _assigned_user: k.assigned_user || k.assignedUser || k.user || k.meta?.assigned_user || k.meta?.assignedUser || "",
          _note: k.note || k.notes || k.meta?.note || k.meta?.notes || "",
          _durationVal: String(k.vip_days ?? k.duration).toLowerCase() === "lifetime" ? "∞" : (k.vip_days ?? k.duration)
        };
      })
      .filter((k) => {
        if (!query) return true;
        const hay = [k._id, k._tag, k._assigned_user, k._note].map((x) => String(x || "").toLowerCase()).join(" ");
        return hay.includes(query);
      })
      .filter((k) => {
        const st = statusOf(k);
        if (filter === "expired") return st.expired;
        if (filter === "expiring") return st.expSoon;
        if (filter === "depleted") return st.depleted;
        if (filter === "active") return st.active;
        return true;
      });

    const byCreated = (a, b) => (toDate(a._createdAt)?.getTime() ?? 0) - (toDate(b._createdAt)?.getTime() ?? 0);

    const byExpires = (a, b) => {
      const ea = toDate(a._expiresAt)?.getTime();
      const eb = toDate(b._expiresAt)?.getTime();
      if (!ea && !eb) return 0;
      if (!ea) return 1;
      if (!eb) return -1;
      return ea - eb;
    };

    const byDepleted = (a, b) => {
      const da = statusOf(a).depleted ? 1 : 0;
      const db = statusOf(b).depleted ? 1 : 0;
      return db - da;
    };

    list.sort((a, b) => {
      if (sortMode === "created_asc") return byCreated(a, b);
      if (sortMode === "created_desc") return byCreated(b, a);
      if (sortMode === "exp_late") return byExpires(b, a);
      if (sortMode === "depleted_first") return byDepleted(a, b) || byExpires(a, b);
      return byExpires(a, b);
    });

    return list;
  }, [keys, q, sortMode, filter]);

  const stats = useMemo(() => {
    const all = (keys || []).map((k) => {
      const expiresAt = k.expires_at || k.expiresAt || null;
      const createdAt = k.created_at || k.createdAt || null;
      const left = daysLeft(expiresAt);
      return { ...k, _expiresAt: expiresAt, _createdAt: createdAt, _daysLeft: left };
    });

    let total = all.length;
    let expired = 0;
    let expSoon = 0;
    let depleted = 0;
    let active = 0;

    for (const k of all) {
      const st = statusOf(k);
      if (st.expired) expired++;
      if (st.expSoon) expSoon++;
      if (st.depleted) depleted++;
      if (st.active) active++;
    }

    return { total, active, expired, expSoon, depleted };
  }, [keys]);

  const allIds = prepared.map((k) => k._id);
  const selectedIds = Array.from(selected);

  function expiryBadge(k) {
    const left = k._daysLeft;
    const expiresAt = k._expiresAt;

    if (!expiresAt) {
      return (
        <Badge variant="secondary" className="rounded-full">
          Без даты
        </Badge>
      );
    }

    if (left !== null && left < 0) {
      return (
        <Badge className="rounded-full bg-gradient-to-r from-red-600 to-rose-600 text-white hover:opacity-95">
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Истёк
          </span>
        </Badge>
      );
    }

    if (left !== null && left <= EXPIRING_SOON_DAYS) {
      return (
        <Badge className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-95">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Скоро ({left}д)
          </span>
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="rounded-full">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {fmtDate(expiresAt)}
        </span>
      </Badge>
    );
  }

  function usageBadge(k) {
    const used = Number(k.used_count || 0);
    const max = Number(k.max_uses || 0);
    if (!max) return <Badge className="rounded-full" variant="secondary">uses: ∞</Badge>;
    const depleted = used >= max;
    return (
      <Badge
        className={
          depleted
            ? "rounded-full bg-gradient-to-r from-red-600 to-rose-600 text-white hover:opacity-95"
            : "rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:opacity-95"
        }
      >
        uses: {used}/{max}
      </Badge>
    );
  }

  function durationBadge(k) {
    const v = k._durationVal;
    return (
      <Badge variant="outline" className="rounded-full">
        {v} дней {(String(k._type || "vip").toLowerCase() === "gold" ? "GOLD" : "VIP")}
      </Badge>
    );
  }


  function typeBadge(k) {
    const t = String(k._type || "vip").toLowerCase();
    const isGold = t === "gold";
    return (
      <Badge
        className={
          "rounded-full border-0 " +
          (isGold
            ? "bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-500 text-slate-950"
            : "bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white")
        }
      >
        {isGold ? "GOLD" : "VIP"}
      </Badge>
    );
  }


  function downloadCsv() {
    const csv = makeCsv(prepared);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vip_keys_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast("ok", "CSV экспортирован");
  }

  if (roleLoading) {
    return (
      <div className="relative p-6 text-muted-foreground">
        <PageBg />
        <div className="rounded-3xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-950/55 backdrop-blur-xl p-6 shadow-[0_18px_60px_rgba(0,0,0,0.12)] dark:shadow-[0_22px_70px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:ring-white/10">
          Загружаю доступ…
        </div>
      </div>
    );
  }

  if (roleDenied) {
    return (
      <div className="relative p-6 text-muted-foreground">
        <PageBg />
        <div className="rounded-3xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-950/55 backdrop-blur-xl p-6 shadow-[0_18px_60px_rgba(0,0,0,0.12)] dark:shadow-[0_22px_70px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:ring-white/10">
          <div className="text-xl font-bold text-foreground">Нет доступа</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Эта вкладка доступна только ролям <span className="font-semibold text-foreground">ADMIN</span> и{" "}
            <span className="font-semibold text-foreground">STAFF</span>.
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Твоя роль: {myRole || "unknown"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative p-6"><div className="w-full max-w-6xl mx-auto space-y-6">
      <PageBg />

      {/* TOASTS */}
      <div className="fixed top-4 right-4 z-[9999] space-y-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className={
                "rounded-2xl border px-4 py-3 shadow-xl backdrop-blur max-w-[360px] " +
                "bg-popover/80 text-popover-foreground slate-200/70 dark:border-white/10 " +
                (t.type === "ok" ? "ring-1 ring-emerald-500/25" : "ring-1 ring-red-500/25")
              }
            >
              <div className="flex items-start gap-2">
                {t.type === "ok" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                )}
                <div className="text-sm">{t.text}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* HEADER */}
      <div className="rounded-3xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-slate-950/55 backdrop-blur p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Admin Panel <span className="text-muted-foreground font-semibold text-base">(Keys)</span>
            </h1>
            <Badge className="rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-[0_14px_40px_rgba(99,102,241,0.25)] hover:brightness-110 border-0">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> {"ADMIN"}
              </span>
            </Badge>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={downloadCsv}
              className="gap-2 rounded-2xl"
              disabled={!prepared.length}
              title="Экспорт текущего списка (после фильтров/поиска)"
            >
              <Layers className="w-4 h-4" />
              CSV
            </Button>

            <Button variant="outline" onClick={loadKeys} className="gap-2 rounded-2xl" disabled={loadingList}>
              <RefreshCw className={`w-4 h-4 ${loadingList ? "animate-spin" : ""}`} />
              Обновить
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4 min-h-[88px] flex flex-col justify-between">
            <div className="text-xs text-muted-foreground">Всего ключей</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{stats.total}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4 min-h-[88px] flex flex-col justify-between">
            <div className="text-xs text-muted-foreground">Активные</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{stats.active}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4 min-h-[88px] flex flex-col justify-between">
            <div className="text-xs text-muted-foreground">Скоро истекут</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{stats.expSoon}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4 min-h-[88px] flex flex-col justify-between">
            <div className="text-xs text-muted-foreground">Истекли</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{stats.expired}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4 min-h-[88px] flex flex-col justify-between">
            <div className="text-xs text-muted-foreground">Закончились (uses)</div>
            <div className="text-2xl font-bold mt-1 text-foreground">{stats.depleted}</div>
          </div>
        </div>
      </div>



      {/* CREATE */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-slate-200/70 dark:border-white/10 bg-white/68 dark:bg-slate-950/55 backdrop-blur p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <Wand2 className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold text-lg text-foreground">Создать {keyType === "gold" ? "GOLD" : "VIP"}-ключ</h2>
        </div>

        {/* ⬇️ меньше кнопок, больше контроля */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">

          {/* Key type */}
          <div className="lg:col-span-2 space-y-1">
            <div className="text-xs text-muted-foreground">Тип ключа</div>
            <GlassSelect
              value={keyType}
              onChange={(v) => setKeyType(String(v))}
              options={KEY_TYPES}
              icon={Crown}
              placeholder="VIP"
            />
          </div>


          {/* VIP days */}
          <div className="lg:col-span-3 space-y-1">
            <div className="text-xs text-muted-foreground">VIP дней</div>
            <Input
              type="number"
              min={1}
              max={36500}
              value={vipDays}
              onChange={(e) => setVipDays(Number(e.target.value || 1))}
              className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 !text-slate-900 dark:!text-white !caret-slate-900 dark:!caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"
              placeholder="например 7"
            />
          </div>

          {/* Max uses */}
          <div className="lg:col-span-2 space-y-1">
            <div className="text-xs text-muted-foreground">Max uses</div>
            <Input
              type="number"
              min={1}
              max={9999}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value || 1))}
              className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 !text-slate-900 dark:!text-white !caret-slate-900 dark:!caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"
              placeholder="1"
            />
          </div>

          {/* Expiry datetime */}
          <div className="lg:col-span-4 space-y-1">
            <div className="text-xs text-muted-foreground">оставь пустым для бесконечного ключа</div>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 text-slate-900 dark:text-white caret-slate-900 dark:caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"
            />
          </div>

          {/* Custom code */}
          <div className="lg:col-span-3 space-y-1">
            <div className="text-xs text-muted-foreground">Свой код (4-32)</div>
            <Input
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 text-slate-900 dark:text-white caret-slate-900 dark:caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"
              placeholder="VIPKEY"
            />
          </div>

          <div className="lg:col-span-12 flex justify-end">
            <Button
              onClick={createKey}
              className="gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-[0_14px_40px_rgba(99,102,241,0.25)] hover:brightness-110 hover:opacity-95"
              disabled={loadingCreate}
            >
              <Plus className="w-4 h-4" />
              {loadingCreate ? "Создаю..." : "Создать"}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* FILTER BAR */}
      <div className="rounded-3xl border border-slate-200/70 dark:border-white/10 bg-white/68 dark:bg-slate-950/55 backdrop-blur p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 !text-slate-900 dark:!text-white !caret-slate-900 dark:!caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"
              placeholder="Поиск по коду / тегу / юзеру…"
            />
          </div>

          <div className="flex items-center gap-2 text-foreground">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <GlassSelect className="w-56" value={filter} onChange={(v) => setFilter(String(v))} options={FILTERS} icon={Filter} />
          </div>

          <div className="flex items-center gap-2 text-foreground">
            <GlassSelect className="w-56" value={sortMode} onChange={(v) => setSortMode(String(v))} options={SORTS} icon={Layers} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              Показано: {prepared.length}
            </Badge>
          </div>
        </div>

        {/* BULK BAR */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" className="rounded-2xl" onClick={() => selectAll(allIds)} disabled={!allIds.length}>
            Выделить всё
          </Button>

          <Button variant="outline" className="rounded-2xl gap-2" onClick={clearSelection} disabled={!selectedIds.length}>
            <X className="w-4 h-4" /> Снять выделение
          </Button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              Выбрано: {selectedIds.length}
            </Badge>

            <Button
              variant="outline"
              className="rounded-2xl gap-2"
              disabled={!selectedIds.length}
              onClick={() => copy(selectedIds.join("\n"))}
              title="Скопировать выбранные коды (по строкам)"
            >
              <Copy className="w-4 h-4" />
              Copy selected
            </Button>

            <Button
              className="rounded-2xl gap-2 bg-destructive text-destructive-foreground hover:opacity-95"
              disabled={!selectedIds.length}
              onClick={() => bulkDelete(selectedIds)}
            >
              <Trash2 className="w-4 h-4" />
              Delete selected
            </Button>
          </div>
        </div>
      </div>

      {/* LIST */}
      <div className="space-y-3">
        {prepared.map((k) => {
          const id = k._id;
          const isSel = selected.has(id);
          const used = Number(k.used_count || 0);
          const max = Number(k.max_uses || 0);
          const depleted = max > 0 && used >= max;
          const st = statusOf(k);

          const tag = getEdit(id, "tag", k._tag);
          const assigned_user = getEdit(id, "assigned_user", k._assigned_user);
          const note = getEdit(id, "note", k._note);

          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={
                "rounded-3xl border backdrop-blur p-4 shadow-sm " +
                (isSel ? "border-primary/35 bg-card/70" : "slate-200/70 dark:border-white/10 bg-card/60")
              }
            >
              {/* compact header row */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggleSelected(id)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="font-mono text-sm text-foreground">{id}</span>
                </label>

                <div className="flex flex-wrap gap-2">
                  {typeBadge(k)}
                  {durationBadge(k)}
                  {usageBadge(k)}
                  {expiryBadge(k)}

                  {depleted && (
                    <Badge className="rounded-full bg-gradient-to-r from-red-600 to-rose-600 text-white hover:opacity-95">
                      depleted
                    </Badge>
                  )}
                  {st.active && !st.expSoon && !st.expired && !depleted && (
                    <Badge className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-95">
                      active
                    </Badge>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" className="rounded-2xl px-3" onClick={() => toggleOpen(id)} title="Подробнее">
                    {openId === id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>

                  <Button className="rounded-2xl gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-[0_14px_40px_rgba(99,102,241,0.25)] hover:brightness-110 hover:opacity-95" onClick={() => copy(id)}>
                    <Copy className="w-4 h-4" /> Copy
                  </Button>

                  <Button variant="destructive" className="rounded-2xl gap-2" onClick={() => deleteKey(id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* slide-out details */}
              <AnimatePresence initial={false}>
                {openId === id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
                      <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <Tag className="w-4 h-4" /> Tag
                        </div>

                        <Input
                          value={tag}
                          onChange={(e) => setEdit(id, { tag: e.target.value })}
                          className="mt-2 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 !text-slate-900 dark:!text-white !caret-slate-900 dark:!caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"

                          placeholder="например: giveaway / partner / test…"
                        />
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <User className="w-4 h-4" /> Assigned user
                        </div>

                        <Input
                          value={assigned_user}
                          onChange={(e) => setEdit(id, { assigned_user: e.target.value })}
                          className="mt-2 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 !text-slate-900 dark:!text-white !caret-slate-900 dark:!caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"
                          placeholder="@username / telegram_id / note…"
                        />
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <StickyNote className="w-4 h-4" /> Note
                        </div>

                        <Input
                          value={note}
                          onChange={(e) => setEdit(id, { note: e.target.value })}
                          className="mt-2 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 !text-slate-900 dark:!text-white !caret-slate-900 dark:!caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"
                          placeholder="например: FamQ / ключевые слова / кому выдать…"
                        />
                      </div>

                      
                      <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-3">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <Layers className="w-4 h-4" /> Uses
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {usageBadge(k)}
                          {Number(k.max_uses || 0) ? (
                            <Badge variant="secondary" className="rounded-full">
                              можно увеличить, если ключ &quot;слили&quot;
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="rounded-full">
                              ∞ — без лимита
                            </Badge>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl"
                            disabled={bumpingId === id || !Number(k.max_uses || 0)}
                            onClick={() => bumpMaxUses(id, 1)}
                            title="Добавить +1 к max uses"
                          >
                            +1
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl"
                            disabled={bumpingId === id || !Number(k.max_uses || 0)}
                            onClick={() => bumpMaxUses(id, 5)}
                            title="Добавить +5 к max uses"
                          >
                            +5
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl"
                            disabled={bumpingId === id || !Number(k.max_uses || 0)}
                            onClick={() => bumpMaxUses(id, 10)}
                            title="Добавить +10 к max uses"
                          >
                            +10
                          </Button>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={999999}
                            value={getEdit(id, "setMaxUses", "")}
                            onChange={(e) => setEdit(id, { setMaxUses: e.target.value })}
                            className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-background/60 dark:bg-white/5 !text-slate-900 dark:!text-white !caret-slate-900 dark:!caret-white placeholder:text-slate-500 dark:placeholder:text-white/40"
                            placeholder="поставить max uses…"
                          />
                          <Button
                            type="button"
                            className="rounded-2xl gap-2 bg-emerald-600 text-white hover:opacity-95"
                            disabled={bumpingId === id}
                            onClick={() => {
                              const v = Number(getEdit(id, "setMaxUses", ""));
                              if (!v) return pushToast("err", "Введи число");
                              updateMaxUses(id, v);
                            }}
                            title="Сохранить max uses"
                          >
                            <Save className="w-4 h-4" />
                            {bumpingId === id ? "..." : "Set"}
                          </Button>
                        </div>
                      </div>

<div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-3">
                        <div className="text-xs text-muted-foreground">Инфо</div>

                        <div className="mt-2 text-sm space-y-1 text-foreground tabular-nums">
                          <div className="flex items-baseline gap-3">
                            <span className="text-muted-foreground w-24 shrink-0">Создан:</span>
                            <span className="ml-auto text-right">{fmtDate(k._createdAt)}</span>
                          </div>
                          <div className="flex items-baseline gap-3">
                            <span className="text-muted-foreground w-24 shrink-0">Истекает:</span>
                            <span className="ml-auto text-right">{k._expiresAt ? fmtDate(k._expiresAt) : "—"}</span>
                          </div>
                          <div className="flex items-baseline gap-3">
                            <span className="text-muted-foreground w-24 shrink-0">Осталось:</span>
                            <span className="ml-auto text-right">{k._expiresAt ? `${k._daysLeft ?? "?"} д` : "—"}</span>
                          </div>
                          <div className="flex items-baseline gap-3">
                            <span className="text-muted-foreground w-24 shrink-0">VIP days:</span>
                            <span className="ml-auto text-right">{String(k._durationVal ?? "—")}</span>
                          </div>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <Button
                            onClick={() => saveMeta(id)}
                            disabled={savingId === id}
                            className="rounded-2xl gap-2 bg-emerald-600 text-white hover:opacity-95"
                            title="Сохранить tag + assigned_user + note"
                          >
                            <Save className="w-4 h-4" />
                            {savingId === id ? "Сохраняю..." : "Сохранить"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {!prepared.length && (
          <div className="rounded-3xl border border-slate-200/70 dark:border-white/10 bg-white/68 dark:bg-slate-950/55 backdrop-blur p-10 text-center text-muted-foreground">
            Ничего не найдено.
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
