import React, { useMemo, useState } from "react";
import { Car, Check, Clock, DollarSign, Plus, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LS = "nx_rentals_v6";
function read() { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } }
function write(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} }
function money(n) { return `$${Math.round(Number(n) || 0).toLocaleString("ru-RU")}`; }

export default function Rentals() {
  const [cars, setCars] = useState(read);
  const [open, setOpen] = useState(false);
  const [renting, setRenting] = useState(null);
  const [form, setForm] = useState({ name: "", plate: "", price: "", hours: "" });

  const stats = useMemo(() => ({
    total: cars.length,
    active: cars.filter((c) => c.active).length,
    income: cars.reduce((s, c) => s + Number(c.income || 0), 0),
  }), [cars]);

  const saveCars = (next) => { setCars(next); write(next); };
  const add = () => {
    if (!form.name.trim()) return;
    saveCars([{ id: Date.now(), name: form.name.trim(), plate: form.plate.trim() || "—", income: 0, active: false, endAt: null }, ...cars]);
    setForm({ name: "", plate: "", price: "", hours: "" });
    setOpen(false);
  };
  const remove = (id) => saveCars(cars.filter((c) => c.id !== id));
  const startRent = () => {
    if (!renting) return;
    const hours = Math.max(1, Number(form.hours) || 1);
    const price = Math.max(0, Number(form.price) || 0);
    saveCars(cars.map((c) => c.id === renting.id ? { ...c, active: true, endAt: Date.now() + hours * 3600000, income: Number(c.income || 0) + price } : c));
    setRenting(null); setForm({ name: "", plate: "", price: "", hours: "" });
  };
  const finish = (id) => saveCars(cars.map((c) => c.id === id ? { ...c, active: false, endAt: null } : c));

  return (
    <div className="nx-rentals">
      <section className="nx-rent-hero">
        <div><p>Аренда</p><h1>Автопарк</h1><span>Карточки вместо таблиц. Всё помещается на маленьком телефоне.</span></div>
        <button onClick={() => setOpen(true)}><Plus size={22} /></button>
      </section>
      <section className="nx-rent-stats">
        <div><b>{stats.total}</b><span>Всего</span></div>
        <div><b>{stats.active}</b><span>В аренде</span></div>
        <div><b>{money(stats.income)}</b><span>Доход</span></div>
      </section>
      <section className="nx-rent-list">
        {cars.length === 0 ? <div className="nx-empty"><Car size={28} /><b>Машин нет</b><span>Нажми плюс и добавь первое авто.</span></div> : cars.map((car) => (
          <motion.article key={car.id} className={`nx-rent-card ${car.active ? "active" : ""}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="nx-rent-icon"><Car size={21} /></div>
            <div className="nx-rent-body">
              <div className="nx-rent-title"><h3>{car.name}</h3><span>{car.active ? "В аренде" : "Свободно"}</span></div>
              <p>{car.plate}</p>
              <div className="nx-rent-meta"><span><DollarSign size={14} /> {money(car.income)}</span>{car.active ? <span><Clock size={14} /> Активно</span> : null}</div>
              <div className="nx-rent-actions">
                {car.active ? <button onClick={() => finish(car.id)}><Check size={16} /> Завершить</button> : <button onClick={() => setRenting(car)}><Clock size={16} /> Сдать</button>}
                <button className="danger" onClick={() => remove(car.id)}><Trash2 size={16} /></button>
              </div>
            </div>
          </motion.article>
        ))}
      </section>
      <AnimatePresence>{open && <Sheet title="Добавить авто" close={() => setOpen(false)}><label>Название<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="BMW M5" /></label><label>Номер<input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC123" /></label><button className="nx-primary" onClick={add}>Добавить</button></Sheet>}</AnimatePresence>
      <AnimatePresence>{renting && <Sheet title="Сдать авто" close={() => setRenting(null)}><div className="nx-sheet-selected"><b>{renting.name}</b><span>{renting.plate}</span></div><label>Цена ($)<input inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, "") })} placeholder="25000" /></label><label>Часы<input inputMode="numeric" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value.replace(/\D/g, "") })} placeholder="2" /></label><button className="nx-primary" onClick={startRent}>Запустить аренду</button></Sheet>}</AnimatePresence>
    </div>
  );
}
function Sheet({ title, children, close }) { return <motion.div className="nx-sheet-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button className="nx-sheet-bg" onClick={close} /><motion.section className="nx-sheet" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}><div className="bar" /><header><h2>{title}</h2><button onClick={close}><X size={19} /></button></header>{children}</motion.section></motion.div>; }
