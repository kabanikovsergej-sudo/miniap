'use client';

import { motion } from "framer-motion";
import { Send, Square, Sparkles } from "lucide-react";
import { useRef, useEffect, KeyboardEvent } from "react";

interface FloatingInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function FloatingInput({
  value = "",
  onChange,
  onSubmit,
  onStop,
  isLoading,
  disabled,
  placeholder = "Напишите сообщение...",
}: FloatingInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const safeValue = value ?? "";

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [safeValue]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && safeValue.trim()) {
        onSubmit();
      }
    }
    if (e.key === "Escape" && isLoading && onStop) {
      onStop();
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Glow effect */}
      <motion.div
        className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-teal-500/20 to-cyan-500/20 rounded-2xl blur-xl"
        animate={{
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="relative flex items-end gap-3 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-2xl p-3 shadow-2xl">
        <Sparkles className="w-5 h-5 text-cyan-400 mb-2.5 flex-shrink-0 hidden sm:block" />

        <textarea
          ref={textareaRef}
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={1}
          className={cn(
            "flex-1 bg-transparent resize-none outline-none",
            "text-slate-100 placeholder:text-slate-500",
            "min-h-[44px] max-h-[200px] py-2.5",
            "text-base leading-relaxed",
            "disabled:opacity-50"
          )}
        />

        {isLoading ? (
          <motion.button
            onClick={onStop}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center transition-colors"
          >
            <Square className="w-4 h-4 fill-current" />
          </motion.button>
        ) : (
          <motion.button
            onClick={onSubmit}
            disabled={!safeValue.trim() || disabled}
            whileHover={{ scale: safeValue.trim() ? 1.05 : 1 }}
            whileTap={{ scale: safeValue.trim() ? 0.95 : 1 }}
            className={cn(
              "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300",
              safeValue.trim()
                ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/30"
                : "bg-slate-800 text-slate-500"
            )}
          >
            <Send className="w-4 h-4" />
          </motion.button>
        )}
      </div>

      <p className="text-center text-xs text-slate-500 mt-3">
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-xs font-mono text-slate-400">Enter</kbd> для отправки,{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-xs font-mono text-slate-400">Shift+Enter</kbd> для новой строки
      </p>
    </div>
  );
}
