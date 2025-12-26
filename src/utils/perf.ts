export function createRenderCounter(label: string) {
  let renders = 0;
  return {
    tick() {
      renders += 1;
      return renders;
    },
    get() {
      return renders;
    },
    reset() {
      renders = 0;
    },
    label,
  };
}

export function perfEnabled(): boolean {
  try {
    // Vite env
    return (import.meta as any)?.env?.VITE_PERF_DEBUG === "1";
  } catch {
    return false;
  }
}

export function perfLog(...args: any[]) {
  if (!perfEnabled()) return;
  // eslint-disable-next-line no-console
  console.log("[perf]", ...args);
}
