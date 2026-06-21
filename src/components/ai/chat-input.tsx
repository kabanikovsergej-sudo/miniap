"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Sparkles } from "lucide-react";
import { useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder = "Напишите сообщение...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSubmit(e as unknown as FormEvent<HTMLFormElement>);
      }
    }
  };

  return (
    <form onSubmit={onSubmit} className="relative">
      <div className="relative flex items-end gap-2 p-2 bg-card border border-border rounded-2xl shadow-lg shadow-primary/5 transition-all duration-200 focus-within:border-primary/50 focus-within:shadow-primary/10">
        <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className="flex-1 min-h-[44px] max-h-[200px] pl-11 pr-2 py-3 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!value.trim() || isLoading}
          className="flex-shrink-0 w-10 h-10 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <ArrowUp className="w-5 h-5" />
          <span className="sr-only">Отправить сообщение</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        Нажмите Enter для отправки, Shift+Enter для переноса строки
      </p>
    </form>
  );
}
