import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AkanApp } from "./akanApp";
import { makeAkanChildProxyHeaders } from "./akanAppHeaders";

const tempRoots: string[] = [];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async <T>(fn: () => Promise<T | null>, timeoutMs = 5_000): Promise<T> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await wait(50);
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("makeAkanChildProxyHeaders", () => {
  test("preserves public forwarded host and protocol for child requests", () => {
    const req = new Request("http://akan-internal/", {
      headers: {
        connection: "keep-alive",
        host: "internal.example",
        "x-forwarded-for": "203.0.113.10",
        "x-forwarded-host": "akanjs.com",
        "x-forwarded-proto": "https",
        "x-real-ip": "10.0.0.5",
      },
    });

    const headers = makeAkanChildProxyHeaders(req, 2);

    expect(headers.get("connection")).toBeNull();
    expect(headers.get("host")).toBe("akan-child");
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.10, 10.0.0.5");
    expect(headers.get("x-forwarded-host")).toBe("akanjs.com");
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.get("x-akan-child-idx")).toBe("2");
  });

  test("falls back to request host and protocol without upstream forwarded headers", () => {
    const req = new Request("http://internal.example/", {
      headers: {
        host: "internal.example",
      },
    });

    const headers = makeAkanChildProxyHeaders(req, 0);

    expect(headers.get("x-forwarded-host")).toBe("internal.example");
    expect(headers.get("x-forwarded-proto")).toBe("http");
  });
});

describe("AkanApp", () => {
  test("restarts only the crashed replica", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-app-restart-"));
    tempRoots.push(root);
    const counterPath = path.join(root, "counter.txt");
    const serverPath = path.join(root, "server.ts");
    const runtimeDir = path.join(root, "runtime");
    const port = 24_000 + Math.floor(Math.random() * 10_000);

    await Bun.write(
      serverPath,
      `
        const counterPath = ${JSON.stringify(counterPath)};
        export const server = {
          async start() {
            const file = Bun.file(counterPath);
            const previous = await file.exists() ? Number(await file.text()) : 0;
            const next = previous + 1;
            await Bun.write(counterPath, String(next));
            const http = Bun.serve({
              unix: process.env.AKAN_CHILD_SOCKET,
              fetch() { return new Response("ok"); },
            });
            process.on("message", (message) => {
              if (!message || typeof message !== "object") return;
              if (message.type === "health.ping") {
                process.send?.({ type: "health.pong", nonce: message.nonce, sentAt: message.sentAt, pid: process.pid });
              }
              if (message.type === "shutdown") {
                http.stop(true);
                process.exit(0);
              }
            });
            process.send?.({
              type: "ready",
              pid: process.pid,
              replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
              role: process.env.SERVER_MODE ?? "all",
              upstream: { type: "unix", socketPath: process.env.AKAN_CHILD_SOCKET },
              healthPath: "/_akan/app/child-health",
            });
            if (next === 1) setTimeout(() => process.exit(1), 50);
          },
        };
      `,
    );

    const app = new AkanApp(serverPath, { replica: 1, runtimeDir, port });
    const running = app.start();
    try {
      const health = await waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/_akan/app/health`).catch(() => null);
        if (!res?.ok) return null;
        const body = (await res.json()) as {
          children: Array<{ ready: boolean; restartCount: number; restartPending: boolean }>;
        };
        const child = body.children[0];
        return child?.ready && child.restartCount > 0 && !child.restartPending ? body : null;
      }, 6_000);

      expect(health.children[0]?.restartCount).toBeGreaterThanOrEqual(1);
      expect(await Bun.file(counterPath).text()).toBe("2");
    } finally {
      await app.stop();
      await Promise.race([running, wait(1_000)]);
    }
  });

  test("restarts a ready child when its unix upstream stops accepting connections", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-app-upstream-"));
    tempRoots.push(root);
    const counterPath = path.join(root, "counter.txt");
    const serverPath = path.join(root, "server.ts");
    const runtimeDir = path.join(root, "runtime");
    const port = 24_000 + Math.floor(Math.random() * 10_000);

    await Bun.write(
      serverPath,
      `
        const counterPath = ${JSON.stringify(counterPath)};
        export const server = {
          async start() {
            const file = Bun.file(counterPath);
            const previous = await file.exists() ? Number(await file.text()) : 0;
            const next = previous + 1;
            await Bun.write(counterPath, String(next));
            let http;
            let ws;
            http = Bun.serve({
              unix: process.env.AKAN_CHILD_SOCKET,
              fetch(req) {
                const url = new URL(req.url);
                if (url.pathname === "/stop-http") {
                  setTimeout(() => http?.stop(true), 0);
                  return new Response("stopping");
                }
                return new Response("ok");
              },
            });
            ws = Bun.serve({
              port: Number(process.env.AKAN_CHILD_WS_PORT),
              fetch() { return new Response("ws fallback"); },
            });
            process.on("message", (message) => {
              if (!message || typeof message !== "object") return;
              if (message.type === "health.ping") {
                process.send?.({ type: "health.pong", nonce: message.nonce, sentAt: message.sentAt, pid: process.pid });
              }
              if (message.type === "shutdown") {
                try { http?.stop(true); } catch {}
                try { ws?.stop(true); } catch {}
                process.exit(0);
              }
            });
            process.send?.({
              type: "ready",
              pid: process.pid,
              replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
              role: process.env.SERVER_MODE ?? "all",
              upstream: { type: "unix", socketPath: process.env.AKAN_CHILD_SOCKET },
              healthPath: "/_akan/app/child-health",
            });
          },
        };
      `,
    );

    const app = new AkanApp(serverPath, { replica: 1, runtimeDir, port });
    const running = app.start();
    try {
      await waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/_akan/app/health`).catch(() => null);
        if (!res?.ok) return null;
        const body = (await res.json()) as { children: Array<{ ready: boolean }> };
        return body.children[0]?.ready ? body : null;
      });

      await expect(fetch(`http://127.0.0.1:${port}/stop-http`).then((res) => res.text())).resolves.toBe("stopping");
      await wait(100);

      const failed = await fetch(`http://127.0.0.1:${port}/after-stop`);
      expect(failed.status).toBe(503);
      expect(await failed.text()).toContain("upstream is unreachable");

      const recovered = await waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/_akan/app/health`).catch(() => null);
        if (!res?.ok) return null;
        const body = (await res.json()) as {
          children: Array<{ ready: boolean; restartCount: number; restartPending: boolean }>;
        };
        const child = body.children[0];
        return child?.ready && child.restartCount > 0 && !child.restartPending ? body : null;
      }, 6_000);

      expect(recovered.children[0]?.restartCount).toBeGreaterThanOrEqual(1);
      expect(await Bun.file(counterPath).text()).toBe("2");
      await expect(fetch(`http://127.0.0.1:${port}/after-restart`).then((res) => res.text())).resolves.toBe("ok");
    } finally {
      await app.stop();
      await Promise.race([running, wait(1_000)]);
    }
  });
});
