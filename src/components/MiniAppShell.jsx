import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronRight,
  Calculator,
  Car,
  CircleHelp,
  Flame,
  Gamepad2,
  Home,
  Menu,
  Settings,
  Sparkles,
  Crown,
  Timer,
  Trophy,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiFetch, fetchMe } from "@/lib/auth";
import { hapticImpact, hapticNotification, hapticSelection } from "@/lib/telegram";

const PRIMARY_NAV = [
  { to: "/home", label: "Главная", icon: Home },
  { to: "/bp", label: "BP", icon: Trophy },
  { to: "/calculator", label: "Калькулятор", icon: Calculator },
  { to: "/rentals", label: "Аренда", icon: Car },
  { to: "#more", label: "Ещё", icon: Menu },
];

const MORE_NAV = [
  { to: "/timer", label: "Таймеры", note: "Несколько задач одновременно", icon: Timer },
  { to: "/CookingTable", label: "Готовка", note: "Таблица рецептов", icon: UtensilsCrossed },
  { to: "/ems", label: "EMS", note: "Медицинские расчёты", icon: Flame },
  { to: "/alco", label: "Алкоголь", note: "Справочник", icon: Sparkles },
  { to: "/Taro", label: "Таро", note: "Карты и расклады", icon: CircleHelp },
  { to: "/Ball", label: "Magic Ball", note: "Ответ на вопрос", icon: Gamepad2 },
  { to: "/vip", label: "VIP", note: "Премиум и код", icon: Crown },
  { to: "/settings", label: "Настройки", note: "Аккаунт и уведомления", icon: Settings },
];

function isRouteActive(pathname, to) {
  if (!to || to === "#more") return false;
  return pathname === to || pathname.toLowerCase().startsWith(`${to.toLowerCase()}/`);
}

function formatName(me) {
  const raw = me?.full_name || me?.telegram_username || me?.username || me?.discord_username || "Профиль";
  return String(raw).replace(/^@/, "").slice(0, 28);
}

function formatNotificationDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function NotificationDrawer({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await apiFetch("/notifications?limit=30", { method: "GET" });
      setItems(Array.isArray(result?.items) ? result.items : []);
    } catch {
      setItems([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const markRead = async (id) => {
    try {
      await apiFetch(`/notifications/${encodeURIComponent(String(id))}/read`, { method: "POST" });
      setItems((previous) => previous.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    } catch {
      hapticNotification("error");
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
      setItems((previous) => previous.map((item) => ({ ...item, is_read: true })));
      hapticNotification("success");
    } catch {
      hapticNotification("error");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="tma-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.section
            className="tma-sheet tma-sheet--notifications"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 330 }}
            onClick={(event) => event.stopPropagation()}
            aria-label="Уведомления"
          >
            <div className="tma-sheet__handle" />
            <header className="tma-sheet__header">
              <div>
                <p className="tma-eyebrow">NIGHTCOREX</p>
                <h2>Уведомления</h2>
              </div>
              <div className="tma-sheet__actions">
                {items.some((item) => !item.is_read) ? (
                  <button className="tma-text-button" type="button" onClick={markAllRead}>Прочитать</button>
                ) : null}
                <button className="tma-icon-button" type="button" aria-label="Закрыть" onClick={onClose}><X size={19} /></button>
              </div>
            </header>

            <div className="tma-sheet__body">
              {loading ? (
                <div className="tma-empty">Загружаем…</div>
              ) : failed ? (
                <div className="tma-empty">
                  Не удалось получить уведомления.
                  <button type="button" className="tma-retry-button" onClick={load}>Повторить</button>
                </div>
              ) : items.length === 0 ? (
                <div className="tma-empty">Новых уведомлений пока нет.</div>
              ) : (
                items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`tma-notification ${item.is_read ? "" : "is-unread"}`}
                    onClick={() => markRead(item.id)}
                  >
                    <span className="tma-notification__dot" aria-hidden />
                    <span className="tma-notification__content">
                      <strong>{item.title || "Уведомление"}</strong>
                      {item.body ? <span>{item.body}</span> : null}
                      <small>{formatNotificationDate(item.created_at)}</small>
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MoreDrawer({ open, onClose, pathname }) {
  const navigate = useNavigate();

  const go = (to) => {
    hapticImpact("light");
    navigate(to);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="tma-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.section
            className="tma-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 330 }}
            onClick={(event) => event.stopPropagation()}
            aria-label="Другие разделы"
          >
            <div className="tma-sheet__handle" />
            <header className="tma-sheet__header">
              <div>
                <p className="tma-eyebrow">NIGHTCOREX</p>
                <h2>Другие разделы</h2>
              </div>
              <button className="tma-icon-button" type="button" aria-label="Закрыть" onClick={onClose}><X size={19} /></button>
            </header>

            <div className="tma-sheet__body tma-menu-list">
              {MORE_NAV.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(pathname, item.to);
                return (
                  <button type="button" className={`tma-menu-row ${active ? "is-active" : ""}`} key={item.to} onClick={() => go(item.to)}>
                    <span className="tma-menu-row__icon"><Icon size={19} /></span>
                    <span className="tma-menu-row__text"><strong>{item.label}</strong><small>{item.note}</small></span>
                    <ChevronRight size={18} className="tma-menu-row__arrow" />
                  </button>
                );
              })}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function MiniAppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const mainRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const loadProfile = async () => {
      try {
        const data = await fetchMe();
        if (alive) setMe(data);
      } catch {
        if (alive) setMe(null);
      }
    };

    loadProfile();
    window.addEventListener("nightcore:me", loadProfile);
    return () => {
      alive = false;
      window.removeEventListener("nightcore:me", loadProfile);
    };
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    const isHome = location.pathname === "/home" || location.pathname === "/";
    if (!webApp?.BackButton) return undefined;

    const handleBack = () => {
      if (moreOpen) return setMoreOpen(false);
      if (notificationsOpen) return setNotificationsOpen(false);
      if (!isHome) navigate(-1);
    };

    try {
      if (moreOpen || notificationsOpen || !isHome) webApp.BackButton.show();
      else webApp.BackButton.hide();
      webApp.BackButton.onClick(handleBack);
    } catch {
      // Older Telegram clients simply do not expose BackButton.
    }

    return () => {
      try {
        webApp.BackButton.offClick(handleBack);
        webApp.BackButton.hide();
      } catch {
        // No-op.
      }
    };
  }, [location.pathname, moreOpen, notificationsOpen, navigate]);

  const profileInitial = useMemo(() => formatName(me).slice(0, 1).toUpperCase(), [me]);

  const go = (item) => {
    if (item.to === "#more") {
      hapticSelection();
      setMoreOpen(true);
      return;
    }
    hapticSelection();
    navigate(item.to);
  };

  return (
    <div className="tma-shell">
      <header className="tma-header">
        <button className="tma-brand" type="button" onClick={() => navigate("/home")} aria-label="На главную">
          <span className="tma-brand__mark">N</span>
          <span><strong>NIGHTCOREX</strong><small>5RP · Mini App</small></span>
        </button>

        <div className="tma-header__right">
          <button className="tma-icon-button" type="button" aria-label="Уведомления" onClick={() => { hapticImpact("light"); setNotificationsOpen(true); }}>
            <Bell size={19} />
          </button>
          <button className="tma-avatar" type="button" onClick={() => navigate("/settings")} aria-label="Настройки профиля">
            {me?.avatar_url ? <img src={me.avatar_url} alt="" /> : <span>{profileInitial}</span>}
          </button>
        </div>
      </header>

      <main ref={mainRef} className="tma-main" id="tma-main-content">
        {children}
      </main>

      <nav className="tma-bottom-nav" aria-label="Основная навигация">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.to === "#more" ? moreOpen : isRouteActive(location.pathname, item.to);
          return (
            <button type="button" key={item.to} className={`tma-nav-button ${active ? "is-active" : ""}`} onClick={() => go(item)}>
              <Icon size={20} strokeWidth={active ? 2.25 : 1.9} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} pathname={location.pathname} />
      <NotificationDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
}
