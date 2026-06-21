'use client';

import { motion } from "framer-motion";

interface AIOrbProps {
  isThinking?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function AIOrb({ isThinking = false, size = "md", className }: AIOrbProps) {
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-24 h-24",
    lg: "w-36 h-36",
  };

  const orbSizes = {
    sm: { outer: 40, inner: 24 },
    md: { outer: 96, inner: 64 },
    lg: { outer: 144, inner: 100 },
  };

  return (
    <div className={cn("relative flex items-center justify-center", sizeClasses[size], className)}>
      {/* Outer glow */}
      <motion.div
        className="absolute inset-0 rounded-full bg-cyan-500/30 blur-2xl"
        animate={{
          scale: isThinking ? [1, 1.2, 1] : 1,
          opacity: isThinking ? [0.3, 0.6, 0.3] : 0.3,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Middle pulsing ring */}
      <motion.div
        className="absolute rounded-full border-2 border-cyan-400/40"
        style={{
          width: orbSizes[size].outer * 0.85,
          height: orbSizes[size].outer * 0.85,
        }}
        animate={{
          rotate: isThinking ? 360 : 0,
          scale: isThinking ? [1, 1.05, 1] : 1,
        }}
        transition={{
          rotate: { duration: 8, repeat: Infinity, ease: "linear" },
          scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
        }}
      />

      {/* Inner core */}
      <motion.div
        className="absolute rounded-full bg-gradient-to-br from-cyan-400 via-cyan-500 to-teal-500 shadow-lg shadow-cyan-500/50"
        style={{
          width: orbSizes[size].inner,
          height: orbSizes[size].inner,
        }}
        animate={{
          scale: isThinking ? [1, 1.1, 1] : [1, 1.02, 1],
        }}
        transition={{
          duration: isThinking ? 1 : 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Highlight reflection */}
      <div
        className="absolute rounded-full bg-gradient-to-br from-white/40 to-transparent"
        style={{
          width: orbSizes[size].inner * 0.8,
          height: orbSizes[size].inner * 0.8,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) translate(-15%, -15%)",
        }}
      />

      {/* Orbiting particles */}
      {isThinking && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-cyan-300"
              style={{
                boxShadow: "0 0 10px rgba(34, 211, 238, 0.8)",
              }}
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 3 + i,
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.5,
              }}
              initial={{
                x: orbSizes[size].outer * 0.4 * Math.cos((i * 2 * Math.PI) / 3),
                y: orbSizes[size].outer * 0.4 * Math.sin((i * 2 * Math.PI) / 3),
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
