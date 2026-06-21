import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function Checkbox({ checked = false, onCheckedChange, className, disabled = false }) {
  const isOn = !!checked;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation(); // ВАЖНО: чтобы карточка не срабатывала второй раз
        onCheckedChange?.(!isOn);
      }}
      className={cn(
        "shrink-0 h-6 w-6 rounded-lg border flex items-center justify-center transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isOn ? "bg-emerald-600 border-emerald-600" : "bg-white border-slate-300",
        className
      )}
      role="checkbox"
      aria-checked={isOn}
    >
      <Check
  className={cn(
    "w-4 h-4 text-white transition-all duration-150",
    isOn ? "opacity-100 scale-100" : "opacity-0 scale-75"
  )}
/>
</button>
  );
}
