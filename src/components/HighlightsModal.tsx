import React, { useEffect, useState } from "react";
import ResizableModal from "./ui/ResizableModal.js";
import { apiFetch } from "../utils/api.js";
import { useToast } from "../store/toast.js";

export default function HighlightsModal({ onClose }: { onClose?: () => void }) {
  const [highlights, setHighlights] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function fetchHighlights() {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        toast?.("You must be signed in to view highlights", { type: "error" });
        setLoading(false);
        return;
      }
      const res = await apiFetch("/api/user/highlights", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast?.(`Failed to fetch highlights: ${j.error || res.statusText}`, {
          type: "error",
        });
        setLoading(false);
        return;
      }
      const j = await res.json();
      setHighlights(j.highlights || []);
    } catch (err) {
      toast?.("Failed to fetch highlights", { type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHighlights();
  }, []);

  function download(h: any) {
    try {
      const blob = new Blob([JSON.stringify(h.data || h, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = `ndn-highlight-${(h.data && h.data.player) || "player"}-${h.ts || Date.now()}.json`;
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast?.("Downloaded highlight", { type: "success" });
    } catch (err) {
      toast?.("Download failed", { type: "error" });
    }
  }

  async function del(h: any) {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        toast?.("You must be signed in to delete highlights", {
          type: "error",
        });
        return;
      }
      const res = await apiFetch(`/api/user/highlights/${h.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast?.(`Delete failed: ${j.error || res.statusText}`, {
          type: "error",
        });
        return;
      }
      toast?.("Highlight deleted", { type: "success" });
      setHighlights((prev) =>
        prev.filter((x) => String(x.id) !== String(h.id)),
      );
    } catch (err) {
      toast?.("Delete failed", { type: "error" });
    }
  }

  return (
    <ResizableModal
      storageKey="ndn:modal:highlights"
      className="ndn-modal w-[640px]"
      defaultWidth={640}
      defaultHeight={420}
      minWidth={420}
      minHeight={220}
      initialFitHeight
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Saved Highlights</div>
          <div>
            <button
              className="btn btn-ghost"
              onClick={() => {
                onClose?.();
              }}
            >
              Close
            </button>
          </div>
        </div>
        {loading ? (
          <div className="text-sm">Loading...</div>
        ) : highlights.length === 0 ? (
          <div className="text-sm opacity-70">
            No highlights saved to your account.
          </div>
        ) : (
          <div className="space-y-2 max-h-[48vh] overflow-y-auto">
            {highlights.map((h) => (
              <div
                key={h.id}
                className="p-2 rounded border bg-black/5 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm">
                    <strong>{(h.data && h.data.player) || "Player"}</strong> —
                    Score: {(h.data && h.data.score) || "N/A"} — Darts:{" "}
                    {(h.data && h.data.darts) || "N/A"}
                  </div>
                  <div className="text-xs opacity-70">
                    {new Date(h.ts || 0).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn px-2 py-0.5 text-sm"
                    onClick={() => download(h)}
                  >
                    Download
                  </button>
                  <button
                    className="btn btn-error px-2 py-0.5 text-sm"
                    onClick={() => del(h)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ResizableModal>
  );
}
