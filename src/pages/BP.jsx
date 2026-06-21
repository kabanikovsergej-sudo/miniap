import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, RotateCcw, Search, Sparkles, Star, Trophy, Zap } from "lucide-react";

const LS = "nx_mobile_bp_v6";
const tasks = [
  { id: "online", title: "3 часа в онлайне", group: "Все", bp: 2, vip: 4, repeat: true },
  { id: "site", title: "Посетить любой сайт в браузере", group: "Развлечения", bp: 1, vip: 2 },
  { id: "brawl", title: "Зайти в любой канал в Brawl", group: "Развлечения", bp: 1, vip: 2 },
  { id: "match", title: "Поставить лайк любой анкете в Match", group: "Развлечения", bp: 1, vip: 2 },
  { id: "case", title: "Прокрутить DP кейс", group: "Казино", bp: 10, vip: 20 },
  { id: "casino", title: "Ставка в колесе удачи казино", group: "Казино", bp: 3, vip: 6 },
  { id: "mafia", title: "Сыграть в мафию в казино", group: "Казино", bp: 3, vip: 6 },
  { id: "pet_ball", title: "Кинуть мяч питомцу 15 раз", group: "Питомец", bp: 2, vip: 4 },
  { id: "pet_cmd", title: "15 команд питомца", group: "Питомец", bp: 2, vip: 4 },
  { id: "metro", title: "Проехать 1 станцию на метро", group: "Транспорт", bp: 2, vip: 4 },
  { id: "fish", title: "Поймать 20 рыб", group: "Фарм", bp: 4, vip: 8 },
  { id: "club", title: "Выполнить 2 квеста клубов", group: "Клубы", bp: 4, vip: 8 },
  { id: "repair", title: "Починить деталь в автосервисе", group: "Работы", bp: 1, vip: 2 },
  { id: "basket", title: "Забросить 2 мяча в баскетболе", group: "Спорт", bp: 1, vip: 2 },
  { id: "football", title: "Забить 2 гола в футбол", group: "Спорт", bp: 1, vip: 2 },
  { id: "arm", title: "Победить в армрестлинге", group: "Спорт", bp: 1, vip: 2 },
  { id: "darts", title: "Победить в дартс", group: "Спорт", bp: 1, vip: 2 },
  { id: "leasing", title: "Сделать платеж по лизингу", group: "Финансы", bp: 1, vip: 2 },
  { id: "greenhouse", title: "Посадить траву в теплице", group: "Криминал", bp: 4, vip: 8 },
];

function read() { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } }
function write(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} }

export default function BP() {
  const [state, setState] = useState(read);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("Все");
  const [vip, setVip] = useState(false);
  const [x2, setX2] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);

  const categories = useMemo(() => ["Все", ...Array.from(new Set(tasks.map((t) => t.group)))], []);
  const done = state.done || {};
  const qty = state.qty || {};

  const total = useMemo(() => tasks.reduce((sum, t) => {
    const count = t.repeat ? Number(qty[t.id] || 0) : done[t.id] ? 1 : 0;
    const value = (vip ? t.vip : t.bp) * (x2 ? 2 : 1);
    return sum + count * value;
  }, 0), [done, qty, vip, x2]);

  const filtered = tasks.filter((t) => {
    const okTab = tab === "Все" || t.group === tab;
    const okQuery = !query || `${t.title} ${t.group}`.toLowerCase().includes(query.toLowerCase());
    const okOpen = !onlyOpen || !done[t.id];
    return okTab && okQuery && okOpen;
  });

  const setDone = (id) => setState((prev) => {
    const next = { ...prev, done: { ...(prev.done || {}), [id]: !prev.done?.[id] } };
    write(next); return next;
  });
  const setQty = (id, n) => setState((prev) => {
    const next = { ...prev, qty: { ...(prev.qty || {}), [id]: Math.max(0, Math.min(99, n)) } };
    write(next); return next;
  });
  const reset = () => setState(() => { write({}); return {}; });

  return (
    <div className="nx-bp">
      <motion.section className="nx-bp-hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="nx-bp-top">
          <div className="nx-bp-icon"><Trophy size={24} /></div>
          <button onClick={reset}><RotateCcw size={16} /> Сброс</button>
        </div>
        <p>Bonus Points</p>
        <h1>{total}</h1>
        <span>Твой BP за сегодня. Белые карточки убраны, всё сделано под телефон.</span>
        <div className="nx-bp-statrow">
          <div><b>{tasks.length}</b><small>заданий</small></div>
          <div><b>{Object.values(done).filter(Boolean).length}</b><small>готово</small></div>
          <div><b>{vip ? "VIP" : "BASE"}</b><small>режим</small></div>
        </div>
      </motion.section>

      <section className="nx-bp-controls">
        <label><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск задания" /></label>
        <div className="nx-bp-buttons">
          <button className={vip ? "on" : ""} onClick={() => setVip(!vip)}><Star size={16} /> VIP</button>
          <button className={x2 ? "on" : ""} onClick={() => setX2(!x2)}><Zap size={16} /> X2</button>
          <button className={onlyOpen ? "on" : ""} onClick={() => setOnlyOpen(!onlyOpen)}><Check size={16} /> Не готово</button>
        </div>
        <div className="nx-bp-tabs">
          {categories.map((c) => <button key={c} className={tab === c ? "active" : ""} onClick={() => setTab(c)}>{c}</button>)}
        </div>
      </section>

      <section className="nx-bp-list">
        {filtered.map((t, i) => {
          const value = (vip ? t.vip : t.bp) * (x2 ? 2 : 1);
          const isDone = !!done[t.id];
          return (
            <motion.article key={t.id} className={`nx-bp-task ${isDone ? "done" : ""}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.015 }} onClick={() => !t.repeat && setDone(t.id)}>
              <button className="nx-bp-check" onClick={(e) => { e.stopPropagation(); t.repeat ? setQty(t.id, Number(qty[t.id] || 0) + 1) : setDone(t.id); }}>{isDone ? <Check size={18} /> : <Sparkles size={17} />}</button>
              <div>
                <small>{t.group}</small>
                <h3>{t.title}</h3>
              </div>
              {t.repeat ? <div className="nx-bp-qty"><button onClick={(e) => { e.stopPropagation(); setQty(t.id, Number(qty[t.id] || 0) - 1); }}>−</button><b>{qty[t.id] || 0}</b><button onClick={(e) => { e.stopPropagation(); setQty(t.id, Number(qty[t.id] || 0) + 1); }}>+</button></div> : <b className="nx-bp-points">+{value}</b>}
            </motion.article>
          );
        })}
      </section>
    </div>
  );
}
