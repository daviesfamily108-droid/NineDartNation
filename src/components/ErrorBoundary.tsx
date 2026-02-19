import { Component, type ReactNode } from "react";

/** Detect chunk-load / dynamic-import failures caused by stale deploys. */
function isChunkLoadError(msg: string): boolean {
  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /loading chunk .* failed/i.test(msg) ||
    /importing a module script failed/i.test(msg)
  );
}

export default class ErrorBoundary extends Component<
  {
    children: ReactNode;
  },
  { hasError: boolean; message?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message || err) };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[ErrorBoundary]", error, info);

    // Auto-reload once on stale-chunk errors (new deploy invalidated old hashes)
    const msg = String(error?.message || error || "");
    if (isChunkLoadError(msg)) {
      const key = "ndn_chunk_reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return;
      }
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="card max-w-lg w-full text-center">
            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <p className="opacity-80 mb-4">
              Please refresh the page. If this persists, let us know.
            </p>
            {this.state.message && (
              <pre className="text-xs bg-black/40 rounded p-2 overflow-auto text-left">
                {this.state.message}
              </pre>
            )}
            <button
              className="btn mt-4"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}
