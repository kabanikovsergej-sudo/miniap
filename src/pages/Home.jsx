import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Timer, Calculator, Car, Trophy, Stethoscope, Wine, ChefHat, Sparkles, Dice5, MessageCircle, Newspaper, X, ShieldCheck } from "lucide-react";
import { ensureAnalyticsSession, trackToolOpen } from "@/lib/analytics";

const EASE = [0.16, 1, 0.3, 1];

const news = [
  { tag: "ИНТЕРФЕЙС", title: "Новый дизайн NightcoreX", text: "Главная, карточки и анимации стали чище и удобнее на телефоне." },
  { tag: "ТАЙМЕРЫ", title: "Таймеры стали стабильнее", text: "Починили запуск, паузу и отображение нескольких таймеров." },
  { tag: "MINI APP", title: "Адаптация под Telegram", text: "Разделы теперь открываются внутри Mini App и нормально листаются." },
];

const tools = [
  { to: "/bp", title: "Bonus Points", text: "Задания и прогресс BP", icon: Trophy },
  { to: "/calculator", title: "Калькулятор", text: "Доходы, расходы, история", icon: Calculator },
  { to: "/rentals", title: "Аренда", text: "Авто, таймеры, доход", icon: Car },
  { to: "/timer", title: "Таймеры", text: "Несколько таймеров сразу", icon: Timer },
  { to: "/ems", title: "EMS", text: "Быстрые подсказки", icon: Stethoscope },
  { to: "/CookingTable", title: "Готовка", text: "Рецепты и эффекты", icon: ChefHat },
  { to: "/Taro", title: "Таро", text: "Карты и эффекты", icon: Sparkles },
  { to: "/alco", title: "Алкоголь", text: "Напитки и места", icon: Wine },
  { to: "/Ball", title: "Magic Ball", text: "Шар судьбы", icon: Dice5 },
];

export default function Home() {
  const [newsOpen, setNewsOpen] = useState(false);
  const invite = (import.meta.env.VITE_DISCORD_INVITE || "https://discord.com/invite/GESqaKKFty").trim();

  useEffect(() => ensureAnalyticsSession(), []);
  useEffect(() => {
    if (!newsOpen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; };
  }, [newsOpen]);

  const date = useMemo(() => new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }), []);

  return (
    <div className="nx-home">
      <motion.section className="nx-hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
        <div className="nx-kicker">{date}</div>
        <h1>NightcoreX</h1>
        <p>Хелпер для 5RP. Всё нужное — в одном удобном Mini App.</p>
        <div className="nx-home-actions">
          <button type="button" onClick={() => { setNewsOpen(true); trackToolOpen("NewsPanel"); }}>
            <Newspaper size={18} /> Новости
          </button>
          <a href={invite} target="_blank" rel="noopener noreferrer" onClick={() => trackToolOpen("SupportDiscord")}>
            <MessageCircle size={18} /> Поддержка
          </a>
        </div>
      </motion.section>

      <section className="nx-news-inline">
        {news.slice(0, 2).map((item) => (
          <article key={item.title}>
            <div>{item.tag}</div>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
            <span>NightcoreX <ShieldCheck size={14} /></span>
          </article>
        ))}
      </section>

      <section className="nx-tool-grid">
        {tools.map((tool, index) => {
          const Icon = tool.icon;
          return (
            <motion.div key={tool.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index }}>
              <Link to={tool.to} onClick={() => trackToolOpen(tool.title)}>
                <span><Icon size={20} /></span>
                <strong>{tool.title}</strong>
                <small>{tool.text}</small>
              </Link>
            </motion.div>
          );
        })}
      </section>

      <AnimatePresence>
        {newsOpen && (
          <motion.div className="nx-news-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="nx-news-bg" onClick={() => setNewsOpen(false)} aria-label="Закрыть" />
            <motion.div className="nx-news-panel" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
              <div className="nx-news-head">
                <div><span>NightcoreX</span><h2>Новости</h2></div>
                <button onClick={() => setNewsOpen(false)} aria-label="Закрыть"><X size={20} /></button>
              </div>
              <div className="nx-news-list">
                {news.map((item) => (
                  <article key={item.title}>
                    <div>{item.tag}</div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
