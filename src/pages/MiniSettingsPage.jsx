import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Crown,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Copy,
  Check,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { fetchMe, logout } from "@/lib/auth";
import { api } from "@/lib/api";
import { hapticImpact, hapticNotification, hapticSelection } from "@/lib/telegram";

function safeRole(me) {
  const raw = [me?.role, me?.status, me?.plan, me?.tier, me?.vipStatus, me?.subscription]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  const isAdmin = raw.includes("ADMIN") || raw.includes("OWNER") || !!me?.is_admin;
  const isGold = raw.includes("GOLD");
  const isVip = isAdmin || isGold || raw.includes("VIP") || !!me?.vip_active;
  if (isAdmin) return { label: "ADMIN", icon: ShieldCheck };
  if (isGold) return { label: "GOLD", icon: Crown };
  if (isVip) return { label: "VIP", icon: Crown };
  return { label: "FREE", icon: BadgeCheck };
}

function displayName(me) {
  return String(me?.full_name || me?.telegram_username || me?.username || me?.discord_username || "Профиль").replace(/^@/, "");
}

function userId(me) {
  const id = me?.telegram_chat_id ?? me?.telegramChatId ?? me?.tg_id ?? me?.tgId ?? me?.id ?? "";
  return String(id || "").trim();
}

async function copyText(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  }
}

function Card({ children, className = "" }) {
  return <section className={`nx-soft-card ${className}`}>{children}</section>;
}

function IconBox({ children }) {
  return <div className="nx-icon-box">{children}</div>;
}

function ActionButton({ children, className = "", ...props }) {
  return (
    <button type="button" className={`nx-action-button ${className}`} {...props}>
      {children}
    </button>
  );
}

function DangerButton({ children, className = "", ...props }) {
  return (
    <button type="button" className={`nx-action-button nx-action-button--danger ${className}`} {...props}>
      {children}
    </button>
  );
}

export default function MiniSettingsPage() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState([]);
  const [activeCharacterId, setActiveCharacterId] = useState(() => localStorage.getItem("active_character_id") || "");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const role = useMemo(() => safeRole(me), [me]);
  const RoleIcon = role.icon;
  const currentUserId = useMemo(() => userId(me), [me]);
  const activeCharacter = characters.find((item) => String(item.id) === String(activeCharacterId)) || characters[0] || null;

  async function load() {
    setLoading(true);
    try {
      const profile = await fetchMe();
      setMe(profile || null);
    } catch {
      setMe(null);
    }
    try {
      const raw = await api("/characters", { method: "GET" });
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.characters) ? raw.characters : [];
      const normalized = list.map((item) => ({ id: item.id, name: item.name || item.title || "Персонаж" }));
      setCharacters(normalized);
      const saved = localStorage.getItem("active_character_id") || "";
      const exists = normalized.some((item) => String(item.id) === String(saved));
      if (!exists && normalized[0]?.id) {
        localStorage.setItem("active_character_id", String(normalized[0].id));
        setActiveCharacterId(String(normalized[0].id));
      }
    } catch {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const onMe = () => load();
    window.addEventListener("nightcore:me", onMe);
    return () => window.removeEventListener("nightcore:me", onMe);
  }, []);

  async function selectCharacter(id) {
    const value = String(id || "");
    if (!value) return;
    hapticSelection();
    setActiveCharacterId(value);
    localStorage.setItem("active_character_id", value);
    window.dispatchEvent(new CustomEvent("nightcore:character", { detail: value }));
    try {
      await api("/state/active_character_id", { method: "POST", body: { value } });
    } catch {}
  }

  async function createCharacter() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const created = await api("/characters", { method: "POST", body: { name } });
      setNewName("");
      hapticNotification("success");
      await load();
      const id = created?.id || created?.data?.id;
      if (id) await selectCharacter(id);
    } catch {
      hapticNotification("error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCharacter(id) {
    if (!id || characters.length <= 1 || busy) return;
    setBusy(true);
    try {
      try {
        await api(`/characters/${id}`, { method: "DELETE" });
      } catch {
        await api("/characters/delete", { method: "POST", body: { id } });
      }
      hapticNotification("success");
      await load();
    } catch {
      hapticNotification("error");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyId() {
    const ok = await copyText(currentUserId);
    if (ok) {
      setCopied(true);
      hapticImpact("light");
      setTimeout(() => setCopied(false), 1300);
    }
  }

  function handleLogout() {
    logout();
    try {
      localStorage.removeItem("auth_token");
    } catch {}
    window.location.reload();
  }

  return (
    <main className="nx-settings-page">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="nx-page-head"
      >
        <div>
          <p className="nx-eyebrow">ACCOUNT</p>
          <h1>Настройки</h1>
          <span>Только нужное для мобильной версии.</span>
        </div>
        <button type="button" className="nx-refresh" onClick={load} disabled={loading} aria-label="Обновить">
          <RefreshCw className={loading ? "animate-spin" : ""} size={18} />
        </button>
      </motion.header>

      <Card>
        <div className="nx-profile-row">
          <IconBox><UserRound size={22} /></IconBox>
          <div className="min-w-0 flex-1">
            <p className="nx-eyebrow">PROFILE</p>
            <h2>{displayName(me)}</h2>
            <span>{activeCharacter?.name || "Основной профиль"}</span>
          </div>
          <div className="nx-status-pill"><RoleIcon size={15} />{role.label}</div>
        </div>
        <div className="nx-id-line">
          <span>ID</span>
          <strong>{currentUserId || "—"}</strong>
          <button type="button" onClick={handleCopyId} disabled={!currentUserId}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </Card>

      <Card>
        <div className="nx-section-title">
          <div>
            <p className="nx-eyebrow">CHARACTERS</p>
            <h2>Персонажи</h2>
          </div>
          {busy ? <RefreshCw className="animate-spin text-white/45" size={18} /> : null}
        </div>

        <div className="nx-character-list">
          {characters.map((character) => {
            const active = String(character.id) === String(activeCharacterId);
            return (
              <div className={`nx-character ${active ? "is-active" : ""}`} key={character.id}>
                <button type="button" onClick={() => selectCharacter(character.id)}>
                  <span>{character.name}</span>
                  <small>{active ? "Активен" : "Нажми, чтобы выбрать"}</small>
                </button>
                <button
                  type="button"
                  className="nx-delete"
                  disabled={busy || characters.length <= 1}
                  onClick={() => deleteCharacter(character.id)}
                  aria-label="Удалить персонажа"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          {!loading && characters.length === 0 ? <div className="nx-empty-small">Персонажей пока нет.</div> : null}
        </div>

        <div className="nx-new-character">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && createCharacter()}
            placeholder="Имя персонажа"
          />
          <ActionButton onClick={createCharacter} disabled={!newName.trim() || busy}>
            <Plus size={17} /> Создать
          </ActionButton>
        </div>
      </Card>

      <Card>
        <div className="nx-section-title">
          <div>
            <p className="nx-eyebrow">SESSION</p>
            <h2>Выход</h2>
            <span>Сбросит текущий вход на этом устройстве.</span>
          </div>
        </div>
        <DangerButton onClick={handleLogout}>
          <LogOut size={17} /> Выйти из аккаунта
        </DangerButton>
      </Card>
    </main>
  );
}
