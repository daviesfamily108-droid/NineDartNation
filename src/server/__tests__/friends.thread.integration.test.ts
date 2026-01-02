import { spawn } from "child_process";
import { describe, expect, test } from "vitest";

const SERVER_CMD = "node";
const SERVER_ARGS = ["server/server.cjs"]; // built server entry used by other integration tests

async function waitForServer(port: number, timeoutMs = 15000) {
  const BASE_URL = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function getJsonOrText(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const status = res.status;
  const text = await res.text();
  if (!ct.includes("application/json")) {
    throw new Error(`Non-JSON response (status=${status}): ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON (status=${status}): ${text.slice(0, 300)}`);
  }
}

describe("friends thread integration", () => {
  const shouldRun = process.env.NDN_RUNINTEGRATION === "1" || process.env.CI;
  const maybeTest = shouldRun ? test : test.skip;

  maybeTest(
    "stores and returns a 2-way thread",
    async () => {
      const port = 8800 + Math.floor(Math.random() * 1000);
      const BASE_URL = `http://127.0.0.1:${port}`;
      const server = spawn(SERVER_CMD, SERVER_ARGS, {
        env: {
          ...process.env,
          NDN_HTTPS: "0",
          PORT: String(port),
          NDN_DEBUG: "1",
        },
        stdio: "pipe",
      });

      let serverStdout = "";
      server.stdout?.on("data", (d) => {
        serverStdout += d.toString();
      });
      server.stderr?.on("data", (d) => {
        serverStdout += d.toString();
      });

      const ok = await waitForServer(port, 30000);
      if (!ok) {
        throw new Error(
          "Server health check failed; server logs:\n" + serverStdout,
        );
      }

      try {
        const alice = "alice@example.com";
        const bob = "bob@example.com";

        // Built server mounts API under /api.
        const apiPrefix = "/api";

        // Alice -> Bob
        const s1 = await fetch(`${BASE_URL}${apiPrefix}/friends/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromEmail: alice,
            toEmail: bob,
            message: "Hi Bob",
          }),
        });
        const j1 = await getJsonOrText(s1);
        expect(j1.ok).toBeTruthy();

        // Bob -> Alice
        const s2 = await fetch(`${BASE_URL}${apiPrefix}/friends/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromEmail: bob,
            toEmail: alice,
            message: "Hey Alice",
          }),
        });
        const j2 = await getJsonOrText(s2);
        expect(j2.ok).toBeTruthy();

        // Fetch thread from Alice perspective
        const t1 = await fetch(
          `${BASE_URL}${apiPrefix}/friends/thread?email=${encodeURIComponent(alice)}&other=${encodeURIComponent(bob)}`,
        );
        const tj1 = await getJsonOrText(t1);
        expect(tj1.ok).toBeTruthy();
        expect(Array.isArray(tj1.thread)).toBeTruthy();
        expect(tj1.thread.length).toBeGreaterThanOrEqual(2);

        const msgs = tj1.thread.map((m: any) => ({
          from: String(m.from || "").toLowerCase(),
          to: String(m.to || "").toLowerCase(),
          message: String(m.message || ""),
        }));

        expect(msgs.some((m: any) => m.from === alice && m.to === bob)).toBe(
          true,
        );
        expect(msgs.some((m: any) => m.from === bob && m.to === alice)).toBe(
          true,
        );

        // ensure ascending time order
        for (let i = 1; i < tj1.thread.length; i++) {
          expect(Number(tj1.thread[i].ts)).toBeGreaterThanOrEqual(
            Number(tj1.thread[i - 1].ts),
          );
        }
      } catch (err) {
        // Print logs for visibility
        console.error("Test error; server logs:\n", serverStdout);
        server.kill();
        throw err;
      } finally {
        try {
          server.kill();
        } catch {}
      }
    },
    60000,
  );
});
