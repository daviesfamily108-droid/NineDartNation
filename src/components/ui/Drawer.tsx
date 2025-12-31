import React, { useEffect, type ReactNode } from "react";
import FocusLock from "react-focus-lock";
import { X } from "lucide-react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  width?: number | string;
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
  side?: "left" | "right" | "bottom";
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
  // Swipe to close logic
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);
  const touchCurrent = React.useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchCurrent.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchCurrent.current) return;
    const diffX = touchStart.current.x - touchCurrent.current.x;
    const diffY = touchStart.current.y - touchCurrent.current.y;

    // If side is left, swipe left (positive diffX) closes it
    // If side is right, swipe right (negative diffX) closes it
    // If side is bottom, swipe down (negative diffY) closes it
    const threshold = 50; // px

    if (side === "left" && diffX > threshold) {
      onClose();
    } else if (side === "right" && diffX < -threshold) {
      onClose();
    } else if (side === "bottom" && diffY < -threshold) {
      onClose();
    }

    touchStart.current = null;
    touchCurrent.current = null;
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prevent the page behind the drawer from scrolling on mobile
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    // Avoid layout shift when the scrollbar disappears
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-[200] ${open ? "" : "pointer-events-none"}`}
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
        className={`absolute bg-slate-900 border-slate-700 shadow-2xl flex flex-col transition-transform duration-200
          ${
            side === "bottom"
              ? `bottom-0 left-0 right-0 border-t rounded-t-2xl max-h-[85vh] w-full ${open ? "translate-y-0" : "translate-y-full"}`
              : `top-0 h-full w-full sm:w-auto ${side === "right" ? "right-0 border-l" : "left-0 border-r"} ${open ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full"}`
          }
        `}
        style={{
          width:
            side === "bottom"
              ? "100%"
              : typeof width === "number"
                ? `${width}px`
                : width,
        }}
        role="dialog"
        aria-modal="true"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <FocusLock returnFocus={true}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
            <div className="text-base font-semibold text-white/90">
              {title || "Menu"}
            </div>
            <button
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-semibold text-white transition-colors"
              onClick={onClose}
            >
              <span>Close</span>
              <X className="w-4 h-4" aria-hidden="true" />
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
