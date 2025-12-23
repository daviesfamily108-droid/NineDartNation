import React, { useEffect, type ReactNode } from "react";
import FocusLock from "react-focus-lock";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  width?: number | string;
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
  side?: "left" | "right";
};

export default function Drawer({
  open,
  onClose,
  width = 700,
  title,
  footer,
  children,
  side = "right",
}: DrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        role="button"
        aria-label="Close drawer"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Escape")
            onClose();
        }}
      />
      {/* Panel */}
      <div
        className={`absolute top-0 ${side === "right" ? "right-0 border-l" : "left-0 border-r"} h-full bg-slate-900 border-slate-700 shadow-2xl w-full sm:w-auto flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full"}`}
        style={{ width: typeof width === "number" ? `${width}px` : width }}
        role="dialog"
        aria-modal="true"
      >
        <FocusLock returnFocus={true}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
            <div className="text-lg font-semibold">
              {title?.includes("🎯") ? title : `${title} 🎯`}
            </div>
            <button className="btn px-3 py-1 text-sm" onClick={onClose}>
              Close 🎯
            </button>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-auto p-4">{children}</div>
          {/* Footer */}
          {footer && (
            <div className="px-4 py-3 border-t border-slate-700 sticky bottom-0 bg-slate-900 z-10">
              {footer}
            </div>
          )}
        </FocusLock>
      </div>
    </div>
  );
}
