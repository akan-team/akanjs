import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { existsSync, rmSync, statSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Logger, logSeverity } from "akanjs/common";
import { type LogControlRequest, type LogControlResponse, LogControlSocket } from "./logControlSocket";
import { LogHub } from "./logHub";

class Client {
  readonly #lines: LogControlResponse[] = [];
  readonly #waiters: ((line: LogControlResponse) => void)[] = [];
  #socket!: Bun.Socket<undefined>;
  #inbox = "";

  async connect(unix: string) {
    this.#socket = await Bun.connect<undefined>({
      unix,
      socket: {
        data: (_socket, chunk) => {
          this.#inbox += chunk.toString("utf8");
          let newline = this.#inbox.indexOf("\n");
          while (newline >= 0) {
            const line = JSON.parse(this.#inbox.slice(0, newline)) as LogControlResponse;
            this.#inbox = this.#inbox.slice(newline + 1);
            const waiter = this.#waiters.shift();
            if (waiter) waiter(line);
            else this.#lines.push(line);
            newline = this.#inbox.indexOf("\n");
          }
        },
      },
    });
  }
  send(request: LogControlRequest) {
    this.#socket.write(`${JSON.stringify(request)}\n`);
  }
  next(timeoutMs = 2_000): Promise<LogControlResponse> {
    const queued = this.#lines.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no line within timeout")), timeoutMs);
      this.#waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }
  async idle(ms = 50) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return this.#lines.length;
  }
  close() {
    this.#socket.end();
  }
}

const answers = async (unix: string) => {
  try {
    const socket = await Bun.connect<undefined>({ unix, socket: { data: () => undefined } });
    socket.end();
    return true;
  } catch {
    return false;
  }
};

describe("LogControlSocket", () => {
  let dir: string;
  let hub: LogHub;
  let control: LogControlSocket;
  let removeSink: () => void;

  beforeAll(async () => {
    // Unix socket paths are capped near 104 bytes on macOS, so the temp dir has to be short.
    dir = await mkdtemp(path.join(os.tmpdir(), "akan-lcs-"));
    hub = new LogHub();
    removeSink = Logger.addSink((entry) => void hub.ingest(entry.record));
    control = new LogControlSocket(hub, dir);
    await control.start();
  });

  afterAll(async () => {
    removeSink();
    await control.stop();
    hub.close();
    await rm(dir, { recursive: true, force: true });
    Logger.setLevel("info");
  });

  test.skipIf(process.platform === "win32")("binds 0600 in the runtime dir", async () => {
    const mode = (await stat(control.path)).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(path.basename(control.path)).toBe("akan-control.sock");
  });

  test.skipIf(process.platform === "win32")(
    "is private from the moment it is bound, whatever the process umask, and restores that umask",
    async () => {
      const own = await mkdtemp(path.join(os.tmpdir(), "akan-lcs-"));
      const second = new LogControlSocket(hub, own);
      const modes: number[] = [];
      const listen = Bun.listen;
      const spy = spyOn(Bun, "listen").mockImplementation(((options: Parameters<typeof Bun.listen>[0]) => {
        const server = listen(options);
        modes.push(statSync(second.path).mode & 0o777);
        return server;
      }) as typeof Bun.listen);
      const previous = process.umask(0);
      try {
        await second.start();
        expect(modes).toEqual([0o600]);
        expect(process.umask(0)).toBe(0);
      } finally {
        process.umask(previous);
        spy.mockRestore();
        await second.stop();
        await rm(own, { recursive: true, force: true });
      }
    },
  );

  test("a subscriber receives exactly the records its query matches, and nothing about its own delivery", async () => {
    const client = new Client();
    await client.connect(control.path);
    client.send({ cmd: "subscribe", query: { level: "warn", grep: "payment" } });
    const subscribed = await client.next();
    expect(subscribed).toMatchObject({ type: "subscribed", query: { minSev: logSeverity.warn, text: "payment" } });
    const seqBefore = hub.seq;
    Logger.setLevel("error");
    Logger.warn("payment failed", "", "SocketTest");
    Logger.warn("unrelated", "", "SocketTest");
    Logger.info("payment ok", "", "SocketTest");
    const delivered = await client.next();
    expect(delivered).toMatchObject({ type: "record", record: { message: "payment failed", level: "warn" } });
    expect(await client.idle()).toBe(0);
    expect(hub.seq - seqBefore).toBe(3);
    client.close();
  });

  test("replay hands back the ring before going live, and history answers on its own", async () => {
    Logger.setLevel("error");
    Logger.info("earlier", "", "SocketTest");
    const client = new Client();
    await client.connect(control.path);
    client.send({ cmd: "subscribe", query: { grep: "earlier" }, replay: 10 });
    expect((await client.next()).type).toBe("subscribed");
    expect(await client.next()).toMatchObject({ type: "record", record: { message: "earlier" } });
    client.send({ cmd: "history", query: { grep: "earlier" } });
    const history = await client.next();
    expect(history.type).toBe("history");
    if (history.type === "history") {
      expect(history.entries.map((entry) => entry.record.message)).toEqual(["earlier"]);
      expect(history.coverage.count).toBeGreaterThan(0);
    }
    client.close();
  });

  test("closing the connection drops its subscriptions so the floor recovers", async () => {
    const client = new Client();
    await client.connect(control.path);
    client.send({ cmd: "subscribe", query: { level: "error" } });
    await client.next();
    expect(hub.floor).toBe(logSeverity.error);
    client.close();
    for (let idx = 0; idx < 20 && hub.floor !== null; idx += 1) await new Promise((r) => setTimeout(r, 10));
    expect(hub.floor).toBeNull();
  });

  test("a second server in the same runtime dir leaves the live socket alone", async () => {
    const second = await LogControlSocket.open(hub, dir, new Logger("LogControlSocketTest"));
    expect(second).toBeNull();
    const client = new Client();
    await client.connect(control.path);
    client.send({ cmd: "coverage" });
    expect((await client.next()).type).toBe("coverage");
    client.close();
  });

  test("a stop() while start() is pending leaves nothing bound or on disk", async () => {
    const own = await mkdtemp(path.join(os.tmpdir(), "akan-lcs-"));
    const second = new LogControlSocket(hub, own);
    try {
      const starting = second.start();
      await second.stop();
      await starting;
      expect(existsSync(second.path)).toBe(false);
      expect(await answers(second.path)).toBe(false);
    } finally {
      await second.stop();
      await rm(own, { recursive: true, force: true });
    }
  });

  test("a hub its owner closes while open() is pending abandons the socket", async () => {
    const own = await mkdtemp(path.join(os.tmpdir(), "akan-lcs-"));
    const ownHub = new LogHub();
    const opening = LogControlSocket.open(ownHub, own, new Logger("LogControlSocketTest"));
    ownHub.close();
    const second = await opening;
    try {
      expect(existsSync(LogControlSocket.pathIn(own))).toBe(false);
      expect(await answers(LogControlSocket.pathIn(own))).toBe(false);
    } finally {
      await second?.stop();
      await rm(own, { recursive: true, force: true });
    }
  });

  test("a hub closed once the socket is bound unbinds it before a restart on that path opens", async () => {
    const own = await mkdtemp(path.join(os.tmpdir(), "akan-lcs-"));
    const [firstHub, nextHub] = [new LogHub(), new LogHub()];
    const logger = new Logger("LogControlSocketTest");
    let reopening: Promise<LogControlSocket | null> = Promise.resolve(null);
    const listen = Bun.listen;
    const spy = spyOn(Bun, "listen").mockImplementation(((options: Parameters<typeof Bun.listen>[0]) => {
      const server = listen(options);
      if (spy.mock.calls.length === 1) {
        firstHub.close();
        reopening = LogControlSocket.open(nextHub, own, logger);
      }
      return server;
    }) as typeof Bun.listen);
    const first = await LogControlSocket.open(firstHub, own, logger);
    const next = await reopening;
    spy.mockRestore();
    try {
      expect(next).not.toBeNull();
      const client = new Client();
      await client.connect(LogControlSocket.pathIn(own));
      client.send({ cmd: "coverage" });
      expect((await client.next()).type).toBe("coverage");
      client.close();
    } finally {
      await first?.stop();
      await next?.stop();
      nextHub.close();
      await rm(own, { recursive: true, force: true });
    }
  });

  test("a start on one path waits until the start ahead of it has unbound", async () => {
    const own = await mkdtemp(path.join(os.tmpdir(), "akan-lcs-"));
    const [firstHub, nextHub] = [new LogHub(), new LogHub()];
    const logger = new Logger("LogControlSocketTest");
    const steps: string[] = [];
    const { connect, listen } = Bun;
    const spies = [
      spyOn(Bun, "connect").mockImplementation(((options: Parameters<typeof Bun.connect>[0]) => {
        steps.push("probe");
        return connect(options);
      }) as typeof Bun.connect),
      spyOn(Bun, "listen").mockImplementation(((options: Parameters<typeof Bun.listen>[0]) => {
        const server = listen(options);
        const stop = server.stop.bind(server);
        server.stop = (closeActiveConnections?: boolean) => {
          steps.push("unbind");
          stop(closeActiveConnections);
        };
        steps.push("bind");
        firstHub.close();
        return server;
      }) as typeof Bun.listen),
    ];
    const [first, next] = await Promise.all([
      LogControlSocket.open(firstHub, own, logger),
      LogControlSocket.open(nextHub, own, logger),
    ]);
    for (const spy of spies) spy.mockRestore();
    try {
      expect(steps).toEqual(["probe", "bind", "unbind", "probe", "bind"]);
      expect(next).not.toBeNull();
    } finally {
      await first?.stop();
      await next?.stop();
      nextHub.close();
      await rm(own, { recursive: true, force: true });
    }
  });

  test.skipIf(process.platform === "win32")(
    "a socket that fails after binding is unbound before it reports",
    async () => {
      const own = await mkdtemp(path.join(os.tmpdir(), "akan-lcs-"));
      const stops: unknown[] = [];
      const listen = Bun.listen;
      const spy = spyOn(Bun, "listen").mockImplementation(((options: Parameters<typeof Bun.listen>[0]) => {
        const server = listen(options);
        const stop = server.stop.bind(server);
        server.stop = (closeActiveConnections?: boolean) => {
          stops.push(closeActiveConnections);
          stop(closeActiveConnections);
        };
        rmSync(LogControlSocket.pathIn(own));
        return server;
      }) as typeof Bun.listen);
      try {
        expect(await LogControlSocket.open(hub, own, new Logger("LogControlSocketTest"))).toBeNull();
        expect(stops).toEqual([true]);
      } finally {
        spy.mockRestore();
        await rm(own, { recursive: true, force: true });
      }
    },
  );

  test("the last of start(), stop(), start() wins", async () => {
    const own = await mkdtemp(path.join(os.tmpdir(), "akan-lcs-"));
    const second = new LogControlSocket(hub, own);
    try {
      await Promise.all([second.start(), second.stop(), second.start()]);
      expect(await answers(second.path)).toBe(true);
      await second.stop();
      expect(existsSync(second.path)).toBe(false);
    } finally {
      await second.stop();
      await rm(own, { recursive: true, force: true });
    }
  });

  test("stopping an instance that never bound leaves the live socket alone", async () => {
    const second = new LogControlSocket(hub, dir);
    await second.stop();
    expect(existsSync(control.path)).toBe(true);
    const client = new Client();
    await client.connect(control.path);
    client.send({ cmd: "coverage" });
    expect((await client.next()).type).toBe("coverage");
    client.close();
  });

  test("a bad line is answered, not fatal", async () => {
    const client = new Client();
    await client.connect(control.path);
    client.send({ cmd: "nope" } as unknown as LogControlRequest);
    expect((await client.next()).type).toBe("error");
    client.close();
  });
});
