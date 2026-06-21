import * as React from "react";
import { cn } from "@/lib/utils";

function Badge({ className, variant = "secondary", ...props }) {
  const styles =
    variant === "secondary"
      ? "bg-slate-100 text-slate-700 border border-slate-200"
      : "bg-indigo-600 text-white border border-indigo-600";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-semibold",
        styles,
        className
      )}
      {...props}
    />
  );
}

export { Badge };
