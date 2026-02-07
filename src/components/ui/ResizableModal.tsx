import React, {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import * as FocusLockModule from "react-focus-lock";

const FocusLock = (FocusLockModule as any).default ?? (FocusLockModule as any);

type Props = {
  storageKey: string;
  children: ReactNode;
  className?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  fullScreen?: boolean;
  initialFitHeight?: boolean;
  onClose?: () => void;
};

type Size = { width?: number; height?: number };

export default function ResizableModal({
  storageKey,
  children,
  className,
  defaultWidth = 520,
  defaultHeight,
  minWidth = 360,
  minHeight = 200,
  maxWidth = 1100,
  maxHeight = 900,
  fullScreen = false,
  initialFitHeight = false,
  onClose,
}: Props) {
  const [size, setSize] = useState<Size>(() => {
    if (!fullScreen) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw);
      } catch {}
      return { width: defaultWidth, height: defaultHeight };
    }
    return {};
  });
  const startRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    dir: string;
  } | null>(null);

  useEffect(() => {
    if (fullScreen) return;
    function onReset() {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      // If initialFitHeight is enabled, prefer fitting to parent height on reset
      if (initialFitHeight && containerRef.current?.parentElement) {
        const parent = containerRef.current.parentElement as HTMLElement;
        const cs = window.getComputedStyle(parent);
        const padTop = parseFloat(cs.paddingTop || "0") || 0;
        const padBottom = parseFloat(cs.paddingBottom || "0") || 0;
        const inner = Math.max(0, parent.clientHeight - padTop - padBottom);
        const target = Math.max(
          minHeight,
          Math.min(maxHeight, Math.round(inner)),
        );
        setSize({ width: defaultWidth, height: target });
        return;
      }
      setSize({ width: defaultWidth, height: defaultHeight });
    }
    window.addEventListener("ndn:layout-reset" as any, onReset);
    return () => window.removeEventListener("ndn:layout-reset" as any, onReset);
  }, [storageKey, defaultWidth, defaultHeight, fullScreen]);

  useEffect(() => {
    if (fullScreen) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(size));
    } catch {}
  }, [size, storageKey, fullScreen]);

  // Optionally fit initial height to the available parent container when no saved size exists
  useEffect(() => {
    if (fullScreen || !initialFitHeight) return;
    const parent = containerRef.current?.parentElement as HTMLElement | null;
    if (!parent) return;
    const cs = window.getComputedStyle(parent);
    const padTop = parseFloat(cs.paddingTop || "0") || 0;
    const padBottom = parseFloat(cs.paddingBottom || "0") || 0;
    const inner = Math.max(0, parent.clientHeight - padTop - padBottom);
    const target = Math.max(minHeight, Math.min(maxHeight, Math.round(inner)));
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const savedSize = JSON.parse(saved) as Size;
        const h = savedSize?.height || 0;
        // If saved height is smaller than available, bump it to fill the frame bottom
        if (!h || h < target) {
          setSize((s) => ({ ...s, height: target }));
        }
        return;
      }
    } catch {}
    setSize((s) => ({ ...s, height: target }));
  }, [initialFitHeight, fullScreen, storageKey, minHeight, maxHeight]);

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  function beginResize(e: React.MouseEvent, dir: string) {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: rect.width,
      h: rect.height,
      dir,
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", endResize);
  }

  function handleKeyResize(e: React.KeyboardEvent, dir: string) {
    const step = 20;
    const k = e.key;
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Enter",
        " ",
      ].includes(k)
    )
      return;
    e.preventDefault();
    const delta = k === "ArrowLeft" || k === "ArrowUp" ? -step : step;
    setSize((s) => {
      const curW = s.width || defaultWidth;
      const curH = s.height || defaultHeight || minHeight;
      let w = curW;
      let h = curH;
      if (dir.includes("e")) w = clamp(curW + delta, minWidth, maxWidth);
      if (dir.includes("w")) w = clamp(curW - delta, minWidth, maxWidth);
      if (dir.includes("s")) h = clamp(curH + delta, minHeight, maxHeight);
      if (dir.includes("n")) h = clamp(curH - delta, minHeight, maxHeight);
      return { width: Math.round(w), height: Math.round(h) };
    });
  }

  function onMove(e: MouseEvent) {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dir = s.dir;
    let w = s.w;
    let h = s.h;
    // Respect parent's inner height so the modal bottom can align with the frame bottom
    let parentInner = Infinity;
    const parent = containerRef.current?.parentElement as HTMLElement | null;
    if (parent) {
      const cs = window.getComputedStyle(parent);
      const padTop = parseFloat(cs.paddingTop || "0") || 0;
      const padBottom = parseFloat(cs.paddingBottom || "0") || 0;
      parentInner = Math.max(0, parent.clientHeight - padTop - padBottom);
    }
    const effMaxH = Math.min(
      maxHeight,
      isFinite(parentInner) ? parentInner : maxHeight,
    );
    // We only adjust width/height; the modal stays centered via parent flex
    if (dir.includes("e")) w = clamp(s.w + dx, minWidth, maxWidth);
    if (dir.includes("s")) h = clamp(s.h + dy, minHeight, effMaxH);
    if (dir.includes("w")) w = clamp(s.w - dx, minWidth, maxWidth);
    if (dir.includes("n")) h = clamp(s.h - dy, minHeight, effMaxH);
    setSize({ width: Math.round(w), height: Math.round(h) });
  }

  function endResize() {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endResize);
    startRef.current = null;
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!onClose) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onClose]);
  const style: CSSProperties = fullScreen
    ? { width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }
    : {
        width: size.width ? `${size.width}px` : undefined,
        height: size.height ? `${size.height}px` : undefined,
        maxWidth: `${maxWidth}px`,
        // Allow filling up to the parent's inner height
        maxHeight: "100%",
      };

  const baseClass = fullScreen
    ? "card relative ndn-modal-full"
    : "card relative";
  return (
    <div
      ref={containerRef}
      className={`${baseClass} ${className || ""}`}
      style={style}
    >
      <FocusLock returnFocus className="flex-1 flex flex-col min-h-0 w-full">
        {/* Content */}
        {children}
      </FocusLock>
      {/* Corner handles */}
      {!fullScreen && (
        <div
          className="resizer resizer-nw"
          onMouseDown={(e) => beginResize(e, "nw")}
          role="button"
          tabIndex={0}
          aria-label="Resize north-west"
          onKeyDown={(e) => handleKeyResize(e, "nw")}
        />
      )}
      {!fullScreen && (
        <div
          className="resizer resizer-ne"
          onMouseDown={(e) => beginResize(e, "ne")}
          role="button"
          tabIndex={0}
          aria-label="Resize north-east"
          onKeyDown={(e) => handleKeyResize(e, "ne")}
        />
      )}
      {!fullScreen && (
        <div
          className="resizer resizer-sw"
          onMouseDown={(e) => beginResize(e, "sw")}
          role="button"
          tabIndex={0}
          aria-label="Resize south-west"
          onKeyDown={(e) => handleKeyResize(e, "sw")}
        />
      )}
      {!fullScreen && (
        <div
          className="resizer resizer-se"
          onMouseDown={(e) => beginResize(e, "se")}
          role="button"
          tabIndex={0}
          aria-label="Resize south-east"
          onKeyDown={(e) => handleKeyResize(e, "se")}
        />
      )}
      {/* Bottom edge handle for easy vertical stretching */}
      {!fullScreen && (
        <div
          className="resizer-edge resizer-s"
          onMouseDown={(e) => beginResize(e, "s")}
          role="button"
          tabIndex={0}
          aria-label="Resize south"
          onKeyDown={(e) => handleKeyResize(e, "s")}
        />
      )}
    </div>
  );
}
