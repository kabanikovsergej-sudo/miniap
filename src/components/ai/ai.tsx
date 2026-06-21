"use client";

import React from "react"

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect } from "react";
import { ChatHeader } from "./chat-header";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ChatEmpty } from "./chat-empty";

export function AI() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, setInput } =
    useChat({
      api: "/api/chat",
    });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleClear = () => {
    setMessages([]);
  };

  const handleSuggestionClick = (text: string) => {
    setInput(text);
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background">
      <ChatHeader onClear={handleClear} hasMessages={messages.length > 0} />

      <main className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <ChatEmpty onSuggestionClick={handleSuggestionClick} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role as "user" | "assistant"}
                content={message.content}
              />
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <ChatMessage role="assistant" content="" isLoading />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <footer className="sticky bottom-0 bg-background/80 backdrop-blur-lg border-t border-border p-4">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            value={input}
            onChange={(value) => handleInputChange({ target: { value } } as React.ChangeEvent<HTMLTextAreaElement>)}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </div>
      </footer>
    </div>
  );
}
