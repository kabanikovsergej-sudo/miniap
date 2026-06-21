import React from "react";
import { motion } from "framer-motion";
import { GlassWater, Flame, ArrowLeft, DollarSign, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";


const alcoholData = [
    { name: "Медовуха", price: 500, energy: 120, strength: 100, locations: ["Vanilla Unicorn"], color: "from-yellow-500/20" },
    { name: "Арарат", price: 500, energy: 120, strength: 100, locations: ["Comedy Club"], color: "from-orange-600/20" },
    { name: "Бароло", price: 500, energy: 120, strength: 100, locations: ["Bahama Mama's"], color: "from-red-700/20" },
    { name: "Саке", price: 500, energy: 120, strength: 100, locations: ["Oriental"], color: "from-blue-200/20" },
    { name: "Текила", price: 500, energy: 120, strength: 100, locations: ["Galaxy"], color: "from-green-500/20" },
    { name: "Ром", price: 600, energy: 120, strength: 100, locations: ["Cayo Perico"], color: "from-amber-700/20" },
    { name: "Водка", price: 300, energy: 60, strength: 60, locations: ["Vanilla Unicorn", "Comedy Club"], color: "from-blue-400/20" },
    { name: "Самогон", price: 250, energy: 30, strength: 30, locations: ["Vanilla Unicorn"], color: "from-slate-400/20" },
    { name: "Ерофеич", price: 300, energy: 80, strength: 60, locations: ["Vanilla Unicorn", "Comedy Club"], color: "from-green-800/20" },
    { name: "Чинзано", price: 400, energy: 80, strength: 60, locations: ["Comedy Club", "Bahama Mama's", "Galaxy", "Oriental"], color: "from-pink-500/20" },
    { name: "Мартини", price: 300, energy: 60, strength: 60, locations: ["Bahama Mama's", "Oriental", "Galaxy"], color: "from-emerald-400/20" },
    { name: "Асти", price: 300, energy: 60, strength: 60, locations: ["Bahama Mama's", "Oriental", "Galaxy"], color: "from-lime-300/20" },
    { name: "Аморе", price: 250, energy: 30, strength: 30, locations: ["Bahama Mama's", "Oriental", "Galaxy"], color: "from-rose-500/20" },
    { name: "Тоник", price: 300, energy: 30, strength: 30, locations: ["Cayo Perico"], color: "from-cyan-200/20" },
    { name: "Пина-колада", price: 500, energy: 60, strength: 60, locations: ["Cayo Perico"], color: "from-yellow-300/20" },
    { name: "Брэнди", price: 600, energy: 120, strength: 100, locations: ["Cayo Perico"], color: "from-orange-800/20" },
    { name: "Виски", price: 600, energy: 120, strength: 100, locations: ["Cayo Perico"], color: "from-amber-900/20" },
];

// Подхватываем ВСЕ png из папки AlcoPhoto
const alcoPng = import.meta.glob("./AlcoPhoto/*.png", {
    eager: true,
    import: "default",
});

// Сортируем по номеру файла: 1.png, 2.png ... 17.png
const alcoholImages = Object.entries(alcoPng)
    .sort((a, b) => {
        const na = Number(a[0].match(/(\d+)\.png$/)?.[1] ?? 0);
        const nb = Number(b[0].match(/(\d+)\.png$/)?.[1] ?? 0);
        return na - nb;
    })
    .map(([, src]) => src);



const cardVariants = {
    hidden: { opacity: 0, y: 14, scale: 0.98 },
    show: (i) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1], delay: i * 0.035 },
    }),
};

const AlcoholCard = ({ item, index }) => {
    const imgSrc = alcoholImages[index] || alcoholImages[0];

    return (
        <motion.div
            custom={index}
            variants={cardVariants}
            initial="hidden"
            animate="show"
            className={[
                "relative group overflow-hidden rounded-2xl p-5",
                "bg-zinc-950/35 border border-white/10",
                "transition-all duration-300",
                "hover:scale-[1.02] hover:bg-zinc-900/50 hover:border-white/20 hover:shadow-2xl hover:shadow-black/50",
                "backdrop-blur-[10px]",
            ].join(" ")}
        >

            <div className="relative z-10 flex flex-col items-center">
                {/* Картинка вместо иконки */}
                <div className="w-24 h-24 mb-4 flex items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-inner">
                    <img
                        src={imgSrc}
                        alt={item.name}
                        className="w-[74px] h-[74px] object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]
                       group-hover:scale-110 transition-transform duration-500"
                        draggable={false}
                    />
                </div>

                <h3 className="text-xl font-extrabold text-white mb-4 tracking-wide drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]">
                    {item.name}
                </h3>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 w-full mb-5">
                    <div className="bg-black/35 rounded-lg p-2 flex flex-col items-center border border-white/10">
                        <DollarSign size={14} className="text-yellow-400 mb-1" />
                        <span className="text-xs font-semibold text-zinc-100">{item.price}$</span>
                    </div>
                    <div className="bg-black/35 rounded-lg p-2 flex flex-col items-center border border-white/10">
                        <Flame size={14} className="text-red-400 mb-1" />
                        <span className="text-xs font-semibold text-zinc-100">{item.energy}c</span>
                    </div>
                    <div className="bg-black/35 rounded-lg p-2 flex flex-col items-center border border-white/10">
                        <GlassWater size={14} className="text-sky-300 mb-1" />
                        <span className="text-xs font-semibold text-zinc-100">{item.strength}%</span>
                    </div>
                </div>

                {/* Locations (сделал заметнее) */}
                <div className="w-full flex flex-wrap justify-center gap-2 mt-auto">
                    {item.locations.map((loc, idx) => (
                        <span
                            key={idx}
                            className={[
                                "flex items-center gap-1.5",
                                "text-[11px] font-semibold tracking-tight",
                                "border-white/10 hover:bg-white/15",
                                "text-zinc-100",
                                "px-2.5 py-1.5 rounded-lg",
                                "border border-white/12",
                                "shadow-[0_10px_24px_rgba(0,0,0,0.35)]",
                                "transition-colors cursor-pointer select-none",
                            ].join(" ")}
                            title={loc}
                        >
                            <MapPin size={12} className="text-pink-300" />
                            {loc}
                        </span>
                    ))}
                </div>
            </div>
        </motion.div>
    );
};

const AlcoholList = () => {
  const navigate = useNavigate();

  return (
    <div className="h-full text-zinc-100 p-4 font-sans relative overflow-hidden flex items-center justify-center">
      <div className="max-w-7xl mx-auto">
        {/* КНОПКА НАЗАД */}
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

        <header className="mb-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.25, ease: "easeOut" }}
            className="text-3xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500"
          >
            Алкогольные напитки
          </motion.h1>
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 80, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.35, ease: "easeOut" }}
            className="h-1 bg-pink-600 mx-auto mt-2 rounded-full"
          />
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {alcoholData.map((item, index) => (
            <AlcoholCard key={index} item={item} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AlcoholList;

