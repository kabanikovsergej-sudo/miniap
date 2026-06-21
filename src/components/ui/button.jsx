import * as React from "react";
import { cn } from "@/lib/utils";

const Button = React.forwardRef(function Button(
  { className, variant = "default", size = "default", ...props },
  ref
) {
  const variants = {
    default: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
    ghost: "bg-transparent hover:bg-slate-100 text-slate-900",
    destructive: "bg-red-600 text-white hover:bg-red-700"
  };

  const sizes = {
    default: "h-10 px-4 py-2 rounded-xl text-sm font-semibold",
    icon: "h-10 w-10 rounded-xl"
  };

  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center transition " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 " +
          "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant] || variants.default,
        sizes[size] || sizes.default,
        className
      )}
      {...props}
    />
  );
});

export { Button };
