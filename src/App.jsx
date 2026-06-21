import React, { Suspense, lazy, useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { LoaderCircle, ShieldAlert } from "lucide-react";

import MiniAppShell from "@/components/MiniAppShell";
import TelegramGate from "@/components/TelegramGate";

const Home = lazy(() => import("@/pages/Home"));
const Timer = lazy(() => import("@/pages/Timer"));
const BP = lazy(() => import("@/pages/BP"));
const Calculator = lazy(() => import("@/pages/Calculator"));
const Rentals = lazy(() => import("@/pages/Rentals"));
const CookingTable = lazy(() => import("@/pages/CookingTable"));
const EMS = lazy(() => import("@/pages/EMS"));
const Taro = lazy(() => import("@/pages/Taro"));
const Ball = lazy(() => import("@/pages/Ball"));
const Alco = lazy(() => import("@/pages/Alco"));
const MiniSettingsPage = lazy(() => import("@/pages/MiniSettingsPage"));
const VIP = lazy(() => import("@/pages/VIP"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const AdminKeys = lazy(() => import("@/pages/AdminKeys"));
const NovaAI = lazy(() => import("@/components/ai/nova-ai").then((module) => ({ default: module.NovaAI })));

import { fetchMe, getToken } from "@/lib/auth";

function LoadingPage({ text = "Открываем приложение…" }) {
  return (
    <div className="tma-loading-page" role="status" aria-live="polite">
      <LoaderCircle size={28} className="animate-spin" />
      <span>{text}</span>
    </div>
  );
}

function LazyScreen({ children }) {
  return <Suspense fallback={<LoadingPage />}>{children}</Suspense>;
}

function Reauthenticate() {
  useEffect(() => {
    window.location.reload();
  }, []);
  return <LoadingPage text="Проверяем Telegram…" />;
}

function Protected({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function isAdmin(me) {
  const role = String(me?.role || "").toLowerCase();
  return Boolean(me?.is_admin) || ["admin", "owner", "superadmin"].includes(role);
}

function StaffGate({ children }) {
  const [state, setState] = useState({ loading: true, me: null });
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((me) => alive && setState({ loading: false, me }))
      .catch(() => alive && setState({ loading: false, me: null }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.loading) return <LoadingPage text="Проверяем доступ…" />;
  if (isAdmin(state.me)) return children;

  return (
    <section className="tma-access-denied">
      <ShieldAlert size={30} />
      <h1>Нет доступа</h1>
      <p>Этот раздел доступен только администрации.</p>
      <button type="button" className="tma-primary-button" onClick={() => navigate("/home")}>
        На главную
      </button>
    </section>
  );
}

function AppRoutes() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetchMe();
        if (alive) setMe(data);
      } catch {
        if (alive) setMe(null);
      }
    };

    load();
    window.addEventListener("nightcore:me", load);
    return () => {
      alive = false;
      window.removeEventListener("nightcore:me", load);
    };
  }, []);

  return (
    <MiniAppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<Reauthenticate />} />

        <Route path="/home" element={<Protected><LazyScreen><Home /></LazyScreen></Protected>} />
        <Route path="/bp" element={<Protected><LazyScreen><BP /></LazyScreen></Protected>} />
        <Route path="/bp/tasks" element={<Navigate to="/bp" replace />} />
        <Route path="/calculator" element={<Protected><LazyScreen><Calculator /></LazyScreen></Protected>} />
        <Route path="/rentals" element={<Protected><LazyScreen><Rentals /></LazyScreen></Protected>} />
        <Route path="/timer" element={<Protected><LazyScreen><Timer userStatus={me} /></LazyScreen></Protected>} />

        <Route path="/CookingTable" element={<Protected><LazyScreen><CookingTable /></LazyScreen></Protected>} />
        <Route path="/ems" element={<Protected><LazyScreen><EMS /></LazyScreen></Protected>} />
        <Route path="/alco" element={<Protected><LazyScreen><Alco /></LazyScreen></Protected>} />
        <Route path="/Taro" element={<Protected><LazyScreen><Taro /></LazyScreen></Protected>} />
        <Route path="/Ball" element={<Protected><LazyScreen><Ball /></LazyScreen></Protected>} />
        <Route path="/about" element={<Navigate to="/home" replace />} />
        <Route path="/vip" element={<Protected><LazyScreen><VIP /></LazyScreen></Protected>} />
        <Route path="/settings" element={<Protected><LazyScreen><MiniSettingsPage /></LazyScreen></Protected>} />

        <Route path="/ai" element={<Protected><StaffGate><LazyScreen><NovaAI /></LazyScreen></StaffGate></Protected>} />
        <Route path="/admin" element={<Protected><StaffGate><LazyScreen><Admin /></LazyScreen></StaffGate></Protected>} />
        <Route path="/admin/users" element={<Protected><StaffGate><LazyScreen><AdminUsers /></LazyScreen></StaffGate></Protected>} />
        <Route path="/admin/keys" element={<Protected><StaffGate><LazyScreen><AdminKeys /></LazyScreen></StaffGate></Protected>} />

        <Route path="/menu" element={<Navigate to="/home" replace />} />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </MiniAppShell>
  );
}

export default function App() {
  return (
    <HashRouter>
      <TelegramGate>
        <AppRoutes />
      </TelegramGate>
    </HashRouter>
  );
}
