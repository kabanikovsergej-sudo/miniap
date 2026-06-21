import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Droplet,
  Activity,
  Flame,
  ThermometerSnowflake,
  Stethoscope,
  Bone,
  Bandage,
  Radiation,
  Syringe,
  ArrowLeft,
} from "lucide-react";

// ДАННЫЕ (как у тебя)
const medicalData = [
  { id: 1, title: "Артериальное кровотечение", action: "Жгут выше раны", color: "from-red-600 to-red-400", icon: Droplet },
  { id: 2, title: "Венозное кровотечение", action: "Жгут ниже раны", color: "from-red-500 to-rose-400", icon: Activity },
  { id: 3, title: "Огнестрел", action: "Повязка антисептическая", color: "from-orange-700 to-red-700", icon: Syringe },
  { id: 4, title: "Ожог кислотой (Ph 0-2)", action: "Щелочной раствор", color: "from-amber-600 to-yellow-500", icon: Radiation },
  { id: 5, title: "Ожог щелочью (Ph 12-14)", action: "Кислый раствор", color: "from-yellow-500 to-orange-400", icon: Radiation },
  { id: 6, title: "Ожог термический", action: "Холодный компресс", color: "from-orange-600 to-amber-500", icon: Flame },
  { id: 7, title: "Обморожение", action: "Тепло / Обогрев", color: "from-blue-500 to-cyan-400", icon: ThermometerSnowflake },
  { id: 8, title: "Недостаточность", action: "Таблетки / Препараты", color: "from-slate-600 to-slate-400", icon: Stethoscope },
  { id: 9, title: "Перелом", action: "Наложить шину", color: "from-indigo-600 to-blue-500", icon: Bone },
  { id: 10, title: "Растяжение", action: "Тугая повязка", color: "from-sky-500 to-indigo-400", icon: Bandage },
  { id: 11, title: "Ушиб", action: "Лед / Холод. компресс", color: "from-purple-600 to-fuchsia-500", icon: Activity },
  { id: 12, title: "Вывих", action: "Наложить шину", color: "from-blue-700 to-indigo-600", icon: Bone },
];

function FirstAidRow({ item }) {
  const Icon = item.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      className="group flex items-center w-full mb-4"
    >
      {/* Левая часть */}
      <div className={`flex items-center w-1/2 p-4 rounded-l-xl shadow-lg bg-gradient-to-r ${item.color} text-white font-bold`}>
        <div className="mr-4 opacity-90">
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm uppercase tracking-wide">{item.title}</span>
      </div>

      {/* Стрелка */}
      <div className="z-10 -mx-3 bg-gray-900 border-2 border-gray-700 rounded-full p-1 text-gray-400 group-hover:text-white group-hover:border-blue-500 transition-colors">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </div>

      {/* Правая часть */}
      <div className="flex items-center w-1/2 p-4 rounded-r-xl bg-gray-800/50 border border-gray-700/50 backdrop-blur-md text-gray-200">
        <div className="ml-4 flex items-center space-x-3">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium">{item.action}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function EMS() {
  const navigate = useNavigate();

  const pageVariants = {
    hidden: { opacity: 0, y: 16, filter: "blur(8px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)" },
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={pageVariants}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="h-full p-4 md:p-6 font-sans text-gray-100 flex items-center justify-center overflow-hidden"
    >
      <div className="max-w-4xl mx-auto">
        {/* Верхняя панель */}
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

          <div className="text-right">
            <div className="text-sm font-bold text-white/80">EMS</div>
          </div>
        </div>

        {/* Заголовок */}
        <header className="mb-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.25, ease: "easeOut" }}
            className="text-3xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500"
          >
            Медицинский Справочник
          </motion.h1>
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 80, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.35, ease: "easeOut" }}
            className="h-1 bg-blue-600 mx-auto mt-2 rounded-full"
          />
        </header>

        {/* Список */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.035, delayChildren: 0.08 } },
          }}
          className="grid grid-cols-1 gap-1"
        >
          {medicalData.map((item) => (
            <FirstAidRow key={item.id} item={item} />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
