"use client";

import { Sparkles, MessageSquare, Lightbulb, Code } from "lucide-react";

const suggestions = [
  {
    icon: MessageSquare,
    title: "Поговорить",
    description: "Задайте мне любой вопрос",
  },
  {
    icon: Lightbulb,
    title: "Идеи",
    description: "Помогу с брейнштормом",
  },
  {
    icon: Code,
    title: "Код",
    description: "Напишу или объясню код",
  },
];

interface ChatEmptyProps {
  onSuggestionClick: (text: string) => void;
}

export function ChatEmpty({ onSuggestionClick }: ChatEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
      </div>

      <h1 className="text-2xl font-semibold text-foreground mb-2 text-balance text-center">
        Привет! Я ваш ИИ-помощник
      </h1>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        Готов помочь с любыми вопросами. Просто напишите мне!
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            onClick={() => onSuggestionClick(suggestion.description)}
            className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary/50 hover:shadow-md transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-lg bg-secondary group-hover:bg-primary/10 flex items-center justify-center transition-colors">
              <suggestion.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="text-sm font-medium text-foreground">{suggestion.title}</span>
            <span className="text-xs text-muted-foreground text-center">{suggestion.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
