import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Clock3,
  PackageOpen,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "nx_profit_calc_v1";
const LEGACY_STORAGE_KEY = "nx_calc_v6";

function loadOperations() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "[]";
    const raw = JSON.parse(stored);
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item) => {
        if (item?.type === "income") {
          return {
            id: item.id || `${Date.now()}-${Math.random()}`,
            type: "income",
            name: item.name || item.note || item.cat || "Доход",
            amount: Number(item.amount) || 0,
            date: item.date || getDateLabel(),
          };
        }

        if (item?.type === "resale") {
          return {
            id: item.id || `${Date.now()}-${Math.random()}`,
            type: "resale",
            name: item.name || "Без названия",
            buy: Number(item.buy) || 0,
            sell: item.sell === null || item.sell === undefined || item.sell === "" ? null : Number(item.sell),
            status: item.status === "sold" ? "sold" : "pending",
            date: item.date || getDateLabel(),
          };
        }

        // Подхватывает старые записи из предыдущего Calculator.jsx как товар «в работе».
        if (item?.type === "expense") {
          return {
            id: item.id || `${Date.now()}-${Math.random()}`,
            type: "resale",
            name: item.note || item.cat || "Покупка",
            buy: Number(item.amount) || 0,
            sell: null,
            status: "pending",
            date: item.date || getDateLabel(),
          };
        }

        return null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveOperations(operations) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(operations));
  } catch {
    // localStorage может быть недоступен в приватном режиме — интерфейс всё равно продолжит работать.
  }
}

function getDateLabel() {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(new Date())
    .replace(".", "");
}

function parseAmount(value) {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function money(value, showSign = false) {
  const number = Number(value) || 0;
  const sign = showSign && number > 0 ? "+" : number < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(number)).toLocaleString("ru-RU")}`;
}

function getStats(operations) {
  return operations.reduce(
    (stats, operation) => {
      if (operation.type === "income") {
        stats.income += operation.amount;
        stats.balance += operation.amount;
        return stats;
      }

      stats.expense += operation.buy;

      if (operation.status === "sold" && operation.sell !== null) {
        const profit = operation.sell - operation.buy;
        stats.income += Math.max(0, profit);
        stats.balance += profit;
      } else {
        stats.pending += 1;
        stats.balance -= operation.buy;
      }

      return stats;
    },
    { income: 0, expense: 0, pending: 0, balance: 0 }
  );
}

function Sheet({ children, onClose, open, modalKey }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={modalKey}
          className="nx-profit__modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="nx-profit__backdrop"
            aria-label="Закрыть окно"
            onClick={onClose}
          />
          <motion.section
            className="nx-profit__sheet"
            role="dialog"
            aria-modal="true"
            initial={{ y: "105%" }}
            animate={{ y: 0 }}
            exit={{ y: "105%" }}
            transition={{ type: "spring", stiffness: 355, damping: 31, mass: 0.82 }}
          >
            <div className="nx-profit__grip" />
            <button className="nx-profit__close" type="button" onClick={onClose} aria-label="Закрыть">
              <X size={16} strokeWidth={2.4} />
            </button>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AmountField({ value, onChange, label, placeholder = "0", disabled = false }) {
  return (
    <label className="nx-profit__field">
      <span>{label}</span>
      <div className={`nx-profit__amount-wrap${disabled ? " is-disabled" : ""}`}>
        <b>$</b>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value.replace(/[^\d.,\s]/g, ""))}
          placeholder={placeholder}
        />
      </div>
    </label>
  );
}

export default function Calculator() {
  const [operations, setOperations] = useState(loadOperations);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [addType, setAddType] = useState("income");
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const stats = useMemo(() => getStats(operations), [operations]);
  const editOperation = useMemo(
    () => operations.find((operation) => operation.id === editing?.id) || null,
    [editing, operations]
  );

  useEffect(() => {
    saveOperations(operations);
  }, [operations]);

  const updateOperations = (updater) => {
    setOperations((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return next;
    });
  };

  const openAdd = () => {
    setAddType("income");
    setAddName("");
    setAddAmount("");
    setIsAddOpen(true);
  };

  const closeAdd = () => setIsAddOpen(false);

  const addOperation = () => {
    const amount = parseAmount(addAmount);
    const name = addName.trim();
    if (!name || amount <= 0) return;

    const operation =
      addType === "income"
        ? {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: "income",
            name,
            amount,
            date: getDateLabel(),
          }
        : {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: "resale",
            name,
            buy: amount,
            sell: null,
            status: "pending",
            date: getDateLabel(),
          };

    updateOperations((current) => [operation, ...current]);
    closeAdd();
  };

  const openEdit = (operation) => {
    setEditing({ id: operation.id });
    setEditName(operation.name);
    setEditAmount(
      operation.type === "income"
        ? String(operation.amount || "")
        : operation.sell === null || operation.sell === undefined
          ? ""
          : String(operation.sell)
    );
  };

  const closeEdit = () => {
    setEditing(null);
    setEditName("");
    setEditAmount("");
  };

  const saveEdit = () => {
    if (!editOperation) return;
    const name = editName.trim();
    const amount = parseAmount(editAmount);
    if (!name || amount <= 0) return;

    updateOperations((current) =>
      current.map((operation) => {
        if (operation.id !== editOperation.id) return operation;

        if (operation.type === "income") {
          return { ...operation, name, amount };
        }

        return {
          ...operation,
          name,
          sell: amount,
          status: "sold",
        };
      })
    );
    closeEdit();
  };

  const deleteOperation = () => {
    if (!editOperation) return;
    updateOperations((current) => current.filter((operation) => operation.id !== editOperation.id));
    closeEdit();
  };

  const saleAmount = parseAmount(editAmount);
  const saleProfit = editOperation?.type === "resale" && saleAmount > 0 ? saleAmount - editOperation.buy : 0;
  const canAdd = addName.trim().length > 0 && parseAmount(addAmount) > 0;
  const canSaveEdit = editName.trim().length > 0 && parseAmount(editAmount) > 0;

  return (
    <main className="nx-profit">
      <style>{styles}</style>

      <div className="nx-profit__shell">
        <header className="nx-profit__header">
          <span className="nx-profit__eyebrow">Чистый профит</span>
          <div className="nx-profit__balance-row">
            <h1 className={stats.balance >= 0 ? "is-positive" : "is-negative"}>{money(stats.balance, true)}</h1>
          </div>

          <div className="nx-profit__stats">
            <article className="nx-profit__stat is-income">
              <span>Доход</span>
              <strong>{money(stats.income)}</strong>
            </article>
            <article className="nx-profit__stat is-expense">
              <span>Расход</span>
              <strong>{money(stats.expense)}</strong>
            </article>
            <article className="nx-profit__stat is-pending">
              <span>В работе</span>
              <strong>{stats.pending}</strong>
            </article>
          </div>
        </header>

        <section className="nx-profit__history" aria-label="История операций">
          <h2>История операций</h2>
          <div className="nx-profit__list">
            {operations.length === 0 ? (
              <div className="nx-profit__empty">
                <span className="nx-profit__empty-icon"><PackageOpen size={30} /></span>
                <b>Пока пусто</b>
                <p>Добавь первую операцию —<br />доход или вещь на перепродажу.</p>
              </div>
            ) : (
              operations.map((operation) => {
                const isIncome = operation.type === "income";
                const isPending = operation.type === "resale" && operation.status !== "sold";
                const profit = operation.type === "resale" && operation.sell !== null ? operation.sell - operation.buy : 0;
                const iconClass = isIncome ? "is-income" : isPending ? "is-pending" : profit >= 0 ? "is-income" : "is-expense";

                return (
                  <motion.button
                    type="button"
                    className="nx-profit__operation"
                    key={operation.id}
                    onClick={() => openEdit(operation)}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <span className={`nx-profit__operation-icon ${iconClass}`}>
                      {isIncome ? <ArrowUpRight size={19} /> : isPending ? <Clock3 size={18} /> : profit >= 0 ? <ArrowUpRight size={19} /> : <ArrowDownRight size={19} />}
                    </span>

                    <span className="nx-profit__operation-info">
                      <b>{operation.name}</b>
                      <small>
                        {isIncome
                          ? `${operation.date} · Доход`
                          : isPending
                            ? <>{operation.date} <em>в работе</em></>
                            : `${operation.date} · ${money(operation.buy)} → ${money(operation.sell)}`}
                      </small>
                    </span>

                    <span className="nx-profit__operation-value">
                      <strong className={isIncome || (!isPending && profit >= 0) ? "is-positive" : isPending ? "is-neutral" : "is-negative"}>
                        {isIncome ? money(operation.amount, true) : isPending ? money(operation.buy) : money(profit, true)}
                      </strong>
                      <small>{isIncome ? "изменить" : isPending ? "продать →" : "изменить"}</small>
                    </span>
                  </motion.button>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="nx-profit__fab-wrap">
        <button type="button" className="nx-profit__fab" onClick={openAdd}>
          <Plus size={19} strokeWidth={2.6} />
          Добавить операцию
        </button>
      </div>

      <Sheet open={isAddOpen} onClose={closeAdd} modalKey="add-operation">
            <h3>Новая операция</h3>

            <div className="nx-profit__toggle" role="tablist" aria-label="Тип операции">
              <button
                type="button"
                className={addType === "income" ? "is-income" : ""}
                onClick={() => setAddType("income")}
              >
                Доход
              </button>
              <button
                type="button"
                className={addType === "resale" ? "is-expense" : ""}
                onClick={() => setAddType("resale")}
              >
                Расход
              </button>
            </div>

            <label className="nx-profit__field">
              <span>{addType === "income" ? "Источник дохода" : "Название вещи"}</span>
              <input
                type="text"
                value={addName}
                onChange={(event) => setAddName(event.target.value)}
                placeholder={addType === "income" ? "Например: Фриланс-проект" : "Например: iPhone 13"}
                autoFocus
              />
            </label>

            <AmountField
              label={addType === "income" ? "Сумма" : "Сумма покупки"}
              value={addAmount}
              onChange={setAddAmount}
            />

            <button type="button" className="nx-profit__primary" disabled={!canAdd} onClick={addOperation}>
              <Plus size={18} />
              Сохранить
            </button>
      </Sheet>

      <Sheet open={Boolean(editOperation)} onClose={closeEdit} modalKey="edit-operation">
        {editOperation && (
          <>
            {editOperation.type === "income" ? (
              <>
                <h3>Редактировать доход</h3>
                <label className="nx-profit__field">
                  <span>Источник дохода</span>
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    placeholder="Например: Фриланс-проект"
                    autoFocus
                  />
                </label>
                <AmountField label="Сумма" value={editAmount} onChange={setEditAmount} />
              </>
            ) : (
              <>
                <h3>{editOperation.status === "sold" ? "Редактировать продажу" : "Продажа"}</h3>
                <label className="nx-profit__field">
                  <span>Название вещи</span>
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    placeholder="Например: iPhone 13"
                  />
                </label>
                <AmountField label="Куплено за" value={money(editOperation.buy).replace("$", "")} disabled />
                <AmountField label="Сумма продажи" value={editAmount} onChange={setEditAmount} />

                {saleAmount > 0 && (
                  <div className="nx-profit__preview">
                    <div><span>Покупка</span><b>{money(editOperation.buy)}</b></div>
                    <div><span>Продажа</span><b>{money(saleAmount)}</b></div>
                    <strong className={saleProfit >= 0 ? "is-positive" : "is-negative"}>
                      {saleProfit >= 0 ? "Прибыль " : "Убыток "}{money(saleProfit, true)}
                    </strong>
                  </div>
                )}
              </>
            )}

            <button type="button" className="nx-profit__primary" disabled={!canSaveEdit} onClick={saveEdit}>
              {editOperation.type === "resale" && editOperation.status !== "sold" ? <Check size={18} /> : <Save size={18} />}
              {editOperation.type === "resale" && editOperation.status !== "sold" ? "Подтвердить продажу" : "Сохранить изменения"}
            </button>
            <button type="button" className="nx-profit__delete" onClick={deleteOperation}>
              <Trash2 size={16} />
              Удалить операцию
            </button>
          </>
        )}
      </Sheet>
    </main>
  );
}

const styles = `
  .nx-profit {
    --nx-bg: #13151a;
    --nx-card: #1c1f26;
    --nx-card-2: #22262f;
    --nx-line: #2b2f39;
    --nx-text: #ecedf0;
    --nx-muted: #8b919e;
    --nx-green: #3ddc97;
    --nx-green-dim: #1e3a30;
    --nx-red: #ff6b7a;
    --nx-red-dim: #3a2024;
    --nx-amber: #ffb648;
    width: 100%;
    min-height: 100%;
    color: var(--nx-text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .nx-profit *, .nx-profit *::before, .nx-profit *::after { box-sizing: border-box; }
  .nx-profit button, .nx-profit input { font: inherit; }
  .nx-profit button { -webkit-tap-highlight-color: transparent; }

  .nx-profit__shell {
    width: min(100%, 430px);
    min-height: max(100vh, 620px);
    margin: 0 auto;
    padding: 22px 0 122px;
  }

  .nx-profit__header { padding: 0 18px 14px; }
  .nx-profit__eyebrow {
    display: block;
    color: var(--nx-muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .085em;
    text-transform: uppercase;
  }

  .nx-profit__balance-row { margin-top: 7px; }
  .nx-profit__balance-row h1 {
    margin: 0;
    font-size: clamp(34px, 10vw, 42px);
    line-height: 1;
    letter-spacing: -0.055em;
    font-weight: 800;
    font-family: "Arial Rounded MT Bold", Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .nx-profit .is-positive { color: var(--nx-green); }
  .nx-profit .is-negative { color: var(--nx-red); }
  .nx-profit .is-neutral { color: var(--nx-text); }

  .nx-profit__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin-top: 17px; }
  .nx-profit__stat { min-width: 0; padding: 11px 12px; border-radius: 14px; background: var(--nx-card); }
  .nx-profit__stat span { display: block; overflow: hidden; color: var(--nx-muted); font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .nx-profit__stat strong { display: block; overflow: hidden; margin-top: 4px; font-size: 15px; font-weight: 800; letter-spacing: -.055em; text-overflow: ellipsis; white-space: nowrap; }
  .nx-profit__stat.is-income strong { color: var(--nx-green); }
  .nx-profit__stat.is-expense strong { color: var(--nx-red); }
  .nx-profit__stat.is-pending strong { color: var(--nx-amber); }

  .nx-profit__history h2 { margin: 4px 18px 9px; color: var(--nx-muted); font-size: 12px; font-weight: 800; letter-spacing: .075em; text-transform: uppercase; }
  .nx-profit__list { display: flex; flex-direction: column; gap: 9px; padding: 0 14px; }

  .nx-profit__operation {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    gap: 12px;
    padding: 13px 14px;
    border: 0;
    border-radius: 18px;
    background: var(--nx-card);
    color: var(--nx-text);
    cursor: pointer;
    text-align: left;
    transition: transform .16s ease, background .16s ease;
  }
  .nx-profit__operation:hover { background: #20242d; }
  .nx-profit__operation:active { transform: scale(.985); }

  .nx-profit__operation-icon { display: grid; width: 42px; height: 42px; flex: 0 0 42px; place-items: center; border-radius: 12px; }
  .nx-profit__operation-icon.is-income { color: var(--nx-green); background: var(--nx-green-dim); }
  .nx-profit__operation-icon.is-expense { color: var(--nx-red); background: var(--nx-red-dim); }
  .nx-profit__operation-icon.is-pending { color: var(--nx-amber); background: #3a3320; }

  .nx-profit__operation-info { display: block; min-width: 0; flex: 1; }
  .nx-profit__operation-info > b { display: block; overflow: hidden; color: var(--nx-text); font-size: 14.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .nx-profit__operation-info small { display: flex; align-items: center; min-height: 17px; gap: 6px; overflow: hidden; margin-top: 2px; color: var(--nx-muted); font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
  .nx-profit__operation-info em { display: inline-block; padding: 2px 7px; border-radius: 99px; background: #3a3320; color: var(--nx-amber); font-size: 9px; font-style: normal; font-weight: 800; letter-spacing: .045em; text-transform: uppercase; }
  .nx-profit__operation-value { display: block; flex: 0 0 auto; min-width: 65px; text-align: right; }
  .nx-profit__operation-value strong { display: block; font-size: 14px; font-weight: 800; letter-spacing: -.04em; white-space: nowrap; }
  .nx-profit__operation-value small { display: block; margin-top: 3px; color: var(--nx-muted); font-size: 11px; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; white-space: nowrap; }

  .nx-profit__empty { padding: 58px 24px; color: var(--nx-muted); text-align: center; }
  .nx-profit__empty-icon { display: grid; width: 58px; height: 58px; place-items: center; margin: 0 auto 12px; border-radius: 18px; background: var(--nx-card); color: var(--nx-amber); }
  .nx-profit__empty b { display: block; color: var(--nx-text); font-size: 15px; }
  .nx-profit__empty p { margin: 6px 0 0; font-size: 13px; line-height: 1.5; }

  .nx-profit__fab-wrap { position: fixed; z-index: 32; right: 0; bottom: max(22px, env(safe-area-inset-bottom)); left: 0; width: min(calc(100% - 36px), 394px); margin: auto; }
  .nx-profit__fab { display: flex; align-items: center; justify-content: center; width: 100%; gap: 8px; padding: 16px; border: 0; border-radius: 18px; background: var(--nx-text); box-shadow: 0 14px 32px rgba(0, 0, 0, .42); color: var(--nx-bg); cursor: pointer; font-size: 15px; font-weight: 800; transition: transform .16s ease, box-shadow .16s ease; }
  .nx-profit__fab:hover { box-shadow: 0 18px 38px rgba(0, 0, 0, .52); }
  .nx-profit__fab:active { transform: scale(.975); }

  .nx-profit__modal-root { position: fixed; z-index: 60; inset: 0; }
  .nx-profit__backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: rgba(8, 9, 12, .68); backdrop-filter: blur(3px); cursor: default; }
  .nx-profit__sheet { position: absolute; z-index: 1; right: 0; bottom: 0; left: 0; width: min(100%, 430px); max-height: min(88vh, 700px); margin: auto; overflow-y: auto; padding: 9px 18px calc(25px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; background: var(--nx-card); box-shadow: 0 -16px 42px rgba(0, 0, 0, .28); }
  .nx-profit__sheet::-webkit-scrollbar { display: none; }
  .nx-profit__grip { width: 39px; height: 4px; margin: 6px auto 16px; border-radius: 999px; background: var(--nx-line); }
  .nx-profit__sheet h3 { margin: 0 40px 18px 0; color: var(--nx-text); font-size: 19px; font-weight: 800; letter-spacing: -.035em; }
  .nx-profit__close { position: absolute; top: 16px; right: 16px; display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 50%; background: var(--nx-card-2); color: var(--nx-muted); cursor: pointer; }

  .nx-profit__toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 20px; padding: 4px; border-radius: 14px; background: var(--nx-card-2); }
  .nx-profit__toggle button { padding: 11px 0; border: 0; border-radius: 11px; background: transparent; color: var(--nx-muted); cursor: pointer; font-size: 14px; font-weight: 800; transition: background .2s ease, color .2s ease; }
  .nx-profit__toggle button.is-income { background: var(--nx-green-dim); color: var(--nx-green); }
  .nx-profit__toggle button.is-expense { background: var(--nx-red-dim); color: var(--nx-red); }

  .nx-profit__field { display: block; margin: 0 0 16px; }
  .nx-profit__field > span { display: block; margin-bottom: 8px; color: var(--nx-muted); font-size: 11px; font-weight: 800; letter-spacing: .055em; text-transform: uppercase; }
  .nx-profit__field > input, .nx-profit__amount-wrap { width: 100%; border: 1.5px solid var(--nx-line); border-radius: 14px; background: var(--nx-card-2); color: var(--nx-text); outline: none; transition: border-color .18s ease, box-shadow .18s ease; }
  .nx-profit__field > input { padding: 13px 14px; font-size: 15px; font-weight: 500; }
  .nx-profit__field > input::placeholder, .nx-profit__amount-wrap input::placeholder { color: #6f7580; opacity: 1; }
  .nx-profit__field > input:focus, .nx-profit__amount-wrap:focus-within { border-color: var(--nx-text); box-shadow: 0 0 0 3px rgba(236, 237, 240, .05); }

  .nx-profit__amount-wrap { display: flex; align-items: center; gap: 6px; padding: 0 16px; }
  .nx-profit__amount-wrap b { color: var(--nx-muted); font-size: 20px; font-weight: 800; letter-spacing: -.05em; }
  .nx-profit__amount-wrap input { width: 100%; min-width: 0; padding: 14px 0; border: 0; background: transparent; color: var(--nx-text); outline: none; font-size: 22px; font-weight: 800; letter-spacing: -.055em; }
  .nx-profit__amount-wrap.is-disabled { opacity: .58; }
  .nx-profit__amount-wrap.is-disabled input { cursor: default; }

  .nx-profit__preview { margin: 0 0 18px; padding: 14px 16px; border-radius: 14px; background: var(--nx-card-2); }
  .nx-profit__preview > div { display: flex; align-items: center; justify-content: space-between; color: var(--nx-muted); font-size: 13px; }
  .nx-profit__preview > div + div { margin-top: 6px; }
  .nx-profit__preview b { color: var(--nx-text); font-weight: 700; }
  .nx-profit__preview > strong { display: block; margin-top: 7px; font-size: 19px; font-weight: 800; letter-spacing: -.045em; }

  .nx-profit__primary, .nx-profit__delete { display: flex; align-items: center; justify-content: center; width: 100%; gap: 8px; border: 0; cursor: pointer; }
  .nx-profit__primary { padding: 16px; border-radius: 14px; background: var(--nx-text); color: var(--nx-bg); font-size: 15px; font-weight: 800; transition: transform .15s ease, opacity .15s ease; }
  .nx-profit__primary:disabled { opacity: .36; cursor: not-allowed; }
  .nx-profit__primary:not(:disabled):active { transform: scale(.98); }
  .nx-profit__delete { margin-top: 8px; padding: 11px; background: transparent; color: var(--nx-red); font-size: 13px; font-weight: 700; }

  @media (min-width: 760px) {
    .nx-profit__shell { min-height: calc(100vh - 42px); margin-top: 18px; margin-bottom: 18px; border-radius: 25px; background: rgba(19, 21, 26, .78); box-shadow: 0 22px 52px rgba(0, 0, 0, .16); }
  }

  @media (max-width: 390px) {
    .nx-profit__shell { padding-top: 18px; }
    .nx-profit__header { padding-right: 14px; padding-left: 14px; }
    .nx-profit__stats { gap: 7px; }
    .nx-profit__stat { padding: 10px; }
    .nx-profit__stat strong { font-size: 13px; }
    .nx-profit__history h2 { margin-right: 14px; margin-left: 14px; }
    .nx-profit__list { padding-right: 10px; padding-left: 10px; }
    .nx-profit__operation { gap: 10px; padding: 12px; }
    .nx-profit__operation-icon { width: 39px; height: 39px; flex-basis: 39px; }
  }
`;
