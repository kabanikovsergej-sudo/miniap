import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Ball() {
  const [tab, setTab] = useState("effects");
  const navigate = useNavigate();

  const effects = useMemo(
    () => [
      { q: "Ровные ли сегодня дороги?", pos: "Расход бензина -50%", neg: "Расход бензина +100%", icon: "🚗" },
      { q: "Уважают ли меня в моем клубе?", pos: "Репутация в клубах x2", neg: "Репутация в клубах /2", icon: "💎" },
      { q: "На подработках сегодня хорошо платят?", pos: "Зарплата на работах +25%", neg: "Зарплата на работах -25%", icon: "💸" },
      { q: "Вкусно ли я сегодня поем?", pos: "Голод отключен", neg: "Сытость = 0 (1 раз)", icon: "🍕" },
      { q: "Буду ли я сегодня внимателен?", pos: "Шанс семян/обезбол. выше", neg: "Шанс семян/обезбол. ниже", icon: "💊" },
      { q: "Крепкое ли сегодня оружие?", pos: "Износ оружия отключен", neg: "Износ оружия x2", icon: "🔫" },
      { q: "Пойдет ли сегодня торговля?", pos: "Объявления 5Vito -20%", neg: "Объявления 5Vito +20%", icon: "📈" },
      { q: "Сегодня хороший улов?", pos: "Рыбалка легче (-1 круг)", neg: "Рыбалка сложнее (+1 круг)", icon: "🎣" },
      { q: "Смена будет продуктивной?", pos: "Пейдей фракции +25%", neg: "Пейдей фракции -25%", icon: "🏢" }
    ],
    []
  );

  const noEffects = useMemo(
    () => [
      "Сегодня — мой день?",
      "Все ли предрешено?",
      "Мне повезет сегодня?",
      "Улыбнется ли мне случай?",
      "Меня ждет успех сегодня?",
      "Судьба услышит мой шепот?",
      "Есть ли смысл в сегодняшнем дне?",
      "Молчание — это знак?",
      "Я встречу нового друга сегодня?",
      "Стоит ли доверять интуиции?",
      "Видит ли кто-то, что вижу я?"
    ],
    []
  );

  const goBack = () => {
    if (navigate) return navigate(-1);
    if (window.history.length > 1) return window.history.back();
    window.location.href = "/";
  };

  return (
    <div className="fortune">
      <style>{styles}</style>


      <header className="top">
        <button
          type="button"
          onClick={goBack}
          className={[
            "inline-flex items-center gap-2 h-10 px-4 rounded-xl",
            "border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/15",
            "backdrop-blur-md shadow-[0_10px_24px_rgba(0,0,0,0.30)]",
            "text-white/90 hover:text-white transition-all",
          ].join(" ")}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-semibold">Назад</span>
        </button>


        <div className="titles">
          <h1>Предсказания</h1>
        </div>

        <div className="tabs mt-3">
          <button
            className={tab === "effects" ? "active" : ""}
            onClick={() => setTab("effects")}
          >
            С эффектом
          </button>
          <button
            className={tab === "no" ? "active" : ""}
            onClick={() => setTab("no")}
          >
            Без эффекта
          </button>
        </div>
      </header>

      {tab === "effects" ? (
        <div className="grid">
          {effects.map((e, i) => (
            <div className="card" key={i}>
              <div className="cardTop">
                <span className="icon">{e.icon}</span>
                <span className="question">{e.q}</span>
              </div>

              <div className="rows">
                <div className="row plus">+ {e.pos}</div>
                <div className="row minus">− {e.neg}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="list">
          {noEffects.map((q, i) => (
            <button className="listItem" key={i}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = `
.fortune {
  color: #f1f1f1;
  padding: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.header {
  display: grid;
  gap: 16px;
}

.back {
  background: none;
  border: none;
  color: #f1f1f1;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
}

.titles h1 {
  margin: 0;
  font-size: 22px;
}

.titles p {
  margin: 4px 0 0;
  opacity: .6;
}

.tabs {
  display: flex;
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 10px;
  overflow: hidden;
}

.tabs button {
  flex: 1;
  background: none;
  border: none;
  padding: 10px;
  color: #aaa;
  cursor: pointer;
}

.tabs button.active {
  background: rgba(255,255,255,.08);
  color: #fff;
}

.fortune .grid{
  display:grid;
  gap:14px;
  margin-top:24px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}


.card {
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 14px;
  padding: 14px;
}

.cardTop {
  display: flex;
  gap: 10px;
  font-weight: 600;
}

.icon {
  font-size: 20px;
}

.rows {
  margin-top: 12px;
  display: grid;
  gap: 6px;
  font-size: 14px;
}

.plus { color: #4ade80; }
.minus { color: #f87171; }

.list {
  margin-top: 24px;
  display: grid;
  gap: 10px;
}

.listItem {
  background: none;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
  padding: 12px;
  color: #ddd;
  text-align: left;
  cursor: pointer;
}
`;
