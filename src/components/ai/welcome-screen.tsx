'use client';

import { motion } from "framer-motion";
import { AIOrb } from "./ai-orb";
import { Zap, Brain, Code, Lightbulb } from "lucide-react";

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
}

const suggestions = [
  {
    icon: Brain,
    title: "Разобрать и объяснить",
    description: "Сложное → простым языком",
    prompt: "Объясни эту концепцию простыми словами",
    accent: "cyan",
  },
  {
    icon: Code,
    title: "Код и логика",
    description: "Ошибки, баги, архитектура",
    prompt: "Проанализируй код и подскажи как исправить",
    accent: "violet",
  },
  {
    icon: Lightbulb,
    title: "Идея или решение",
    description: "Проект, фича, подход",
    prompt: "Придумай идею или решение под мою задачу",
    accent: "amber",
  },
  {
    icon: Zap,
    title: "Оптимизация",
    description: "Скорость, производительность",
    prompt: "Оптимизируй это и объясни что улучшилось",
    accent: "emerald",
  },
];


const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-4"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <AIOrb size="lg" isThinking={false} />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-3xl md:text-4xl font-semibold text-center mb-3 text-white"
      >
        Привет, я NightcoreX AI
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-slate-400 text-center text-lg mb-12 max-w-md"
      >
        Задайте мне вопрос или выберите одну из подсказок ниже
      </motion.p>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl"
      >
        {suggestions.map((suggestion) => (
          <motion.button
            key={suggestion.title}
            variants={itemVariants}
            whileHover={{ scale: 1.02, backgroundColor: "rgba(51, 65, 85, 0.8)" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSuggestionClick(suggestion.prompt)}
            className="group flex items-start gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-cyan-500/50 transition-all duration-300 text-left"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
              <suggestion.icon className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-slate-100 mb-0.5">{suggestion.title}</h3>
              <p className="text-sm text-slate-400 truncate">{suggestion.description}</p>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}
