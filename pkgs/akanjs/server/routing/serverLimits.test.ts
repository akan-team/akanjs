import { afterAll, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger } from "akanjs/common";
import { ServerLimits } from "./serverLimits";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

const post = (headers: Record<string, string>, body: BodyInit | null = "{}") =>
  new Request("http://127.0.0.1/api/x", { method: "POST", headers, body });

const drain = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return total;
    total += value.byteLength;
  }
};

describe("ServerLimits timeouts", () => {
  test("closes a silent connection after two minutes, and never under `akan start`", () => {
    expect(new ServerLimits({}).idleTimeout).toBe(120);
    expect(new ServerLimits({ AKAN_COMMAND_TYPE: "start" }).idleTimeout).toBe(0);
    expect(new ServerLimits({}).wsIdleTimeout).toBe(120);
    expect(new ServerLimits({ AKAN_COMMAND_TYPE: "start" }).wsIdleTimeout).toBe(120);
  });

  test("takes seconds from the env, 0 for never, capped at what Bun accepts", () => {
    expect(new ServerLimits({ AKAN_IDLE_TIMEOUT: "30" }).idleTimeout).toBe(30);
    expect(new ServerLimits({ AKAN_IDLE_TIMEOUT: "30s" }).idleTimeout).toBe(30);
    expect(new ServerLimits({ AKAN_IDLE_TIMEOUT: " 45 S " }).idleTimeout).toBe(45);
    expect(new ServerLimits({ AKAN_IDLE_TIMEOUT: "0" }).idleTimeout).toBe(0);
    expect(new ServerLimits({ AKAN_IDLE_TIMEOUT: "9999" }).idleTimeout).toBe(255);
    expect(new ServerLimits({ AKAN_IDLE_TIMEOUT: "soon" }).idleTimeout).toBe(120);
    expect(new ServerLimits({ AKAN_WS_IDLE_TIMEOUT: "0" }).wsIdleTimeout).toBe(0);
  });

  test("warns once about a value it cannot read, and serves with the default", () => {
    const warn = spyOn(Logger.prototype, "warn");
    try {
      expect(new ServerLimits({ AKAN_IDLE_TIMEOUT: "2m" }).idleTimeout).toBe(120);
      expect(new ServerLimits({ AKAN_IDLE_TIMEOUT: "2m" }).idleTimeout).toBe(120);
      expect(new ServerLimits({ AKAN_MAX_UPLOAD_BODY: "huge" }).uploadBodyBytes).toBe(128 * 1024 * 1024);
      const lines = warn.mock.calls.map(([line]) => String(line));
      expect(lines).toEqual([
        'AKAN_IDLE_TIMEOUT="2m" is not seconds such as 30 or 30s; using 120 s.',
        'AKAN_MAX_UPLOAD_BODY="huge" is not a size such as 512mb, 1.5g or 16MiB; using 128 MiB.',
      ]);
    } finally {
      warn.mockRestore();
    }
  });
});

const exchange = (port: number, pathname: string, waitMs: number) =>
  new Promise<{ answeredAt: number | null; closedAt: number | null }>((resolve) => {
    const start = performance.now();
    let answeredAt: number | null = null;
    let received = "";
    let socket: { end(): void } | null = null;
    const giveUp = setTimeout(() => {
      socket?.end();
      resolve({ answeredAt, closedAt: null });
    }, waitMs);
    void Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open: (opened) => {
          socket = opened;
          opened.write(`GET ${pathname} HTTP/1.1\r\nHost: x\r\nConnection: keep-alive\r\n\r\n`);
        },
        data: (_socket, chunk) => {
          received += chunk.toString();
          if (answeredAt === null && received.includes("done")) answeredAt = performance.now() - start;
        },
        close: () => {
          clearTimeout(giveUp);
          resolve({ answeredAt, closedAt: performance.now() - start });
        },
        error: () => undefined,
      },
    });
  });

describe("ServerLimits.holdOpen", () => {
  test("answers a handler slower than the idle limit, and still closes the connection once it sits idle", async () => {
    const slow = async () => {
      await Bun.sleep(5_000);
      return new Response("done");
    };
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      idleTimeout: 1,
      fetch: (req, srv) => (new URL(req.url).pathname === "/held" ? ServerLimits.holdOpen(srv, req, 1, slow) : slow()),
    });
    try {
      const [held, bare] = await Promise.all([
        exchange(server.port as number, "/held", 15_000),
        exchange(server.port as number, "/bare", 15_000),
      ]);
      expect(bare).toMatchObject({ answeredAt: null, closedAt: expect.any(Number) });
      expect(held.answeredAt).toBeGreaterThanOrEqual(4_900);
      expect(held.closedAt).toBeGreaterThan(held.answeredAt ?? 0);
    } finally {
      server.stop(true);
    }
  }, 20_000);
});

describe("ServerLimits bodies", () => {
  test("keeps the 128 MiB ceiling for uploads and 16 MiB for every other body", () => {
    const limits = new ServerLimits({});
    expect(limits.uploadBodyBytes).toBe(128 * 1024 * 1024);
    expect(limits.bodyLimitOf(post({ "content-type": "application/json" }))).toBe(16 * 1024 * 1024);
    expect(limits.bodyLimitOf(post({ "content-type": "multipart/form-data; boundary=x" }))).toBeNull();
    expect(limits.bodyLimitOf(new Request("http://127.0.0.1/x"))).toBeNull();
  });

  test("reads sizes with units, turns the smaller cap off, and never lets it pass the ceiling", () => {
    const limits = new ServerLimits({ AKAN_MAX_UPLOAD_BODY: "1gb", AKAN_MAX_REQUEST_BODY: "64kb" });
    expect(limits.uploadBodyBytes).toBe(1024 ** 3);
    expect(limits.requestBodyBytes).toBe(64 * 1024);
    expect(new ServerLimits({ AKAN_MAX_REQUEST_BODY: "off" }).requestBodyBytes).toBeNull();
    expect(new ServerLimits({ AKAN_MAX_REQUEST_BODY: "0" }).requestBodyBytes).toBeNull();
    expect(new ServerLimits({ AKAN_MAX_UPLOAD_BODY: "1mb", AKAN_MAX_REQUEST_BODY: "8mb" }).requestBodyBytes).toBe(
      1024 * 1024,
    );
    expect(new ServerLimits({ AKAN_MAX_UPLOAD_BODY: "lots" }).uploadBodyBytes).toBe(128 * 1024 * 1024);
  });

  test("reads the common size spellings: k, m and g in any case, an optional b or ib, and decimals", () => {
    const upload = (value: string) => new ServerLimits({ AKAN_MAX_UPLOAD_BODY: value }).uploadBodyBytes;
    expect(upload("16M")).toBe(16 * 1024 ** 2);
    expect(upload("16MiB")).toBe(16 * 1024 ** 2);
    expect(upload("512 mb")).toBe(512 * 1024 ** 2);
    expect(upload("1.5mb")).toBe(1.5 * 1024 ** 2);
    expect(upload("2G")).toBe(2 * 1024 ** 3);
    expect(upload("64k")).toBe(64 * 1024);
    expect(upload("4096")).toBe(4096);
    expect(upload("4096b")).toBe(4096);
    expect(new ServerLimits({ AKAN_MAX_REQUEST_BODY: "32M" }).requestBodyBytes).toBe(32 * 1024 ** 2);
  });

  test("answers a declared length over the limit 413 before reading it", () => {
    const limits = new ServerLimits({ AKAN_MAX_REQUEST_BODY: "1kb" });
    const refused = limits.refuseDeclared(post({ "content-type": "application/json", "content-length": "2048" }));
    expect(refused?.status).toBe(413);
    expect(limits.refuseDeclared(post({ "content-type": "application/json", "content-length": "512" }))).toBeNull();
    expect(
      limits.refuseDeclared(post({ "content-type": "multipart/form-data; boundary=x", "content-length": "2048" })),
    ).toBeNull();
  });

  test("lets the agent turn, which resends its transcript's attachments, past the JSON cap up to the ceiling", () => {
    const limits = new ServerLimits({});
    const turn = (path: string, length: number) =>
      new Request(`http://127.0.0.1${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(length) },
        body: "{}",
      });
    const relayLimits = 64 * 1024 * 1024 + 3 * 8_000_000;
    expect(limits.uploadBodyBytes).toBeGreaterThan(relayLimits);
    expect(limits.bodyLimitOf(turn("/api/runAgentTurn", 2))).toBeNull();
    expect(limits.refuseDeclared(turn("/api/runAgentTurn", relayLimits))).toBeNull();
    expect(limits.refuseDeclared(turn("/runAgentTurn?x=1", relayLimits))).toBeNull();
    expect(limits.refuseDeclared(turn("/api/runAgentTurnLog", relayLimits))?.status).toBe(413);
    expect(limits.refuseDeclared(turn("/api/x", relayLimits))?.status).toBe(413);
  });

  test("errors a streamed body once it passes the limit, and lets a smaller one through whole", async () => {
    const bytes = new Uint8Array(1024);
    let exceeded = false;
    const over = ServerLimits.limitBody(new Blob([bytes, bytes]).stream(), 1500, () => {
      exceeded = true;
    });
    const failure = await drain(over).catch((error: unknown) => error);
    expect(ServerLimits.isPayloadTooLarge(failure)).toBe(true);
    expect(exceeded).toBe(true);
    expect(await drain(ServerLimits.limitBody(new Blob([bytes]).stream(), 1500))).toBe(1024);
  });
});

describe("ServerLimits listen address", () => {
  test("binds loopback under `akan start` unless a container or the env says otherwise", () => {
    expect(ServerLimits.listenHostname({ AKAN_COMMAND_TYPE: "start" }, false)).toBe("127.0.0.1");
    expect(ServerLimits.listenHostname({ AKAN_COMMAND_TYPE: "start" }, true)).toBeUndefined();
    expect(ServerLimits.listenHostname({ AKAN_COMMAND_TYPE: "start", KUBERNETES_SERVICE_HOST: "10.0.0.1" })).toBe(
      undefined,
    );
    expect(ServerLimits.listenHostname({ AKAN_COMMAND_TYPE: "start", AKAN_LISTEN_HOST: "*" }, false)).toBeUndefined();
    expect(ServerLimits.listenHostname({ AKAN_COMMAND_TYPE: "start", AKAN_LISTEN_HOST: "0.0.0.0" }, false)).toBe(
      "0.0.0.0",
    );
  });

  test("leaves a production server on every interface", () => {
    expect(ServerLimits.listenHostname({}, false)).toBeUndefined();
    expect(ServerLimits.listenHostname({ AKAN_LISTEN_HOST: "127.0.0.1" }, true)).toBe("127.0.0.1");
  });
});

describe("ServerLimits.serveOwnerOnly", () => {
  test.skipIf(process.platform === "win32")("leaves the socket to its owner alone, even under an open umask", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "akan-owner-sock-"));
    roots.push(root);
    const socketPath = path.join(root, "child.sock");
    const previous = process.umask(0);
    try {
      const server = ServerLimits.serveOwnerOnly(socketPath, () =>
        Bun.serve({ unix: socketPath, fetch: () => new Response("ok") }),
      );
      try {
        expect(fs.statSync(socketPath).mode & 0o777).toBe(0o600);
        expect(process.umask()).toBe(0);
      } finally {
        server.stop(true);
      }
    } finally {
      process.umask(previous);
    }
  });
});
