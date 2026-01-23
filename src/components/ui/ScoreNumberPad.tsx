import React, { useEffect } from "react";

interface ScoreNumberPadProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  maxLength?: number;
  className?: string;
}

const DIGITS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"];

export default function ScoreNumberPad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  label = "Number pad",
  helperText,
  maxLength = 3,
  className = "",
}: ScoreNumberPadProps) {
  const appendDigit = (digit: string) => {
    const base = value === "0" ? "" : (value ?? "");
    const next = `${base}${digit}`;
    const trimmed = maxLength > 0 ? next.slice(0, maxLength) : next;
    onChange(trimmed);
  };

  useEffect(() => {
    if (disabled) return;
    const isEditableTarget = (target: EventTarget | null) => {
      if (!target || !(target as HTMLElement).tagName) return false;
      const el = target as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select")
        return true;
      return !!el.getAttribute("contenteditable");
    };
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        appendDigit(e.key);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        onChange((value || "").slice(0, -1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onChange("");
        return;
      }
      if (e.key === "Enter" && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [appendDigit, disabled, onChange, onSubmit, value]);

  return (
    <div className={className}>
      {label && <div className="text-sm font-semibold mb-2">{label}</div>}
      <div className="grid grid-cols-3 gap-2 max-w-sm">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            className="btn text-lg"
            onClick={() => appendDigit(digit)}
            disabled={disabled}
          >
            {digit}
          </button>
        ))}
        <button
          className="btn bg-rose-600 hover:bg-rose-700 text-white"
          onClick={() => onChange("")}
          disabled={disabled}
        >
          Clear
        </button>
        <button
          className="btn bg-slate-600 hover:bg-slate-700 text-white"
          onClick={() => onChange((value || "").slice(0, -1))}
          disabled={disabled}
        >
          Back
        </button>
        <button
          className="btn bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onSubmit && onSubmit()}
          disabled={disabled || !onSubmit}
        >
          Enter
        </button>
      </div>
      {helperText && (
        <div className="text-xs opacity-70 mt-2">{helperText}</div>
      )}
    </div>
  );
}
