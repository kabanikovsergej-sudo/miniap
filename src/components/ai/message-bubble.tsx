'use client';

import { motion } from "framer-motion";
import { Copy, Check, User, Sparkles } from "lucide-react";
import { useState, useMemo } from "react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function renderMarkdown(text: string) {
  if (!text) return null;

  const parts: { type: "text" | "code"; value: string; lang?: string }[] = [];
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;

  while ((m = codeBlockRe.exec(text)) !== null) {
    const before = text.slice(last, m.index);
    if (before) parts.push({ type: "text", value: before });
    parts.push({ type: "code", value: m[2].replace(/^\n+|\n+$/g, ""), lang: m[1] });
    last = m.index + m[0].length;
  }

  const tail = text.slice(last);
  if (tail) parts.push({ type: "text", value: tail });

  return (
    <div className="space-y-3">
      {parts.map((p, i) => {
        if (p.type === "code") {
          return (
            <div key={i} className="relative group/code">
              {p.lang && (
                <div className="absolute top-2 left-3 text-xs text-slate-400 font-mono">
                  {p.lang}
                </div>
              )}
              <pre className="rounded-xl bg-slate-900 border border-slate-700 p-4 pt-8 overflow-auto text-sm font-mono leading-relaxed text-slate-100">
                <code>{p.value}</code>
              </pre>
            </div>
          );
        }

        const inline: { t: "t" | "i" | "b"; v: string }[] = [];
        // Handle bold text
        let processed = p.value;
        const boldRe = /\*\*([^*]+)\*\*/g;
        const inlineCodeRe = /`([^`]+)`/g;
        
        // Simple parsing - just inline code for now
        let l = 0;
        let mm;
        while ((mm = inlineCodeRe.exec(processed)) !== null) {
          const b = processed.slice(l, mm.index);
          if (b) inline.push({ t: "t", v: b });
          inline.push({ t: "i", v: mm[1] });
          l = mm.index + mm[0].length;
        }
        const tt = processed.slice(l);
        if (tt) inline.push({ t: "t", v: tt });

        return (
          <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">
            {inline.map((q, j) =>
              q.t === "i" ? (
                <code
                  key={j}
                  className="rounded-md bg-slate-800 border border-slate-600 px-1.5 py-0.5 text-sm font-mono text-cyan-400"
                >
                  {q.v}
                </code>
              ) : (
                <span key={j}>{q.v}</span>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderedContent = useMemo(() => renderMarkdown(content), [content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "group flex w-full gap-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Avatar for assistant */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      )}

      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-br-md"
            : "bg-slate-800/80 border border-slate-700 text-slate-100 rounded-bl-md"
        )}
      >
        {renderedContent}

        {isStreaming && (
          <span className="inline-flex gap-1 ml-2 align-middle">
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-current"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
            />
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-current"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
            />
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-current"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
            />
          </span>
        )}

        {!isUser && content && !isStreaming && (
          <button
            onClick={handleCopy}
            className="absolute -bottom-8 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Скопировано</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Копировать</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Avatar for user */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
          <User className="w-4 h-4 text-slate-300" />
        </div>
      )}
    </motion.div>
  );
}
