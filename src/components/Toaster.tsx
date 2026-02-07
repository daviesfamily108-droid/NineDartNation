import { useToastStore } from "../store/toast.js";

export default function Toaster() {
  const toasts = useToastStore((s: any) => s.toasts);
  const remove = useToastStore((s: any) => s.remove);
  if (!toasts.length) return null;
  return (
    <>
      {/* Success messages centered */}
      {toasts
        .filter((t: any) => t.type === "success")
        .map((t: any) => (
          <div
            key={t.id}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
          >
            <div
              className={`p-4 rounded-lg shadow-lg border text-sm bg-emerald-700/90 border-emerald-500/60 text-white max-w-sm text-center`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="flex-1 font-semibold">{t.message}</span>
              </div>
            </div>
          </div>
        ))}
      {/* Other messages bottom right */}
      {toasts.filter((t: any) => t.type !== "success").length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 sm:right-4 sm:left-auto left-1/2 -translate-x-1/2 sm:translate-x-0 w-[calc(100%-1.5rem)] sm:w-auto max-w-sm">
          {toasts
            .filter((t: any) => t.type !== "success")
            .map((t: any) => (
              <div
                key={t.id}
                className={`p-3 rounded-lg shadow-lg border text-sm ${
                  t.type === "error"
                    ? "bg-rose-700/80 border-rose-500/60 text-white"
                    : "bg-black/70 border-slate-700 text-slate-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1">{t.message}</span>
                  {t.actionLabel &&
                  typeof (t as any).onAction === "function" ? (
                    <button
                      className="btn px-2 py-1 text-xs bg-slate-200/10 hover:bg-slate-200/20"
                      onClick={() => {
                        try {
                          (t as any).onAction?.();
                        } catch {}
                        remove(t.id);
                      }}
                    >
                      {t.actionLabel}
                    </button>
                  ) : null}
                  <button
                    className="btn btn--ghost px-2 py-1 text-xs"
                    onClick={() => remove(t.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
