import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Timer,
  Calculator,
  ArrowRight,
  MessageCircle,
  Newspaper,
  Sparkles,
  ChevronRight,
  Wrench,
  ShieldCheck,
  X,
  Gamepad2,
  Stethoscope,
  Wine,
  ChefHat,
  Dice5,
  LayoutGrid,
  ArrowUp01,
  ArrowUp,
} from "lucide-react";
import {
  trackToolOpen,
  ensureAnalyticsSession,
} from "@/lib/analytics";

/**
 * Home.jsx — главная страница NightcoreX.
 * Все разделы из Menu перенесены сюда. Рамки намеренно не используются:
 * только мягкие поверхности, тени, отступы и анимации.
 */

const EASE = [0.16, 1, 0.3, 1];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.72, delay, ease: EASE },
});

const LATEST_NEWS = [
  {
    id: "interface",
    label: "ИНТЕРФЕЙС",
    date: "СЕГОДНЯ",
    title: "Новый дизайн NightcoreX",
    text: "Обновили главную страницу, карточки и анимации — всё стало чище и плавнее.",
    icon: Sparkles,
  },
  {
    id: "timers",
    label: "ТАЙМЕРЫ",
    date: "СЕГОДНЯ",
    title: "Таймеры стали стабильнее",
    text: "Починили состояния запуска и паузы, а также сделали управление заметно ровнее.",
    icon: Timer,
  },
  {
    id: "updates",
    label: "ОБНОВЛЕНИЕ",
    date: "В РАБОТЕ",
    title: "Дальше — больше улучшений",
    text: "Продолжаем приводить страницы NightcoreX к одному аккуратному стилю.",
    icon: Wrench,
  },
];

const MAIN_TOOLS = [
  {
    title: "Таймер",
    subtitle: "Время и сессии",
    text: "Запускай несколько сессий и держи прогресс под контролем.",
    icon: Timer,
    page: "Timer",
    glow: "rgba(120, 154, 255, 0.28)",
    surface:
      "linear-gradient(145deg, rgba(113,130,255,0.20), rgba(15,17,27,0.22) 62%, rgba(255,255,255,0.035))",
  },
  {
    title: "Калькулятор",
    subtitle: "Доходы и расходы",
    text: "Сохраняй операции, проверяй баланс и контролируй прибыль.",
    icon: Calculator,
    page: "Calculator",
    glow: "rgba(108, 235, 191, 0.24)",
    surface:
      "linear-gradient(145deg, rgba(72,196,158,0.18), rgba(15,17,27,0.22) 62%, rgba(255,255,255,0.035))",
  },
];

const MENU_MODULES = [
  {
    id: "bp_tasks",
    title: "Bonus Points",
    subtitle: "Фарм и задания",
    desc: "Отслеживай прогресс и не теряй темп.",
    icon: Gamepad2,
    to: "/bp",
    glow: "rgba(91, 123, 255, 0.28)",
    surface:
      "linear-gradient(145deg, rgba(85,111,255,0.21), rgba(15,17,27,0.2) 64%, rgba(255,255,255,0.025))",
  },
  {
    id: "ems",
    title: "EMS Helper",
    subtitle: "Реанимация",
    desc: "Помощник для быстрых и понятных действий.",
    icon: Stethoscope,
    to: "/ems",
    glow: "rgba(255, 105, 125, 0.26)",
    surface:
      "linear-gradient(145deg, rgba(255,81,106,0.20), rgba(15,17,27,0.2) 64%, rgba(255,255,255,0.025))",
  },
  {
    id: "alcohol",
    title: "Sommelier",
    subtitle: "Бар и алкоголь",
    desc: "Виды напитков и места, где их можно найти.",
    icon: Wine,
    to: "/alco",
    glow: "rgba(255, 182, 77, 0.26)",
    surface:
      "linear-gradient(145deg, rgba(255,169,60,0.20), rgba(15,17,27,0.2) 64%, rgba(255,255,255,0.025))",
  },
  {
    id: "cooking",
    title: "Cuisine",
    subtitle: "Кулинария",
    desc: "Рецепты и ингредиенты в одном удобном разделе.",
    icon: ChefHat,
    to: "/CookingTable",
    glow: "rgba(105, 231, 158, 0.24)",
    surface:
      "linear-gradient(145deg, rgba(78,211,137,0.19), rgba(15,17,27,0.2) 64%, rgba(255,255,255,0.025))",
  },
  {
    id: "tarot",
    title: "Mystic Tarot",
    subtitle: "Карты таро",
    desc: "Узнай, что приготовил тебе сегодняшний день.",
    icon: Sparkles,
    to: "/Taro",
    glow: "rgba(216, 114, 255, 0.28)",
    surface:
      "linear-gradient(145deg, rgba(205,85,255,0.20), rgba(15,17,27,0.2) 64%, rgba(255,255,255,0.025))",
  },
  {
    id: "magic_ball",
    title: "Magic 8-Ball",
    subtitle: "Шар судьбы",
    desc: "Получай случайные ответы на свои вопросы.",
    icon: Dice5,
    to: "/ball",
    glow: "rgba(141, 103, 255, 0.28)",
    surface:
      "linear-gradient(145deg, rgba(124,83,255,0.21), rgba(15,17,27,0.2) 64%, rgba(255,255,255,0.025))",
  },
];

export default function Home() {
  const [newsOpen, setNewsOpen] = useState(false);

  useEffect(() => ensureAnalyticsSession(), []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setNewsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("ru-RU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  );

  const DISCORD_INVITE = (
    import.meta.env.VITE_DISCORD_INVITE || "https://discord.com/invite/GESqaKKFty"
  ).trim();

  return (
    <div className="home-page" style={styles.page}>
      <style>{responsiveCss}</style>

      <main style={styles.main}>
        <section style={styles.hero}>
          <motion.div style={styles.kicker} {...fadeUp(0.06)}>
            <span style={styles.kickerDot} />
            {today}
          </motion.div>

          <motion.h1 style={styles.title} {...fadeUp(0.15)}>
            NightcoreX
          </motion.h1>

          <motion.p style={styles.subtitle} {...fadeUp(0.24)}>
            Хелпер для 5RP — все нужные инструменты теперь находятся на главной.
          </motion.p>
        </section>

        <motion.section className="home-main-tools" style={styles.mainTools} {...fadeUp(0.42)}>
          {MAIN_TOOLS.map((tool, index) => (
            <MainToolCard key={tool.page} tool={tool} index={index} />
          ))}
        </motion.section>

        <motion.section style={styles.modulesSection} {...fadeUp(0.52)}>
          <div className="home-section-heading" style={styles.sectionHeading}>
            <div>
              <h2 style={styles.sectionTitle}>Игровые инструменты</h2>
            </div>

            
          </div>

          <div className="home-module-grid" style={styles.moduleGrid}>
            {MENU_MODULES.map((module, index) => (
              <MenuModuleCard key={module.id} module={module} index={index} />
            ))}
          </div>
        </motion.section>
      </main>

      <motion.button
        type="button"
        onClick={() => {
          setNewsOpen(true);
          trackToolOpen("NewsPanel");
        }}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.64, duration: 0.45, ease: EASE }}
        whileHover={{ y: -3, scale: 1.025 }}
        whileTap={{ scale: 0.97 }}
        style={styles.newsButton}
      >
        <ArrowUp size={17} />
        Новости
        <span style={styles.newsButtonCount}>3</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {newsOpen && (
          <div
            style={styles.newsOverlay}
            role="dialog"
            aria-modal="true"
            aria-label="Последние новости"
          >
            <button
              type="button"
              aria-label="Закрыть новости"
              onClick={() => setNewsOpen(false)}
              style={styles.newsBackdrop}
            />

            <motion.div
              style={styles.newsStage}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.18, ease: EASE }}
            >
              <button
                type="button"
                onClick={() => setNewsOpen(false)}
                style={styles.newsClose}
                title="Закрыть"
                aria-label="Закрыть"
              >
                <X size={17} />
              </button>

              <div className="home-news-grid" style={styles.newsGrid}>
                {LATEST_NEWS.map((news, index) => {
                  const Icon = news.icon;
                  return (
                    <motion.article
                      key={news.id}
                      style={styles.newsCard}
                      initial={{ opacity: 0, y: 30, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 18, scale: 0.985 }}
                      transition={{
                        duration: 0.42,
                        delay: 0.04 + index * 0.075,
                        ease: EASE,
                      }}
                      whileHover={{ y: -8 }}
                    >
                      <div style={styles.newsCardTop}>
                        <div style={styles.newsCardIcon}>
                          <Icon size={19} />
                        </div>
                        <span style={styles.newsDate}>{news.date}</span>
                      </div>

                      <div style={styles.newsEyebrow}>{news.label}</div>
                      <h3 style={styles.newsCardTitle}>{news.title}</h3>
                      <p style={styles.newsCardText}>{news.text}</p>

                      <div style={styles.newsCardFooter}>
                        <span>NightcoreX</span>
                        <ShieldCheck size={15} />
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <motion.a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ y: -4, scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        style={styles.discordFloat}
        onClick={() => trackToolOpen("SupportDiscord")}
        title="Поддержка"
      >
        <MessageCircle size={24} />
      </motion.a>
    </div>
  );
}

function LinkButton({ to, label, primary = false }) {
  return (
    <motion.div
      whileHover={{ scale: 1.045, y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
    >
      <Link
        to={createPageUrl(to)}
        onClick={() => trackToolOpen(to)}
        style={primary ? styles.primaryButton : styles.secondaryButton}
      >
        {label}
        <ChevronRight size={16} />
      </Link>
    </motion.div>
  );
}

function MainToolCard({ tool, index }) {
  const Icon = tool.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.08, duration: 0.45, ease: EASE }}
      whileHover={{ y: -7 }}
      whileTap={{ scale: 0.985 }}
    >
      <Link
        to={createPageUrl(tool.page)}
        onClick={() => trackToolOpen(tool.page)}
        style={{ ...styles.mainToolCard, background: tool.surface }}
      >
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [0, index ? -3 : 3, 0] }}
          transition={{
            duration: 3.4 + index * 0.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ ...styles.mainToolIcon, boxShadow: `0 14px 32px ${tool.glow}` }}
        >
          <Icon size={26} />
        </motion.div>

        <div style={styles.mainToolCopy}>
          <div style={styles.mainToolLabel}>{tool.subtitle}</div>
          <h2 style={styles.mainToolTitle}>{tool.title}</h2>
          <p style={styles.mainToolText}>{tool.text}</p>
        </div>

        <div style={styles.mainToolArrow}>
          <ArrowRight size={18} />
        </div>
      </Link>
    </motion.div>
  );
}

function MenuModuleCard({ module, index }) {
  const Icon = module.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 + index * 0.055, duration: 0.45, ease: EASE }}
      whileHover={{ y: -7 }}
      whileTap={{ scale: 0.985 }}
    >
      <Link
        to={module.to}
        onClick={() => trackToolOpen(module.id)}
        style={{ ...styles.moduleCard, background: module.surface }}
      >
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 3.3 + index * 0.18,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ ...styles.moduleIcon, boxShadow: `0 14px 30px ${module.glow}` }}
        >
          <Icon size={24} strokeWidth={1.8} />
        </motion.div>

        <div style={styles.moduleArrow}>
          <ArrowRight size={17} />
        </div>

        <div style={styles.moduleCopy}>
          <div style={styles.moduleSubtitle}>{module.subtitle}</div>
          <h3 style={styles.moduleTitle}>{module.title}</h3>
          <p style={styles.moduleText}>{module.desc}</p>
        </div>

        <div
          aria-hidden="true"
          style={{ ...styles.moduleGlow, background: module.glow }}
        />
      </Link>
    </motion.div>
  );
}

const styles = {
  page: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    background: "transparent",
    color: "#f5f6f8",
    fontFamily:
      "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255,255,255,0.18) transparent",
  },
  main: {
    position: "relative",
    zIndex: 2,
    width: "min(1180px, calc(100% - 40px))",
    margin: "0 auto",
    padding: "clamp(20px, 3vw, 36px) 0 122px",
  },
  hero: {
    minHeight: "min(390px, 48vh)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "clamp(14px, 2vw, 22px)",
  },
  kicker: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 13px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.055)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.11em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.52)",
  },
  kickerDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#d7ffe9",
    boxShadow: "0 0 14px rgba(182,255,215,0.78)",
  },
  title: {
    margin: 0,
    maxWidth: "14ch",
    fontSize: "clamp(44px, 7vw, 82px)",
    fontWeight: 320,
    lineHeight: 1.02,
    letterSpacing: "-0.06em",
  },
  subtitle: {
    margin: 0,
    maxWidth: 640,
    fontSize: "clamp(15px, 1.5vw, 18px)",
    lineHeight: 1.65,
    color: "rgba(255,255,255,0.52)",
  },
  ctaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 8,
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    padding: "14px 24px",
    background: "#f5f6f8",
    color: "#080808",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 750,
    boxShadow: "0 0 30px rgba(255,255,255,0.18)",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    padding: "14px 24px",
    background: "rgba(255,255,255,0.065)",
    color: "#f5f6f8",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
    boxShadow: "0 10px 26px rgba(0,0,0,0.16)",
  },
  mainTools: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },
  mainToolCard: {
    position: "relative",
    minHeight: 220,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "clamp(20px, 2.5vw, 28px)",
    borderRadius: 32,
    overflow: "hidden",
    color: "#f5f6f8",
    textDecoration: "none",
    boxShadow: "0 22px 56px rgba(0,0,0,0.20)",
  },
  mainToolIcon: {
    width: 54,
    height: 54,
    display: "grid",
    placeItems: "center",
    borderRadius: 19,
    background: "rgba(255,255,255,0.94)",
    color: "#07080a",
  },
  mainToolCopy: {
    marginTop: 30,
    maxWidth: "30ch",
  },
  mainToolLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  mainToolTitle: {
    margin: "8px 0 0",
    fontSize: "clamp(25px, 2.5vw, 34px)",
    lineHeight: 1.04,
    letterSpacing: "-0.04em",
    fontWeight: 650,
  },
  mainToolText: {
    margin: "10px 0 0",
    color: "rgba(255,255,255,0.50)",
    fontSize: 13,
    lineHeight: 1.55,
  },
  mainToolArrow: {
    position: "absolute",
    top: 26,
    right: 26,
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    borderRadius: 14,
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.72)",
  },
  modulesSection: {
    marginTop: "clamp(42px, 6vw, 72px)",
  },
  sectionHeading: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 18,
    marginBottom: "clamp(18px, 2.2vw, 26px)",
  },
  sectionOverline: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "rgba(255,255,255,0.43)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  sectionTitle: {
    margin: "9px 0 0",
    fontSize: "clamp(30px, 4vw, 46px)",
    lineHeight: 1.04,
    fontWeight: 500,
    letterSpacing: "-0.05em",
  },
  sectionText: {
    margin: "11px 0 0",
    maxWidth: 560,
    color: "rgba(255,255,255,0.47)",
    fontSize: 14,
    lineHeight: 1.6,
  },
  sectionSpark: {
    width: 48,
    height: 48,
    display: "grid",
    placeItems: "center",
    borderRadius: 18,
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.82)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  },
  moduleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 16,
  },
  moduleCard: {
    position: "relative",
    minHeight: 222,
    display: "flex",
    flexDirection: "column",
    padding: "clamp(18px, 2vw, 24px)",
    borderRadius: 28,
    overflow: "hidden",
    color: "#f5f6f8",
    textDecoration: "none",
    boxShadow: "0 20px 52px rgba(0,0,0,0.18)",
    isolation: "isolate",
  },
  moduleIcon: {
    width: 48,
    height: 48,
    display: "grid",
    placeItems: "center",
    borderRadius: 17,
    background: "rgba(255,255,255,0.93)",
    color: "#07080a",
    position: "relative",
    zIndex: 2,
  },
  moduleArrow: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    borderRadius: 13,
    background: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.66)",
    zIndex: 2,
  },
  moduleCopy: {
    position: "relative",
    zIndex: 2,
    marginTop: "auto",
  },
  moduleSubtitle: {
    color: "rgba(255,255,255,0.44)",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  moduleTitle: {
    margin: "8px 0 0",
    fontSize: "clamp(20px, 2vw, 26px)",
    lineHeight: 1.06,
    fontWeight: 650,
    letterSpacing: "-0.035em",
  },
  moduleText: {
    margin: "9px 0 0",
    color: "rgba(255,255,255,0.49)",
    fontSize: 12,
    lineHeight: 1.55,
  },
  moduleGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    top: -95,
    right: -85,
    borderRadius: "50%",
    filter: "blur(38px)",
    opacity: 0.76,
    pointerEvents: "none",
    zIndex: 1,
  },
  newsButton: {
    position: "fixed",
    left: "50%",
    bottom: 24,
    zIndex: 80,
    transform: "translateX(-50%)",
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    minHeight: 44,
    padding: "0 16px",
    border: "none",
    borderRadius: 999,
    background: "rgba(17,19,26,0.92)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 12px 36px rgba(0,0,0,0.34)",
    color: "rgba(255,255,255,0.88)",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: "0.01em",
    cursor: "pointer",
  },
  newsButtonCount: {
    minWidth: 20,
    height: 20,
    display: "grid",
    placeItems: "center",
    padding: "0 5px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: 800,
  },
  newsOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    display: "grid",
    placeItems: "center",
    padding: "clamp(20px, 4vw, 64px)",
  },
  newsBackdrop: {
    position: "absolute",
    inset: 0,
    border: "none",
    padding: 0,
    cursor: "default",
    background: "rgba(0,0,0,0.72)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  newsStage: {
    position: "relative",
    width: "min(1160px, 100%)",
    paddingTop: 44,
  },
  newsClose: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    border: "none",
    borderRadius: 14,
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.76)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.2)",
    cursor: "pointer",
  },
  newsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 16,
  },
  newsCard: {
    minHeight: "clamp(260px, 38vh, 340px)",
    padding: "clamp(20px, 2.2vw, 28px)",
    display: "flex",
    flexDirection: "column",
    borderRadius: 28,
    background:
      "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.028))",
    boxShadow: "0 20px 55px rgba(0,0,0,0.28)",
    backdropFilter: "blur(20px) saturate(125%)",
    WebkitBackdropFilter: "blur(20px) saturate(125%)",
    overflow: "hidden",
  },
  newsCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  newsCardIcon: {
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    borderRadius: 16,
    background: "rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.82)",
  },
  newsDate: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.1em",
  },
  newsEyebrow: {
    marginTop: "clamp(30px, 5vw, 56px)",
    color: "rgba(255,255,255,0.42)",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.14em",
  },
  newsCardTitle: {
    margin: "12px 0 0",
    color: "#f5f6f8",
    fontSize: "clamp(21px, 2vw, 28px)",
    lineHeight: 1.08,
    letterSpacing: "-0.035em",
    fontWeight: 600,
  },
  newsCardText: {
    margin: "12px 0 0",
    maxWidth: "34ch",
    color: "rgba(255,255,255,0.50)",
    fontSize: 13,
    lineHeight: 1.6,
  },
  newsCardFooter: {
    marginTop: "auto",
    paddingTop: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "rgba(255,255,255,0.34)",
    fontSize: 11,
    fontWeight: 700,
  },
  discordFloat: {
    position: "fixed",
    right: 24,
    bottom: 24,
    zIndex: 90,
    width: 56,
    height: 56,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "#f5f6f8",
    color: "#050505",
    boxShadow: "0 0 35px rgba(255,255,255,0.28)",
  },
};

const responsiveCss = `
  .home-page::-webkit-scrollbar {
    width: 5px;
  }

  .home-page::-webkit-scrollbar-track {
    background: transparent;
  }

  .home-page::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.16);
    border-radius: 999px;
  }

  @media (max-width: 820px) {
    .home-main-tools,
    .home-module-grid,
    .home-news-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 580px) {
    .home-page {
      -webkit-overflow-scrolling: touch;
    }

    .home-main-tools,
    .home-module-grid,
    .home-news-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    .home-section-heading {
      align-items: flex-start !important;
    }
  }

  @media (max-width: 440px) {
    .home-page {
      padding-bottom: 76px;
    }
  }
`;
