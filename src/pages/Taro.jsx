import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// ВАЖНО:
// Папка с фотками: src/pages/TaroPhotos
// Имена файлов должны быть: 00.png ... 21.png (или .jpg/.webp — ниже объясню)
const tarotData = [
  { id: 0, file: "thefool.png", title: "THE FOOL", description: '0. Несколько минут будет проигрываться смех "Повара"' },
  { id: 1, file: "themagician.png", title: "THE MAGICIAN", description: "1. Все персонажи вашего пола поблизости копируют вашу внешность и одежду" },
  { id: 2, file: "thehighpriestess.png", title: "THE HIGH PRIESTESS", description: "2. У персонажа начинается кровотечение" },
  { id: 3, file: "theempress.png", title: "THE EMPRESS", description: '3. Включается "Женская походка"' },
  { id: 4, file: "theemperor.png", title: "THE EMPEROR", description: '4. Включается походка "Раскидывать руками"' },
  { id: 5, file: "thehierophant.png", title: "THE HIEROPHANT", description: "5. Восстанавливает здоровье до максимума, но настроение и сытость падают до 0" },
  { id: 6, file: "thelovers.png", title: "THE LOVERS", description: "6. Камера фокусируется на персонажах противоположного пола, пока Вы не подружитесь или не обменяетесь с одним (одной) на них" },
  { id: 7, file: "thecariot.png", title: "THE CHARIOT", description: "7. Ненадолго ускоряет бег персонажа" }, // у тебя файл именно thecariot.png
  { id: 8, file: "strength.png", title: "STRENGTH", description: "8. +50 очков навыка сила" },
  { id: 9, file: "thehermit.png", title: "THE HERMIT", description: "9. X2 зарплата на функциональных работах в течении часа" },
  { id: 10, file: "wheelfortune.png", title: "WHEEL OF FORTUNE", description: "10. Сбрасывается счетчик колеса удачи, можно сразу крутить" },
  { id: 11, file: "justice.png", title: "JUSTICE", description: "11. +1 доллар" },
  { id: 12, file: "thehangedman.png", title: "THE HANGED MAN", description: "12. Тело персонажа станет прозрачным, останется лишь в голова в петле" },
  { id: 13, file: "death.png", title: "DEATH", description: "13. Персонажу становится плохо и он умирает" },
  { id: 14, file: "temperance.png", title: "TEMPERANCE", description: "14. Здоровье падает до максимума, но настроение и сытость становятся 100%" },
  { id: 15, file: "thedevil.png", title: "THE DEVIL", description: "15. Персонаж начинает гореть, но не получает урона" },
  { id: 16, file: "thetower.png", title: "THE TOWER", description: "16. Наличные деньги исчезают и возвращаются" },
  { id: 17, file: "thestar.png", title: "THE STAR", description: "17. Подкидывает персонажа в воздух" },
  { id: 18, file: "themoon.png", title: "THE MOON", description: "18. Делает кожу персонажа белой, если был темнокожим" },
  { id: 19, file: "thesun.png", title: "THE SUN", description: "19. Делает кожу персонажа чёрной, если был светлокожим" },
  { id: 20, file: "judgement.png", title: "JUDGEMENT", description: "20. Персонаж получает 2-3 звезды розыска на 2 минуты. В истории госников не сохраняется" },
  { id: 21, file: "theworld.png", title: "THE WORLD", description: "21. Персонажа телепортирует в случайные места на карте" },
];

function TarotCard({ card }) {
  const imgSrc = useMemo(() => {
    // Vite норм импортит картинки, если путь статический:
    // Здесь путь полу-динамический, поэтому используем new URL
    return new URL(`./TaroPhotos/${card.file}`, import.meta.url).toString();
  }, [card.file]);

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12, scale: 0.985, filter: "blur(6px)" },
        show: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
      }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.99 }}
      className="relative group bg-gray-900/60 border border-yellow-700/40 rounded-2xl p-3 shadow-xl overflow-hidden"
    >
      <div className="overflow-hidden rounded-xl mb-3">
        <img
          src={imgSrc}
          alt={card.title}
          className="w-full h-auto object-cover rounded-xl border border-white/10 group-hover:border-yellow-500/70 transition-colors duration-300"
          loading="lazy"
        />
      </div>

      <h3 className="text-sm font-extrabold text-yellow-300 mb-2 uppercase text-center tracking-wide">
        {card.title}
      </h3>

      <p className="text-xs text-gray-300 text-center leading-tight">
        {card.description}
      </p>

      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-yellow-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </motion.div>
  );
}

export default function TarotCardsPage() {
  const navigate = useNavigate();

  // IMPORTANT: тут укажи РОУТ, на котором у тебя Menu.jsx
  // Если Menu.jsx = "/menu" -> оставь "/menu"
  // Если Menu.jsx = "/" -> поменяй на "/"
  const MENU_ROUTE = "/menu";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="h-full p-4 md:p-6 font-sans text-gray-100 flex items-center justify-center overflow-hidden"
    >
      <div className="max-w-6xl mx-auto">
        {/* Top bar: Назад + мини бренд */}
        <div className="flex items-center justify-between mb-8">
          <button
            type="button"
            onClick={() => navigate("/menu")}
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
        </div>

        {/* Header */}
        <header className="mb-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.25, ease: "easeOut" }}
            className="text-4xl md:text-5xl font-extrabold tracking-tight uppercase text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-600 drop-shadow-lg"
          >
            Карты Таро
          </motion.h1>

          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 96, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.35, ease: "easeOut" }}
            className="h-1.5 bg-yellow-500 mx-auto mt-4 rounded-full shadow-md"
          />
        </header>

        {/* Grid with stagger animation */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.035, delayChildren: 0.08 } },
          }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
        >
          {tarotData.map((card) => (
            <TarotCard key={card.id} card={card} />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
