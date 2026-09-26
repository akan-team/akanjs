import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
    // Delivering a record must not itself produce a record: three logged, three ingested, no more.
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

  test("a bad line is answered, not fatal", async () => {
    const client = new Client();
    await client.connect(control.path);
    client.send({ cmd: "nope" } as unknown as LogControlRequest);
    expect((await client.next()).type).toBe("error");
    client.close();
  });
});
