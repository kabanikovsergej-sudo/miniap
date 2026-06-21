import * as React from "react";
import { cn } from "@/lib/utils";

function Switch({ checked, onCheckedChange, className, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 " +
          "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-indigo-600" : "bg-slate-300",
        className
      )}
      aria-pressed={checked}
      aria-label="Switch"
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white transition",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      />
    </button>
  );
}

export { Switch };
