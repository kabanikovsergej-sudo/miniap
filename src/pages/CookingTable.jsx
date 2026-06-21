import React, { useMemo, useState } from "react";
import { Search, ArrowLeft, Utensils, Info, Smile, Zap, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * ВАЖНО:
 * - Здесь ТОЛЬКО список, который ты скинул (без колонки "Цена")
 * - Если в строке не было значений Сыт./Настр./Сила — ставлю null и в таблице показывается "—"
 */
const cookingData = [
  { name: "Фруктовый салат", recipe: "Фрукты + Нож", satiety: 15, mood: 40, strength: -3 },
  { name: "Овощной салат", recipe: "Овощи + Нож", satiety: 10, mood: 5, strength: 0 },
  { name: "Рыбный фарш", recipe: "Любая рыба (кроме лосося, тунца, фугу) + Нож", satiety: null, mood: null, strength: null },
  { name: "Мясной фарш", recipe: "Мясо + Нож", satiety: null, mood: null, strength: null },

  { name: "Сашими из лосося", recipe: "Лосось + Нож", satiety: 10, mood: 30, strength: -1 },
  { name: "Сашими из тунца", recipe: "Тунец + Нож", satiety: 10, mood: 30, strength: -1 },
  { name: "Сашими из фугу", recipe: "Фугу + Нож", satiety: 20, mood: 60, strength: 0 },

  { name: "Жареная рыба", recipe: "Любая рыба + Огонь", satiety: null, mood: null, strength: null },
  { name: "Сухая рыбная котлета", recipe: "Рыбный фарш + Огонь", satiety: 10, mood: 0, strength: -3 },
  { name: "Сухая мясная котлета", recipe: "Мясной фарш + Огонь", satiety: 10, mood: 0, strength: -3 },

  { name: "Яичница", recipe: "Яйцо + Огонь", satiety: 15, mood: 5, strength: -3 },
  { name: "Хлеб", recipe: "Тесто + Огонь", satiety: 10, mood: 0, strength: -2 },
  { name: "Карамель", recipe: "Сахар + Огонь", satiety: 5, mood: 10, strength: -5 },
  { name: "Стейк", recipe: "Мясо + Огонь", satiety: 25, mood: 20, strength: -8 },

  { name: "Масло", recipe: "Молоко + Венчик", satiety: 5, mood: 0, strength: -1 },
  { name: "Сыр", recipe: "Молоко + Венчик + Огонь", satiety: 15, mood: 5, strength: -1 },

  { name: "Фруктовый смузи", recipe: "Фрукты + Вода + Венчик", satiety: 20, mood: 50, strength: -7 },
  { name: "Овощной смузи", recipe: "Овощи + Вода + Венчик", satiety: 20, mood: 35, strength: 0 },
  { name: "Молочный коктейль", recipe: "Мороженое + Молоко + Венчик", satiety: 20, mood: 70, strength: -15 },

  { name: "Ролл с Лососем", recipe: "Лосось + Сваренный рис + Нож", satiety: 25, mood: 20, strength: -3 },
  { name: "Ролл с Тунцом", recipe: "Тунец + Сваренный рис + Нож", satiety: 25, mood: 20, strength: -3 },
  { name: "Овощной ролл", recipe: "Овощи + Сваренный рис + Нож", satiety: 20, mood: 10, strength: -2 },

  { name: "Салат Капрезе", recipe: "Сыр + Овощи + Нож", satiety: 15, mood: 10, strength: 0 },

  { name: "Рыбная котлета", recipe: "Рыбный фарш + Масло + Огонь", satiety: 25, mood: 10, strength: -10 },
  { name: "Мясная котлета", recipe: "Мясной фарш + Масло + Огонь", satiety: 25, mood: 10, strength: -10 },

  { name: "Сваренный рис", recipe: "Рисовая крупа + Вода + Огонь", satiety: 10, mood: 0, strength: -2 },

  { name: "Рыба с рисом", recipe: "Любая рыба + Сваренный рис + Огонь", satiety: 40, mood: 10, strength: -5 },
  { name: "Рыба с овощами", recipe: "Любая рыба + Овощи + Огонь", satiety: 35, mood: 15, strength: -3 },
  { name: "Мясо с овощами", recipe: "Мясо + Овощи + Огонь", satiety: 40, mood: 10, strength: -3 },

  { name: "Овощной суп", recipe: "Бульон + Овощи + Огонь", satiety: 25, mood: 10, strength: -1 },

  { name: "Макароны с сыром", recipe: "Макароны + Сыр + Огонь", satiety: 20, mood: 25, strength: -15 },

  { name: "Бульон", recipe: "Мясо + Вода + Огонь", satiety: 10, mood: 0, strength: -2 },

  { name: "Стейк с рисом", recipe: "Сваренный рис + Стейк + Огонь", satiety: 50, mood: 30, strength: -10 },

  { name: "Омлет", recipe: "Яйцо + Молоко + Венчик + Огонь", satiety: 20, mood: 10, strength: -4 },
  { name: "Суфле", recipe: "Яйцо + Сахар + Венчик + Огонь", satiety: 20, mood: 80, strength: -2 },

  { name: "Сэндвич с сыром", recipe: "Сыр + Хлеб + Нож + Огонь", satiety: 10, mood: 20, strength: -9 },

  { name: "Макароны", recipe: "Тесто + Вода + Нож + Огонь", satiety: 10, mood: 0, strength: -2 },

  { name: "Фруктовый лед", recipe: "Фрукты + Лед + Сахар + Венчик", satiety: 10, mood: 65, strength: -7 },

  { name: "Тесто", recipe: "Мука + Яйцо + Вода + Венчик", satiety: null, mood: null, strength: null },

  { name: "Пельмени", recipe: "Мясной фарш + Тесто + Вода + Огонь", satiety: 45, mood: 45, strength: -15 },

  { name: "Яичница с беконом", recipe: "Мясо + Яйцо + Масло + Огонь", satiety: 25, mood: 15, strength: -6 },

  { name: "Компот", recipe: "Фрукты + Сахар + Вода + Огонь", satiety: 5, mood: 50, strength: -7 },

  { name: "Борщ", recipe: "Мясо + Овощи + Бульон + Огонь", satiety: 50, mood: 40, strength: -13 },

  { name: "Жаренная на масле рыба с овощами", recipe: "Любая рыба + Овощи + Масло + Огонь", satiety: 60, mood: 50, strength: -15 },
  { name: "Жаренное на масле мясо с овощами", recipe: "Мясо + Овощи + Масло + Огонь", satiety: 60, mood: 50, strength: -15 },

  { name: "Рагу", recipe: "Мясо + Овощи + Вода + Огонь", satiety: 60, mood: 45, strength: -20 },

  { name: "Крем-брюле", recipe: "Молоко + Сахар + Яйцо + Огонь", satiety: 10, mood: 80, strength: -7 },

  { name: "Стейк с фруктовым соусом", recipe: "Мясо + Фрукты + Сахар + Огонь", satiety: 60, mood: 50, strength: -10 },
  { name: "Рыба с фруктовым соусом", recipe: "Любая рыба + Фрукты + Сахар + Огонь", satiety: 60, mood: 50, strength: -10 },

  { name: "Ризотто", recipe: "Рисовая крупа + Бульон + Сыр + Огонь", satiety: 40, mood: 20, strength: -20 },

  { name: "Мальма в сливочном соусе", recipe: "Мальма + Овощи + Молоко + Огонь", satiety: 75, mood: 75, strength: -13 },

  { name: "Мясо по-французски", recipe: "Мясо + Овощи + Сыр + Огонь", satiety: 60, mood: 40, strength: -15 },

  { name: "Картофельное пюре", recipe: "Овощи + Масло + Молоко + Венчик + Огонь", satiety: 10, mood: 10, strength: -5 },

  { name: "Овощной омлет", recipe: "Овощи + Яйцо + Молоко + Венчик + Огонь", satiety: 25, mood: 10, strength: -4 },

  { name: "Чизкейк", recipe: "Тесто + Сыр + Сахар + Венчик + Огонь", satiety: 30, mood: 60, strength: -15 },

  { name: "Мороженое", recipe: "Яйцо + Молоко + Сахар + Лед + Венчик", satiety: 10, mood: 70, strength: -15 },

  { name: "Пицца", recipe: "Мясо + Тесто + Овощи + Сыр + Огонь", satiety: 30, mood: 50, strength: -25 },

  { name: "Паста Болоньезе", recipe: "Мясной фарш + Макароны + Овощи + Сыр + Огонь", satiety: 60, mood: 40, strength: -25 },
  { name: "Паста Карбонара", recipe: "Мясо + Макароны + Сыр + Яйцо + Огонь", satiety: 60, mood: 40, strength: -25 },
  { name: "Рамен", recipe: "Мясо + Макароны + Яйцо + Бульон + Огонь", satiety: 90, mood: 70, strength: -17 },

  { name: "Оладьи", recipe: "Яйцо + Молоко + Сахар + Мука + Венчик + Огонь", satiety: 20, mood: 20, strength: -10 },

  { name: "Лазанья", recipe: "Мясной фарш + Овощи + Молоко + Мука + Сыр + Огонь", satiety: 65, mood: 50, strength: -20 },

  { name: "Тако с мясом", recipe: "Мясной фарш + Хлеб + Овощи + Сыр + Огонь", satiety: 30, mood: 30, strength: -10 },
  { name: "Тако с рыбой", recipe: "Рыбный фарш + Хлеб + Овощи + Сыр + Огонь", satiety: 30, mood: 30, strength: -10 },

  { name: "Буррито", recipe: "Сваренный рис + Мясной фарш + Хлеб + Овощи + Сыр + Огонь", satiety: 50, mood: 50, strength: -13 },

  { name: "Оливье", recipe: "Мясо + Яйцо + Овощи + Вода + Нож + Огонь", satiety: 60, mood: 50, strength: -25 },

  { name: "Мясная котлета с пюре", recipe: "Картофельное пюре + Мясная котлета", satiety: 50, mood: 50, strength: -20 },
  { name: "Рыбная котлета с пюре", recipe: "Картофельное пюре + Рыбная котлета", satiety: 50, mood: 50, strength: -20 },

  { name: "Рыбная котлета с рисом", recipe: "Сваренный рис + Рыбная котлета", satiety: 45, mood: 40, strength: -12 },
  { name: "Мясная котлета с рисом", recipe: "Сваренный рис + Мясная котлета", satiety: 45, mood: 40, strength: -12 },

  { name: "Карамельный чизкейк", recipe: "Чизкейк + Карамель", satiety: 35, mood: 85, strength: -25 },
  { name: "Фруктовый чизкейк", recipe: "Чизкейк + Фрукты", satiety: 35, mood: 70, strength: -20 },

  { name: "Яблоко в карамели", recipe: "Фрукты + Карамель", satiety: 20, mood: 55, strength: -7 },
  { name: "Фруктовый салат с карамелью", recipe: "Фруктовый салат + Карамель", satiety: 25, mood: 60, strength: -10 },

  { name: "Карамельное мороженое", recipe: "Мороженое + Карамель", satiety: 15, mood: 80, strength: -20 },

  { name: "Карамельный молочный коктейль", recipe: "Молочный коктейль + Карамель", satiety: 25, mood: 80, strength: -20 },

  { name: "Макароны с мясной котлетой", recipe: "Макароны + Мясная котлета", satiety: 45, mood: 40, strength: -15 },
  { name: "Рыбная котлета с макаронами", recipe: "Макароны + Рыбная котлета", satiety: 45, mood: 40, strength: -15 },

  { name: "Стейк с салатом", recipe: "Стейк + Овощной салат", satiety: 45, mood: 30, strength: -8 },
  { name: "Стейк с макаронами", recipe: "Стейк + Макароны", satiety: 30, mood: 25, strength: -8 },

  { name: "Бургер", recipe: "Мясная котлета + Овощи + Хлеб", satiety: 40, mood: 0, strength: -15 },

  { name: "Стейк с фруктовым соусом и рисом", recipe: "Стейк с фруктовым соусом + Сваренный рис", satiety: 80, mood: 60, strength: -13 },
  { name: "Стейк с фруктовым соусом и пюре", recipe: "Стейк с фруктовым соусом + Картофельное пюре", satiety: 80, mood: 80, strength: -15 },

  { name: "Рыба с фруктовым соусом и рисом", recipe: "Рыба с фруктовым соусом + Сваренный рис", satiety: 80, mood: 60, strength: -13 },
  { name: "Рыба с фруктовым соусом и пюре", recipe: "Рыба с фруктовым соусом + Картофельное пюре", satiety: 80, mood: 80, strength: -15 },

  { name: "Поке", recipe: "Сваренный рис + Лосось + Овощи + Сыр", satiety: 70, mood: 50, strength: -15 },
];

function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return String(v);
}

// Вспомогательный компонент для бейджей статов
const StatBadge = ({ value, type }) => {
  if (value === null || value === undefined) {
    return <span className="text-gray-600 font-mono">—</span>;
  }

  let colorClass = "";
  let Icon = null;

  switch (type) {
    case "satiety":
      // Оранжевый для еды
      colorClass = "text-orange-300 bg-orange-500/10 border-orange-500/20";
      Icon = Utensils;
      break;
    case "mood":
      // Голубой/Фиолетовый для настроения
      colorClass = "text-sky-300 bg-sky-500/10 border-sky-500/20";
      Icon = Smile;
      break;
    case "strength":
      // Красный (затраты) или Зеленый (бафф)
      const isNegative = value < 0;
      colorClass = isNegative
        ? "text-rose-300 bg-rose-500/10 border-rose-500/20"
        : "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
      Icon = Zap;
      break;
    default:
      colorClass = "text-gray-300";
  }

  return (
    <div className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md border ${colorClass} min-w-[60px]`}>
      {Icon && <Icon size={12} className="opacity-70" />}
      <span className="font-mono font-medium text-xs">{value > 0 && type === 'strength' ? `+${value}` : value}</span>
    </div>
  );
};

export default function CookingTable() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cookingData;
    return cookingData.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.recipe.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="text-gray-100 p-4 flex flex-col h-full max-h-full overflow-hidden">
      
      {/* Стилизация скроллбара */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      `}</style>

      {/* Header Container */}
      <div className="mx-auto w-full max-w-6xl flex-none">
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={() => navigate("/menu")}
            className="group inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-sm font-medium text-gray-300 hover:text-white"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            Меню
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/20">
              <Utensils size={20} />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">Книга рецептов</h1>
              <div className="text-xs text-gray-400">База знаний поваров</div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Search size={18} />
          </div>
          <input
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-black/20 border border-white/10 hover:border-white/20 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 focus:outline-none transition-all text-sm placeholder:text-gray-500 text-gray-200"
            placeholder="Найти блюдо по названию или ингредиентам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table Container - Flex Grow to fill space */}
      <div className="mx-auto w-full max-w-6xl flex-1 min-h-0 relative rounded-2xl border border-white/10 bg-black/20 shadow-2xl overflow-hidden flex flex-col">
        {/* Table Header */}
        <div className="bg-white/5 border-b border-white/10 backdrop-blur-md z-10 pr-[6px]"> {/* pr-6px compensates scrollbar */}
           <div className="grid grid-cols-[2fr_3fr_100px_100px_100px] gap-4 px-6 py-3 text-[11px] uppercase tracking-wider font-semibold text-gray-400">
              <div>Блюдо</div>
              <div>Рецепт</div>
              <div className="text-center flex items-center justify-center gap-1"><Heart size={12}/> Сыт.</div>
              <div className="text-center flex items-center justify-center gap-1"><Smile size={12}/> Настр.</div>
              <div className="text-center flex items-center justify-center gap-1"><Zap size={12}/> Сила</div>
           </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto custom-scrollbar flex-1">
          {filtered.length > 0 ? (
            <div className="divide-y divide-white/5">
              {filtered.map((i, idx) => (
                <div
                  key={`${i.name}-${idx}`}
                  className="grid grid-cols-[2fr_3fr_100px_100px_100px] gap-4 px-6 py-4 items-center hover:bg-white/[0.03] transition-colors group"
                >
                  {/* Name */}
                  <div className="font-medium text-gray-200 group-hover:text-white transition-colors">
                    {i.name}
                  </div>
                  
                  {/* Recipe */}
                  <div className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors leading-relaxed">
                    {i.recipe}
                  </div>

                  {/* Stats */}
                  <div className="text-center">
                    <StatBadge value={i.satiety} type="satiety" />
                  </div>
                  <div className="text-center">
                    <StatBadge value={i.mood} type="mood" />
                  </div>
                  <div className="text-center">
                    <StatBadge value={i.strength} type="strength" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
              <Search size={32} className="opacity-20" />
              <p>Ничего не найдено</p>
            </div>
          )}
        </div>

        {/* Table Footer */}
        <div className="bg-white/5 border-t border-white/10 px-6 py-3 text-xs text-gray-400 flex justify-between items-center">
          <div className="flex items-center gap-2">
             <Info size={14} className="text-sky-500/70" />
             <span>Показано рецептов: <span className="text-white font-medium">{filtered.length}</span></span>
          </div>
          <div className="opacity-50">
             Всего в базе: {cookingData.length}
          </div>
        </div>
      </div>
      
      {/* Bottom spacer if needed */}
      <div className="h-4 flex-none" />
    </div>
  );
}