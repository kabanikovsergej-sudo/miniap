import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Starfield } from "./starfield";
import { AIOrb } from "./ai-orb";
import { MessageBubble } from "./message-bubble";
import { FloatingInput } from "./floating-input";
import { WelcomeScreen } from "./welcome-screen";
import { fetchMe, getApiBase } from "@/lib/auth";

async function sendToBackend(message: string): Promise<string> {
  const token =
    localStorage.getItem("auth_token") ||
    localStorage.getItem("token") ||
    "";

  if (!token) throw new Error("NO_AUTH");

  const res = await fetch(`${getApiBase()}/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: message }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "AI_FAILED");
  return data.reply;
}




interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface NovaAIProps {
  /** Function to send message to your AI backend, should return the response text */
  onSendMessage?: (message: string) => Promise<string>;
  /** Optional: streaming callback for real-time response updates */
  onStreamMessage?: (
    message: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void
  ) => void;
}

export function NovaAI({ onSendMessage, onStreamMessage }: NovaAIProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
  };

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      if (onStreamMessage) {
        const assistantId = generateId();
        setStreamingContent("");

        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        let fullContent = "";
        onStreamMessage(
          userMessage.content,
          (chunk) => {
            fullContent += chunk;
            setStreamingContent(fullContent);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: fullContent } : m
              )
            );
          },
          () => {
            setStreamingContent("");
            setIsLoading(false);
          }
        );

        return; // важно: чтобы дальше не пошло
      }

      // НЕ стрим — обычный запрос
      const response = onSendMessage
        ? await onSendMessage(userMessage.content)
        : await sendToBackend(userMessage.content);

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: response,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content:
          error instanceof Error && error.message === "NO_AUTH"
            ? "Вы не авторизованы. Войдите в аккаунт и попробуйте снова."
            : "Произошла ошибка при обработке запроса. Пожалуйста, попробуйте снова.",
      };

      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
    }

  };

  const handleStop = () => {
    setIsLoading(false);
    setStreamingContent("");
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
    setStreamingContent("");
    setIsLoading(false);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="relative h-screen overflow-hidden">
      {/* ✅ BACKGROUND (не скроллится, клики не блокирует) */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <Starfield />
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl" />
        </div>
      </div>


      {/* ✅ SCROLL AREA (скроллится ТОЛЬКО чат; снизу запас под инпут) */}
      <div className="absolute inset-x-0 top-[73px] bottom-0 overflow-y-auto pb-44">
        <div className="px-4 md:px-8 py-6">
          <div className="max-w-3xl mx-auto">
            <AnimatePresence mode="wait">
              {!hasMessages ? (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
                </motion.div>
              ) : (
                <motion.div
                  key="messages"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  {messages.map((message, index) => (
                    <MessageBubble
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      isStreaming={
                        isLoading &&
                        index === messages.length - 1 &&
                        message.role === "assistant"
                      }
                    />
                  ))}

                  {isLoading && messages[messages.length - 1]?.role === "user" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3"
                    >
                      <AIOrb size="sm" isThinking />
                      <span className="text-sm text-slate-400">Nova думает...</span>
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ✅ INPUT (фикс снизу, не скроллится) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 p-4 md:p-20  from-slate-950 via-slate-950/95 to-transparent">
        <div className="max-w-3xl mx-auto">
          <FloatingInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onStop={handleStop}
            isLoading={isLoading}
            placeholder={hasMessages ? "Продолжите диалог..." : "Задайте вопрос..."}
          />
        </div>
      </div>
    </div>
  );
}

export default NovaAI;

