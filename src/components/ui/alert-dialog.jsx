import React from "react";

export function AlertDialog({ open, onOpenChange, children }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={() => onOpenChange?.(false)}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-[101]" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function AlertDialogContent({ className = "", children }) {
  return (
    <div className={`w-[92vw] max-w-md rounded-2xl bg-white p-6 shadow-2xl ${className}`}>
      {children}
    </div>
  );
}

export function AlertDialogHeader({ children }) {
  return <div className="mb-3">{children}</div>;
}

export function AlertDialogTitle({ children }) {
  return <div className="text-lg font-semibold text-slate-900">{children}</div>;
}

export function AlertDialogDescription({ children }) {
  return <div className="mt-2 text-sm text-slate-600">{children}</div>;
}

export function AlertDialogFooter({ children }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>;
}

export function AlertDialogAction({ children, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition font-medium ${className}`}
    >
      {children}
    </button>
  );
}
