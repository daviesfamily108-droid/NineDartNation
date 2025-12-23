import { describe, it, expect } from "vitest";
import { broadcastMessage, subscribeMatchSync } from "../broadcast";

describe("broadcast helpers", () => {
  it("subscribe receives messages from broadcastMessage via BroadcastChannel", async () => {
    // Install a small mock BroadcastChannel that simulates multi-instance pub/sub
    const OriginalBC = (global as any).BroadcastChannel;
    try {
      const channels = new Map<string, Set<any>>();
      class MockBC {
        name: string;
        onmessage: ((ev: any) => void) | null = null;
        constructor(name: string) {
          this.name = name;
          const set = channels.get(name) || new Set();
          set.add(this);
          channels.set(name, set);
        }
        postMessage(msg: any) {
          // deliver asynchronously like a real BroadcastChannel
          setTimeout(() => {
            const set = channels.get(this.name);
            if (!set) return;
            for (const inst of Array.from(set)) {
              try {
                if (inst !== this && inst.onmessage)
                  inst.onmessage({ data: msg });
              } catch {}
            }
          }, 0);
        }
        close() {
          const set = channels.get(this.name);
          if (!set) return;
          set.delete(this);
        }
      }
      (global as any).BroadcastChannel = MockBC;

      await new Promise<void>((resolve, reject) => {
        const unsub = subscribeMatchSync((msg: any) => {
          try {
            expect(msg).toBeDefined();
            expect(msg.type).toBe("test-msg");
            unsub && unsub();
            resolve();
          } catch (e) {
            unsub && unsub();
            reject(e);
          }
        });
        // broadcast from another "tab" (the MockBC will forward to other instances)
        broadcastMessage({ type: "test-msg", payload: 123 });
      });
    } finally {
      try {
        (global as any).BroadcastChannel = OriginalBC;
      } catch {}
    }
  });
});
