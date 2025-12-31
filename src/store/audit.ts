import { create } from "zustand";

export type VisitAudit = {
  ts: number;
  mode: string;
  darts: number;
  visitTotal: number;
  preOpenDarts?: number;
  preRemaining?: number;
  postRemaining?: number;
  bust?: boolean;
  finish?: boolean;
  threeDartAvg?: number;
};

type CalibrationAudit = {
  hasHomography: boolean;
  imageSize?: { w: number; h: number } | null;
  lastUpdated?: number;
};

type AuditState = {
  // Rolling buffer of recent visits
  recent: VisitAudit[];
  // Aggregates
  totals: {
    visits: number;
    darts: number;
    points: number;
    finishes: number;
    busts: number;
    byMode: Record<string, { visits: number; darts: number; points: number }>;
  };
  calibration: CalibrationAudit;
  recordVisit: (
    mode: string,
    darts: number,
    visitTotal: number,
    meta?: Partial<VisitAudit>,
  ) => void;
  setCalibrationStatus: (c: Partial<CalibrationAudit>) => void;
  reset: () => void;
};

export const useAudit = create<AuditState>((set) => ({
  recent: [],
  totals: { visits: 0, darts: 0, points: 0, finishes: 0, busts: 0, byMode: {} },
  calibration: {
    hasHomography: false,
    imageSize: null,
    lastUpdated: undefined,
  },
  recordVisit: (mode, darts, visitTotal, meta) =>
    set((state) => {
      const ts = Date.now();
      const item: VisitAudit = {
        ts,
        mode,
        darts,
        visitTotal,
        preOpenDarts: meta?.preOpenDarts,
        preRemaining: meta?.preRemaining,
        postRemaining: meta?.postRemaining,
        bust: meta?.bust,
        finish: meta?.finish,
        threeDartAvg: meta?.threeDartAvg,
      };
      const recent = [...state.recent, item].slice(-50);
      const totals = { ...state.totals };
      totals.visits += 1;
      totals.darts += darts;
      totals.points += visitTotal;
      if (item.finish) totals.finishes += 1;
      if (item.bust) totals.busts += 1;
      const bm = totals.byMode[mode] || { visits: 0, darts: 0, points: 0 };
      bm.visits += 1;
      bm.darts += darts;
      bm.points += visitTotal;
      totals.byMode[mode] = bm;
      // Console surface for quick verification without UI changes
      try {
        const tag = item.finish ? "FINISH" : item.bust ? "BUST" : "VISIT";
        const info = {
          mode,
          darts,
          visitTotal,
          preOpenDarts: item.preOpenDarts ?? 0,
          preRemaining: item.preRemaining,
          postRemaining: item.postRemaining,
          threeDartAvg: item.threeDartAvg,
        } as any;
        console.info(`[Audit:${tag}]`, info);
      } catch {}
      // Persist recent visits to localStorage so Home can show recent across reloads
      try {
        localStorage.setItem("ndn_audit_recent", JSON.stringify(recent));
      } catch {}
      return { ...state, recent, totals };
    }),
  setCalibrationStatus: (c) =>
    set((state) => {
      const updated: CalibrationAudit = {
        hasHomography: c.hasHomography ?? state.calibration.hasHomography,
        imageSize:
          c.imageSize === undefined ? state.calibration.imageSize : c.imageSize,
        lastUpdated: Date.now(),
      };
      try {
        console.info("[Audit:Calibration]", updated);
      } catch {}
      return { ...state, calibration: updated };
    }),
  reset: () =>
    set({
      recent: [],
      totals: {
        visits: 0,
        darts: 0,
        points: 0,
        finishes: 0,
        busts: 0,
        byMode: {},
      },
      calibration: {
        hasHomography: false,
        imageSize: null,
        lastUpdated: undefined,
      },
    }),
}));

// Expose a tiny debug hook on window for manual checks when needed
try {
  // @ts-ignore
  if (typeof window !== "undefined")
    (window as any).__NDN_AUDIT__ = {
      get: () => useAudit.getState(),
      subscribe: useAudit.subscribe,
      reset: () => useAudit.getState().reset(),
    };
} catch {}

// Initialize persisted recent visits if present
try {
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem("ndn_audit_recent");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) {
        useAudit.setState((s) => ({ ...s, recent: arr.slice(-50) }));
      }
    }
  }
} catch {}
