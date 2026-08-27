import { afterEach, describe, expect, test } from "bun:test";
import { watch } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
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

const withTimeout = async <T>(promise: Promise<T>, message: string, timeoutMs = 5_000): Promise<T> => {
  let timer: Timer | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const waitForSocketOpen = (socket: WebSocket) =>
  withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("ws connection failed")), { once: true });
    }),
    "timed out waiting for ws open",
  );

const connectRawWebSocket = (port: number): Promise<Socket> =>
  withTimeout(
    new Promise((resolve, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      let response = "";
      socket.once("error", reject);
      socket.on("data", (chunk) => {
        response += chunk.toString("latin1");
        if (!response.includes("\r\n\r\n")) return;
        if (!response.startsWith("HTTP/1.1 101")) {
          reject(new Error(`websocket upgrade failed: ${response.split("\r\n", 1)[0]}`));
          socket.destroy();
          return;
        }
        socket.removeAllListeners("data");
        socket.removeListener("error", reject);
        resolve(socket);
      });
      socket.once("connect", () => {
        socket.write(
          "GET /api/ws HTTP/1.1\r\n" +
            `Host: 127.0.0.1:${port}\r\n` +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
            "Sec-WebSocket-Version: 13\r\n\r\n",
        );
      });
    }),
    "timed out waiting for raw websocket upgrade",
  );

const sendRawText = (socket: Socket, text: string) => {
  const payload = Buffer.from(text);
  const mask = Buffer.from([1, 2, 3, 4]);
  const frame = Buffer.alloc(2 + mask.length + payload.length);
  frame[0] = 0x81;
  frame[1] = 0x80 | payload.length;
  mask.copy(frame, 2);
  for (let idx = 0; idx < payload.length; idx++) frame[6 + idx] = payload[idx] ^ mask[idx % 4];
  socket.write(frame);
};

const waitForRawCloseCode = (socket: Socket) =>
  withTimeout(
    new Promise<number>((resolve, reject) => {
      let buffered = Buffer.alloc(0);
      socket.once("error", reject);
      socket.on("data", (chunk) => {
        buffered = Buffer.concat([buffered, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
        if (buffered.length < 2) return;
        const length = buffered[1] & 0x7f;
        if (buffered.length < 2 + length || (buffered[0] & 0x0f) !== 8) return;
        resolve(length >= 2 ? buffered.readUInt16BE(2) : 1005);
      });
    }),
    "timed out waiting for raw websocket close",
  );

const observeNextRelayEvent = async (filePath: string, trigger: () => void | Promise<void>): Promise<string> => {
  const previous = (await readFile(filePath, "utf8")).trim().split("\n").filter(Boolean).length;
  let watcher: ReturnType<typeof watch> | undefined;
  let timer: Timer | undefined;
  try {
    const observed = new Promise<string>((resolve, reject) => {
      const inspect = () => {
        void readFile(filePath, "utf8")
          .then((text) => {
            const codes = text.trim().split("\n").filter(Boolean);
            if (codes.length > previous) resolve(codes[previous] ?? "");
          })
          .catch(reject);
      };
      watcher = watch(filePath, inspect);
      watcher.once("error", reject);
      timer = setTimeout(() => reject(new Error("timed out waiting for upstream relay event")), 5_000);
    });
    await trigger();
    return await observed;
  } finally {
    watcher?.close();
    if (timer) clearTimeout(timer);
  }
};

const writeWebSocketRelayChild = async (serverPath: string, observedPath: string) => {
  await Bun.write(observedPath, "");
  await Bun.write(
    serverPath,
    `
      import { appendFileSync } from "node:fs";
      import { createHash } from "node:crypto";
      import { createServer } from "node:net";

      const observedPath = ${JSON.stringify(observedPath)};
      const sockets = new Set();
      const closeFrame = (code) => {
        const frame = Buffer.alloc(4);
        frame[0] = 0x88;
        frame[1] = 2;
        frame.writeUInt16BE(code, 2);
        return frame;
      };
      const ws = createServer((socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
        let upgraded = false;
        let buffered = Buffer.alloc(0);
        socket.on("data", (chunk) => {
          buffered = Buffer.concat([buffered, chunk]);
          if (!upgraded) {
            const end = buffered.indexOf("\\r\\n\\r\\n");
            if (end === -1) return;
            const request = buffered.subarray(0, end + 4).toString("latin1");
            const key = request.match(/sec-websocket-key:\\s*(.+)\\r\\n/i)?.[1]?.trim();
            if (!key) return socket.destroy();
            const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
            socket.write("HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: " + accept + "\\r\\n\\r\\n");
            appendFileSync(observedPath, "open\\n");
            buffered = buffered.subarray(end + 4);
            upgraded = true;
          }
          while (buffered.length >= 2) {
            const opcode = buffered[0] & 0x0f;
            const masked = (buffered[1] & 0x80) !== 0;
            let length = buffered[1] & 0x7f;
            let offset = 2;
            if (length === 126) {
              if (buffered.length < 4) return;
              length = buffered.readUInt16BE(2);
              offset = 4;
            }
            const frameLength = offset + (masked ? 4 : 0) + length;
            if (buffered.length < frameLength) return;
            const mask = masked ? buffered.subarray(offset, offset + 4) : null;
            if (mask) offset += 4;
            const payload = Buffer.from(buffered.subarray(offset, offset + length));
            if (mask) for (let idx = 0; idx < payload.length; idx++) payload[idx] ^= mask[idx % 4];
            buffered = buffered.subarray(frameLength);
            if (opcode === 8) {
              const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
              appendFileSync(observedPath, String(code) + "\\n");
              socket.write(closeFrame(code));
              socket.end();
            } else if (opcode === 1) {
              const command = payload.toString();
              if (command === "close-abnormally") socket.resetAndDestroy();
              if (command === "close-legally") socket.write(closeFrame(4000));
            }
          }
        });
      });

      export const server = {
        async start() {
          const http = Bun.serve({
            unix: process.env.AKAN_CHILD_SOCKET,
            fetch() { return new Response("ok"); },
          });
          await new Promise((resolve) => ws.listen(0, "127.0.0.1", resolve));
          const address = ws.address();
          process.on("message", (message) => {
            if (!message || typeof message !== "object") return;
            if (message.type === "health.ping") {
              process.send?.({ type: "health.pong", nonce: message.nonce, sentAt: message.sentAt, pid: process.pid });
            }
            if (message.type === "shutdown") {
              for (const socket of sockets) socket.destroy();
              http.stop(true);
              ws.close(() => process.exit(0));
            }
          });
          process.send?.({
            type: "ready",
            pid: process.pid,
            replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
            role: process.env.SERVER_MODE ?? "all",
            upstream: { type: "unix", socketPath: process.env.AKAN_CHILD_SOCKET },
            wsUpstream: { type: "tcp", host: "127.0.0.1", port: address.port },
            healthPath: "/_akan/app/child-health",
          });
        },
      };
    `,
  );
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

  test("abandons a dev-hosted child that never boots and marks it crashed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-app-crashloop-"));
    tempRoots.push(root);
    const serverPath = path.join(root, "server.ts");
    const runtimeDir = path.join(root, "runtime");
    const port = 24_000 + Math.floor(Math.random() * 10_000);

    await Bun.write(
      serverPath,
      `
          export const server = {
            start() { throw new Error("intentional-boot-failure"); },
          };
        `,
    );

    const originalCommandType = process.env.AKAN_COMMAND_TYPE;
    process.env.AKAN_COMMAND_TYPE = "start";
    let app: AkanApp;
    try {
      app = new AkanApp(serverPath, { replica: 1, runtimeDir, port });
    } finally {
      if (originalCommandType === undefined) delete process.env.AKAN_COMMAND_TYPE;
      else process.env.AKAN_COMMAND_TYPE = originalCommandType;
    }
    const running = app.start();
    try {
      const fetchChild = async () => {
        const res = await fetch(`http://127.0.0.1:${port}/_akan/app/health`).catch(() => null);
        if (!res?.ok) return null;
        const body = (await res.json()) as {
          children: Array<{ status: string; restartCount: number; restartPending: boolean; lastErrorMessage?: string }>;
        };
        return body.children[0] ?? null;
      };
      const crashed = await waitFor(async () => {
        const child = await fetchChild();
        return child?.status === "crashed" ? child : null;
      }, 12_000);

      // Three consecutive failed boots = the initial spawn plus two scheduled restarts.
      expect(crashed.restartCount).toBe(2);
      expect(crashed.restartPending).toBe(false);
      expect(crashed.lastErrorMessage ?? "").toContain("intentional-boot-failure");

      await wait(1_500);
      const settled = await fetchChild();
      expect(settled?.status).toBe("crashed");
      expect(settled?.restartCount).toBe(2);

      // With every traffic replica crashed, the gateway surfaces the boot error instead of a bare 503.
      const htmlRes = await fetch(`http://127.0.0.1:${port}/`, { headers: { accept: "text/html" } });
      expect(htmlRes.status).toBe(503);
      expect(htmlRes.headers.get("content-type") ?? "").toContain("text/html");
      const htmlBody = await htmlRes.text();
      expect(htmlBody).toContain("Backend failed to start");
      expect(htmlBody).toContain("intentional-boot-failure");

      const textRes = await fetch(`http://127.0.0.1:${port}/api/anything`);
      expect(textRes.status).toBe(503);
      expect(await textRes.text()).toContain("intentional-boot-failure");
    } finally {
      await app.stop();
      await Promise.race([running, wait(1_000)]);
    }
  }, 20_000);

  test("honors an explicitly configured runtimeDir for child sockets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-app-runtime-dir-"));
    tempRoots.push(root);
    const serverPath = path.join(root, "server.ts");
    const runtimeDir = path.join(root, "custom-runtime");
    const port = 24_000 + Math.floor(Math.random() * 10_000);

    await Bun.write(
      serverPath,
      `
          export const server = {
            async start() {
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

      const entries = await readdir(runtimeDir);
      expect(entries.some((name) => /^akan-child-.*\.sock$/.test(name))).toBe(true);
    } finally {
      await app.stop();
      await Promise.race([running, wait(1_000)]);
    }
  }, 20_000);

  test("force-kills a child that ignores graceful shutdown within the shutdown budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-app-slow-shutdown-"));
    tempRoots.push(root);
    const serverPath = path.join(root, "server.ts");
    const runtimeDir = path.join(root, "runtime");
    const port = 24_000 + Math.floor(Math.random() * 10_000);

    await Bun.write(
      serverPath,
      `
          export const server = {
            async start() {
              const http = Bun.serve({
                unix: process.env.AKAN_CHILD_SOCKET,
                fetch() { return new Response("ok"); },
              });
              // Simulate a hung shutdown: ignore the shutdown message and trap SIGTERM.
              process.on("SIGTERM", () => {});
              process.on("message", (message) => {
                if (!message || typeof message !== "object") return;
                if (message.type === "health.ping") {
                  process.send?.({ type: "health.pong", nonce: message.nonce, sentAt: message.sentAt, pid: process.pid });
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

    const originalWait = process.env.AKAN_CHILD_SHUTDOWN_WAIT_MS;
    process.env.AKAN_CHILD_SHUTDOWN_WAIT_MS = "500";
    const app = new AkanApp(serverPath, { replica: 1, runtimeDir, port });
    const running = app.start();
    try {
      const health = await waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/_akan/app/health`).catch(() => null);
        if (!res?.ok) return null;
        const body = (await res.json()) as { children: Array<{ ready: boolean; pid?: number }> };
        return body.children[0]?.ready && body.children[0].pid ? body : null;
      });
      const childPid = health.children[0]?.pid;
      if (!childPid) throw new Error("child pid missing from health status");

      const stopStarted = Date.now();
      await app.stop();
      expect(Date.now() - stopStarted).toBeLessThan(4_000);

      const isAlive = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      expect(isAlive(childPid)).toBe(false);
    } finally {
      await app.stop();
      if (originalWait === undefined) delete process.env.AKAN_CHILD_SHUTDOWN_WAIT_MS;
      else process.env.AKAN_CHILD_SHUTDOWN_WAIT_MS = originalWait;
      await Promise.race([running, wait(1_000)]);
    }
  }, 20_000);

  test("routes websocket upgrades via the child-reported ws upstream", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-app-ws-upstream-"));
    tempRoots.push(root);
    const serverPath = path.join(root, "server.ts");
    const runtimeDir = path.join(root, "runtime");
    const port = 24_000 + Math.floor(Math.random() * 10_000);

    await Bun.write(
      serverPath,
      `
          export const server = {
            async start() {
              const http = Bun.serve({
                unix: process.env.AKAN_CHILD_SOCKET,
                fetch() { return new Response("ok"); },
              });
              // Bind an ephemeral ws port instead of the preferred AKAN_CHILD_WS_PORT and report
              // it back, as a child does after falling back from a port collision.
              const ws = Bun.serve({
                port: 0,
                fetch(req, server) {
                  if (server.upgrade(req, { data: {} })) return undefined;
                  return new Response("no-upgrade");
                },
                websocket: {
                  message(socket, message) { socket.send("echo:" + message); },
                },
              });
              process.on("message", (message) => {
                if (!message || typeof message !== "object") return;
                if (message.type === "health.ping") {
                  process.send?.({ type: "health.pong", nonce: message.nonce, sentAt: message.sentAt, pid: process.pid });
                }
                if (message.type === "shutdown") {
                  http.stop(true);
                  ws.stop(true);
                  process.exit(0);
                }
              });
              process.send?.({
                type: "ready",
                pid: process.pid,
                replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
                role: process.env.SERVER_MODE ?? "all",
                upstream: { type: "unix", socketPath: process.env.AKAN_CHILD_SOCKET },
                wsUpstream: { type: "tcp", host: "127.0.0.1", port: ws.port },
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

      const socket = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
      const reply = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timed out waiting for ws echo")), 5_000);
        socket.addEventListener("open", () => socket.send("hello"));
        socket.addEventListener("message", (event) => {
          clearTimeout(timeout);
          resolve(String(event.data));
        });
        socket.addEventListener("error", () => {
          clearTimeout(timeout);
          reject(new Error("ws connection failed"));
        });
      });
      socket.close();
      expect(reply).toBe("echo:hello");
    } finally {
      await app.stop();
      await Promise.race([running, wait(1_000)]);
    }
  }, 20_000);

  test("normalizes upstream close codes before relaying them to the client", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-app-ws-upstream-close-"));
    tempRoots.push(root);
    const serverPath = path.join(root, "server.ts");
    const observedPath = path.join(root, "observed.txt");
    const runtimeDir = path.join(root, "runtime");
    // AkanApp does not expose the OS-assigned port, so the test must select a gateway port.
    const port = 24_000 + Math.floor(Math.random() * 10_000);
    await writeWebSocketRelayChild(serverPath, observedPath);

    const app = new AkanApp(serverPath, { replica: 1, runtimeDir, port });
    const running = app.start();
    try {
      await waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/_akan/app/health`).catch(() => null);
        if (!res?.ok) return null;
        const body = (await res.json()) as { children: Array<{ ready: boolean }> };
        return body.children[0]?.ready ? body : null;
      });

      const abnormal = await connectRawWebSocket(port);
      const abnormalClosed = waitForRawCloseCode(abnormal);
      sendRawText(abnormal, "close-abnormally");
      expect(await abnormalClosed).toBe(1001);
      abnormal.destroy();
      await expect(fetch(`http://127.0.0.1:${port}/`).then((res) => res.text())).resolves.toBe("ok");

      const legal = await connectRawWebSocket(port);
      const legalClosed = waitForRawCloseCode(legal);
      sendRawText(legal, "close-legally");
      expect(await legalClosed).toBe(4000);
      legal.destroy();
      await expect(fetch(`http://127.0.0.1:${port}/`).then((res) => res.text())).resolves.toBe("ok");
    } finally {
      await app.stop();
      await withTimeout(running, "timed out waiting for AkanApp to stop", 1_000);
    }
  }, 20_000);

  test("normalizes client close codes before relaying them to the upstream", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-app-ws-client-close-"));
    tempRoots.push(root);
    const serverPath = path.join(root, "server.ts");
    const observedPath = path.join(root, "observed.txt");
    const runtimeDir = path.join(root, "runtime");
    // AkanApp does not expose the OS-assigned port, so the test must select a gateway port.
    const port = 24_000 + Math.floor(Math.random() * 10_000);
    await writeWebSocketRelayChild(serverPath, observedPath);

    const app = new AkanApp(serverPath, { replica: 1, runtimeDir, port });
    const running = app.start();
    try {
      await waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/_akan/app/health`).catch(() => null);
        if (!res?.ok) return null;
        const body = (await res.json()) as { children: Array<{ ready: boolean }> };
        return body.children[0]?.ready ? body : null;
      });

      let abnormal: Socket | undefined;
      expect(
        await observeNextRelayEvent(observedPath, async () => {
          abnormal = await connectRawWebSocket(port);
        }),
      ).toBe("open");
      expect(
        await observeNextRelayEvent(observedPath, () => {
          abnormal?.resetAndDestroy();
        }),
      ).toBe("1001");
      await expect(fetch(`http://127.0.0.1:${port}/`).then((res) => res.text())).resolves.toBe("ok");

      let legal: WebSocket | undefined;
      expect(
        await observeNextRelayEvent(observedPath, async () => {
          legal = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
          await waitForSocketOpen(legal);
        }),
      ).toBe("open");
      expect(await observeNextRelayEvent(observedPath, () => legal?.close(4000))).toBe("4000");
      await expect(fetch(`http://127.0.0.1:${port}/`).then((res) => res.text())).resolves.toBe("ok");
    } finally {
      await app.stop();
      await withTimeout(running, "timed out waiting for AkanApp to stop", 1_000);
    }
  }, 20_000);
});
