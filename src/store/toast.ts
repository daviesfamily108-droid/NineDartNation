import { create } from "zustand";

type Toast = {
  id: number;
  message: string;
  type?: "info" | "success" | "error";
  timeout?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastState = {
  toasts: Toast[];
  push: (
    message: string,
    opts?: {
      type?: "info" | "success" | "error";
      timeout?: number;
      actionLabel?: string;
      onAction?: () => void;
    },
  ) => void;
  remove: (id: number) => void;
  clear: () => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, opts) =>
    set((s) => {
      const id = nextId++;
      const t: Toast = {
        id,
        message,
        type: opts?.type || "info",
        timeout: opts?.timeout ?? 3000,
        actionLabel: opts?.actionLabel,
        onAction: opts?.onAction,
      };
      // auto-remove after timeout
      if (t.timeout && t.timeout > 0) {
        setTimeout(() => {
          set((cur) => ({ toasts: cur.toasts.filter((x) => x.id !== id) }));
        }, t.timeout);
      }
      return { toasts: [...s.toasts, t] };
    }),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export function useToast() {
  const push = useToastStore((s) => s.push);
  return push;
}
