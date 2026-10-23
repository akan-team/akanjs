import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import net from "node:net";
import {
  type TunnelFrame,
  type TunnelHeaderList,
  type TunnelHeadFrame,
  type TunnelOpenFrame,
  tunnelCloseCode,
  tunnelWireContract,
  tunnelWsPayload,
} from "akanjs/common";
import { TunnelAgent } from "./TunnelAgent";
import { TunnelWebsocketStream } from "./TunnelWebsocketStream";

interface StreamCollector {
  head?: TunnelHeadFrame;
  chunks: Uint8Array[];
  chunkAt: number[];
  onChunk?: (data: Uint8Array) => void;
  settle: (reset?: string) => void;
}

interface SocketData {
  kind: "control" | "data";
  refused?: boolean;
}

// Stands in for the akasys gateway: a change here that makes these pass is a change to the wire contract.
class GatewayStub {
  readonly server: Bun.Server<SocketData>;
  readonly sessionId = "session-1";
  idle: Bun.ServerWebSocket<SocketData>[] = [];
  busy = new Set<Bun.ServerWebSocket<SocketData>>();
  #collectors = new Map<Bun.ServerWebSocket<SocketData>, StreamCollector>();
  #waiters: (() => void)[] = [];
  #streamNum = 0;

  constructor(readonly idleTarget = 2) {
    this.server = Bun.serve<SocketData>({
      port: 0,
      idleTimeout: 0,
      fetch: (request, server) => {
        const { pathname } = new URL(request.url);
        // Accept, then close with a 4000-range code: an HTTP status at the upgrade reaches the agent as a bare 1006.
        const refused = request.headers.get("authorization") !== `${tunnelWireContract.authScheme} test-token`;
        const kind = pathname === tunnelWireContract.controlPath ? "control" : "data";
        if (pathname !== tunnelWireContract.controlPath && pathname !== tunnelWireContract.dataPath)
          return new Response("no", { status: 404 });
        return server.upgrade(request, { data: { kind, refused } }) ? undefined : new Response("no", { status: 400 });
      },
      websocket: {
        idleTimeout: 0,
        maxPayloadLength: tunnelWireContract.maxFrameBytes,
        // Deferred a tick: closing inside `open` races the handshake, and the client sees 1006 with the code discarded.
        open: (ws) => {
          if (ws.data.refused) setTimeout(() => ws.close(tunnelCloseCode.unauthorized, "bad token"), 0);
        },
        message: (ws, message) => this.#message(ws, message),
        close: (ws) => {
          const socket = ws;
          this.idle = this.idle.filter((one) => one !== socket);
          this.busy.delete(socket);
          this.#collectors.get(socket)?.settle("socket closed");
          this.#collectors.delete(socket);
        },
      },
    });
  }

  get url() {
    return `ws://localhost:${this.server.port}`;
  }

  stop() {
    this.server.stop(true);
  }

  #message(ws: Bun.ServerWebSocket<SocketData>, message: string | Buffer) {
    // A closing socket answers nothing: a reply tears it down before the close frame lands, hiding the close code.
    if (ws.data.refused) return;
    if (typeof message !== "string") {
      const collector = this.#collectors.get(ws);
      const data = new Uint8Array(message);
      collector?.chunks.push(data);
      collector?.chunkAt.push(Date.now());
      collector?.onChunk?.(data);
      return;
    }
    const frame = tunnelWireContract.parseFrame(message);
    if (!frame) return;
    if (ws.data.kind === "control") return this.#control(ws, frame);
    return this.#data(ws, frame);
  }

  #control(ws: Bun.ServerWebSocket<SocketData>, frame: TunnelFrame) {
    if (frame.type === "hello") {
      ws.send(
        JSON.stringify({
          type: "ready",
          version: tunnelWireContract.version,
          sessionId: this.sessionId,
          hostnames: frame.hostnames,
          urls: frame.hostnames.map((hostname) => `https://${hostname}`),
          idle: this.idleTarget,
          maxSockets: 32,
          heartbeatMs: 60_000,
        }),
      );
      return;
    }
    if (frame.type === "ping") ws.send(JSON.stringify({ type: "pong", at: frame.at }));
  }

  #data(ws: Bun.ServerWebSocket<SocketData>, frame: TunnelFrame) {
    if (frame.type === "attach") {
      ws.send(JSON.stringify({ type: "attached" }));
      this.idle.push(ws);
      this.#wake();
      return;
    }
    const collector = this.#collectors.get(ws);
    if (!collector) return;
    if (frame.type === "head") collector.head = frame;
    if (frame.type === "end") collector.settle();
    if (frame.type === "reset") collector.settle(`${frame.code}: ${frame.message ?? ""}`);
  }

  #wake() {
    const waiters = this.#waiters;
    this.#waiters = [];
    for (const waiter of waiters) waiter();
  }

  async #take(): Promise<Bun.ServerWebSocket<SocketData>> {
    while (!this.idle.length) await new Promise<void>((resolve) => this.#waiters.push(resolve));
    const socket = this.idle.shift();
    if (!socket) throw new Error("no idle socket");
    this.busy.add(socket);
    return socket;
  }

  async request(init: {
    method?: string;
    path: string;
    headers?: TunnelHeaderList;
    body?: Uint8Array;
    onChunk?: (data: Uint8Array) => void;
  }) {
    const socket = await this.#take();
    this.#streamNum += 1;
    const streamId = `stream-${this.#streamNum}`;
    const collector: StreamCollector = { chunks: [], chunkAt: [], onChunk: init.onChunk, settle: () => undefined };
    const finished = new Promise<string | undefined>((resolve) => {
      collector.settle = resolve;
    });
    this.#collectors.set(socket, collector);
    const open: TunnelOpenFrame = {
      type: "open",
      streamId,
      kind: "http",
      hostname: "code.tunnel.akanjs.com",
      method: init.method ?? "GET",
      path: init.path,
      headers: [
        ["x-forwarded-host", "code.tunnel.akanjs.com"],
        ["x-forwarded-proto", "https"],
        ...(init.headers ?? []),
      ],
      body: !!init.body,
    };
    socket.send(JSON.stringify(open));
    if (init.body) {
      socket.send(init.body);
      socket.send(JSON.stringify({ type: "end", streamId }));
    }
    const reset = await finished;
    this.#collectors.delete(socket);
    socket.send(JSON.stringify({ type: "release", streamId }));
    this.busy.delete(socket);
    this.idle.push(socket);
    const size = collector.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const body = new Uint8Array(size);
    let at = 0;
    for (const chunk of collector.chunks) {
      body.set(chunk, at);
      at += chunk.byteLength;
    }
    return {
      head: collector.head,
      body,
      sizes: collector.chunks.map((chunk) => chunk.byteLength),
      chunkAt: collector.chunkAt,
      reset,
    };
  }

  async websocket(path: string) {
    const socket = await this.#take();
    this.#streamNum += 1;
    const streamId = `stream-${this.#streamNum}`;
    const inbound: string[] = [];
    const collector: StreamCollector = {
      chunks: [],
      chunkAt: [],
      onChunk: (data) => {
        const decoded = tunnelWireContract.decodeWsPayload(data);
        if (decoded?.kind === tunnelWsPayload.text) inbound.push(new TextDecoder().decode(decoded.data));
      },
      settle: () => undefined,
    };
    const finished = new Promise<string | undefined>((resolve) => {
      collector.settle = resolve;
    });
    this.#collectors.set(socket, collector);
    socket.send(
      JSON.stringify({
        type: "open",
        streamId,
        kind: "websocket",
        hostname: "code.tunnel.akanjs.com",
        method: "GET",
        path,
        headers: [["x-forwarded-host", "code.tunnel.akanjs.com"]],
      } satisfies TunnelOpenFrame),
    );
    return {
      inbound,
      head: () => collector.head,
      send: (text: string) => {
        socket.send(tunnelWireContract.encodeWsPayload(tunnelWsPayload.text, new TextEncoder().encode(text)));
      },
      close: () => {
        const payload = new TextEncoder().encode(JSON.stringify({ code: 1000, reason: "done" }));
        socket.send(tunnelWireContract.encodeWsPayload(tunnelWsPayload.close, payload));
      },
      reset: () => socket.send(JSON.stringify({ type: "reset", streamId, code: "canceled" })),
      drop: () => socket.close(),
      socketClosed: () => !this.busy.has(socket),
      finished,
    };
  }

  async tcp(port: number) {
    const socket = await this.#take();
    this.#streamNum += 1;
    const streamId = `stream-${this.#streamNum}`;
    const collector: StreamCollector = { chunks: [], chunkAt: [], settle: () => undefined };
    const finished = new Promise<string | undefined>((resolve) => {
      collector.settle = resolve;
    });
    this.#collectors.set(socket, collector);
    socket.send(
      JSON.stringify({
        type: "open",
        streamId,
        kind: "tcp",
        hostname: "code.tunnel.akanjs.com",
        port,
      } satisfies TunnelOpenFrame),
    );
    return {
      head: () => collector.head,
      chunks: collector.chunks,
      send: (text: string) => socket.send(new TextEncoder().encode(text)),
      end: () => socket.send(JSON.stringify({ type: "end", streamId })),
      socketClosed: () => !this.busy.has(socket),
      finished,
    };
  }
}

// A gateway whose link died without a FIN: it answers the upgrade and says `ready`, then never sends another byte —
// not a pong, not the Close frame a closing agent waits for. Bun.serve would answer both, so this speaks raw TCP.
class MuteGatewayStub {
  readonly #listener: Bun.TCPSocketListener;
  readonly #upgraded = new WeakSet<Bun.Socket<unknown>>();

  constructor(heartbeatMs: number) {
    this.#listener = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        data: (socket, data) => {
          if (this.#upgraded.has(socket)) return;
          const request = Buffer.from(data).toString("latin1");
          const key = /sec-websocket-key:\s*(\S+)/i.exec(request)?.[1];
          if (!key) return;
          this.#upgraded.add(socket);
          const accept = new Bun.CryptoHasher("sha1")
            .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
            .digest("base64");
          socket.write(
            `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
          );
          const ready = Buffer.from(
            JSON.stringify({
              type: "ready",
              version: tunnelWireContract.version,
              sessionId: "mute",
              hostnames: ["mute.tunnel.akanjs.com"],
              urls: ["https://mute.tunnel.akanjs.com"],
              idle: 0,
              maxSockets: 0,
              heartbeatMs,
            }),
          );
          socket.write(Buffer.concat([Buffer.from([0x81, 126, ready.length >> 8, ready.length & 0xff]), ready]));
        },
      },
    });
  }

  get url() {
    return `ws://127.0.0.1:${this.#listener.port}`;
  }

  stop() {
    this.#listener.stop(true);
  }
}

const textOf = (body: Uint8Array) => new TextDecoder().decode(body);
const until = async (check: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await Bun.sleep(5);
  return check();
};
const settledOf = (promise: Promise<unknown>) => {
  let settled = false;
  const mark = () => {
    settled = true;
  };
  void promise.then(mark, mark);
  return () => settled;
};

describe("tunnel agent against a gateway", () => {
  let gateway: GatewayStub;
  let origin: Bun.Server<undefined>;
  let agent: TunnelAgent;

  beforeAll(async () => {
    origin = Bun.serve({
      port: 0,
      idleTimeout: 0,
      fetch: async (request, server) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/ws") {
          if (server.upgrade(request)) return undefined;
          return new Response("expected a websocket", { status: 400 });
        }
        if (pathname === "/cookies") {
          const headers = new Headers({ "content-type": "text/plain" });
          headers.append("set-cookie", "jwt=a; Path=/");
          headers.append("set-cookie", "refresh=b; Path=/");
          return new Response("ok", { headers });
        }
        if (pathname === "/seen") return Response.json({ host: request.headers.get("x-forwarded-host") });
        if (pathname === "/redirect") return new Response(null, { status: 302, headers: { location: "/elsewhere" } });
        if (pathname === "/gzip") {
          const gz = Bun.gzipSync(new TextEncoder().encode("z".repeat(4096)));
          return new Response(gz, { headers: { "content-encoding": "gzip", "content-type": "text/plain" } });
        }
        if (pathname === "/big")
          return new Response("b".repeat(600_000), { headers: { "content-type": "text/plain" } });
        if (pathname === "/upload") return Response.json({ bytes: (await request.arrayBuffer()).byteLength });
        if (pathname === "/sse") {
          const encoder = new TextEncoder();
          return new Response(
            new ReadableStream<Uint8Array>({
              async start(controller) {
                for (let num = 0; num < 3; num += 1) {
                  controller.enqueue(encoder.encode(`data: ${num}\n\n`));
                  await Bun.sleep(60);
                }
                controller.close();
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        return new Response("hello", { headers: { "content-type": "text/plain" } });
      },
      websocket: {
        idleTimeout: 0,
        message: (ws, message) => {
          ws.send(`echo:${String(message)}`);
        },
      },
    });
    gateway = new GatewayStub();
    agent = new TunnelAgent({
      gatewayUrl: gateway.url,
      token: "test-token",
      hostnames: ["code.tunnel.akanjs.com"],
      origin: `http://localhost:${origin.port}`,
    });
    const ready = await agent.start();
    expect(ready.urls).toEqual(["https://code.tunnel.akanjs.com"]);
    await until(() => gateway.idle.length >= gateway.idleTarget);
  });

  afterAll(async () => {
    await agent.stop();
    gateway.stop();
    origin.stop(true);
  });

  test("holds the gateway's idle target open", () => {
    expect(gateway.idle.length).toBe(gateway.idleTarget);
  });

  test("replays a request and answers with the origin's status and body", async () => {
    const answer = await gateway.request({ path: "/" });
    expect(answer.reset).toBeUndefined();
    expect(answer.head?.status).toBe(200);
    expect(textOf(answer.body)).toBe("hello");
  });

  test("hands the app the tunnel hostname, not localhost", async () => {
    const answer = await gateway.request({ path: "/seen" });
    expect(JSON.parse(textOf(answer.body))).toEqual({ host: "code.tunnel.akanjs.com" });
  });

  test("carries every set-cookie back", async () => {
    const answer = await gateway.request({ path: "/cookies" });
    const cookies = answer.head?.headers.filter(([name]) => name.toLowerCase() === "set-cookie") ?? [];
    expect(cookies.map(([, value]) => value)).toEqual(["jwt=a; Path=/", "refresh=b; Path=/"]);
  });

  test("leaves a redirect for the public caller to follow", async () => {
    const answer = await gateway.request({ path: "/redirect" });
    expect(answer.head?.status).toBe(302);
    expect(answer.head?.headers.find(([name]) => name.toLowerCase() === "location")?.[1]).toBe("/elsewhere");
  });

  test("drops the content-encoding of a body its own fetch already decoded", async () => {
    const answer = await gateway.request({ path: "/gzip" });
    const names = answer.head?.headers.map(([name]) => name.toLowerCase()) ?? [];
    expect(names).not.toContain("content-encoding");
    expect(names).not.toContain("content-length");
    expect(textOf(answer.body)).toBe("z".repeat(4096));
  });

  test("splits a large body into frames the peer will accept", async () => {
    const answer = await gateway.request({ path: "/big" });
    expect(answer.body.byteLength).toBe(600_000);
    expect(answer.sizes.length).toBeGreaterThan(1);
    expect(Math.max(...answer.sizes)).toBeLessThanOrEqual(tunnelWireContract.chunkBytes);
  });

  test("streams a response as it is produced rather than at the end", async () => {
    const seen: number[] = [];
    const answer = await gateway.request({ path: "/sse", onChunk: () => seen.push(Date.now()) });
    expect(textOf(answer.body)).toBe("data: 0\n\ndata: 1\n\ndata: 2\n\n");
    expect(seen.length).toBeGreaterThan(1);
    const first = seen.at(0) ?? 0;
    const last = seen.at(-1) ?? 0;
    // The origin sleeps 60ms between events; arriving together would mean the agent buffered the whole response.
    expect(last - first).toBeGreaterThan(50);
  });

  test("carries a request body through", async () => {
    const body = new TextEncoder().encode("u".repeat(200_000));
    const answer = await gateway.request({ method: "POST", path: "/upload", body });
    expect(JSON.parse(textOf(answer.body))).toEqual({ bytes: 200_000 });
  });

  test("reports a refused origin as a reset instead of hanging", async () => {
    const other = new GatewayStub(1);
    const pointedAtNothing = new TunnelAgent({
      gatewayUrl: other.url,
      token: "test-token",
      hostnames: ["dead.tunnel.akanjs.com"],
      origin: "http://127.0.0.1:1",
    });
    await pointedAtNothing.start();
    await until(() => other.idle.length >= 1);

    const answer = await other.request({ path: "/" });

    expect(answer.reset).toContain("originRefused");
    await pointedAtNothing.stop();
    other.stop();
  });

  test("carries a websocket in both directions", async () => {
    const socket = await gateway.websocket("/ws");
    expect(await until(() => socket.head()?.status === 101)).toBe(true);
    socket.send("ping");
    expect(await until(() => socket.inbound.length > 0)).toBe(true);
    expect(socket.inbound[0]).toBe("echo:ping");
  });

  test("replaces each data socket a finished websocket takes with it", async () => {
    for (let round = 0; round < 2; round += 1) {
      const socket = await gateway.websocket("/ws");
      expect(await until(() => socket.head()?.status === 101)).toBe(true);
      socket.close();
      expect(await socket.finished).toBeUndefined();
    }
    expect(await until(() => gateway.idle.length >= gateway.idleTarget)).toBe(true);
  });

  test("closes the data socket of a websocket the gateway resets, and replaces it", async () => {
    const socket = await gateway.websocket("/ws");
    expect(await until(() => socket.head()?.status === 101)).toBe(true);
    socket.reset();
    expect(await until(socket.socketClosed)).toBe(true);
    expect(await until(() => gateway.idle.length >= gateway.idleTarget)).toBe(true);
  });

  test("finishes a websocket stream's run however the gateway ends it: a close, a reset or a drop", async () => {
    const run = spyOn(TunnelWebsocketStream.prototype, "run");
    try {
      for (const [end, finish] of [
        ["close", undefined],
        ["reset", "socket closed"],
        ["drop", "socket closed"],
      ] as const) {
        const socket = await gateway.websocket("/ws");
        expect(await until(() => socket.head()?.status === 101)).toBe(true);
        const running = run.mock.results.at(-1)?.value as Promise<void>;
        socket[end]();
        expect([end, await until(settledOf(running))]).toEqual([end, true]);
        expect([end, await socket.finished]).toEqual([end, finish]);
      }
    } finally {
      run.mockRestore();
    }
    expect(await until(() => gateway.idle.length >= gateway.idleTarget)).toBe(true);
  });

  test("finishes the run of a websocket still open when the agent stops", async () => {
    const own = new GatewayStub(1);
    const stopping = new TunnelAgent({
      gatewayUrl: own.url,
      token: "test-token",
      hostnames: ["stop.tunnel.akanjs.com"],
      origin: `http://localhost:${origin.port}`,
    });
    const run = spyOn(TunnelWebsocketStream.prototype, "run");
    try {
      await stopping.start();
      await until(() => own.idle.length >= 1);
      const socket = await own.websocket("/ws");
      expect(await until(() => socket.head()?.status === 101)).toBe(true);
      const running = run.mock.results.at(-1)?.value as Promise<void>;
      await stopping.stop();
      expect(await until(settledOf(running))).toBe(true);
    } finally {
      run.mockRestore();
      await stopping.stop();
      own.stop();
    }
  });

  test("carries a tcp stream through each side's end and closes the data socket it owned", async () => {
    const tcpOrigin = net.createServer({ allowHalfOpen: true }, (socket) => {
      let got = "";
      socket.on("data", (data) => {
        got += data;
      });
      socket.on("end", () => socket.end(`reply:${got}`));
    });
    await new Promise<void>((resolve) => tcpOrigin.listen(0, "127.0.0.1", resolve));
    try {
      const stream = await gateway.tcp((tcpOrigin.address() as net.AddressInfo).port);
      expect(await until(() => stream.head()?.status === 200)).toBe(true);
      stream.send("request");
      stream.end();
      expect(await stream.finished).toBeUndefined();
      expect(stream.chunks.map((chunk) => textOf(chunk)).join("")).toBe("reply:request");
      expect(await until(stream.socketClosed)).toBe(true);
      expect(await until(() => gateway.idle.length >= gateway.idleTarget)).toBe(true);
    } finally {
      tcpOrigin.close();
    }
  });

  test("gives up on a refusal instead of retrying a token that will never be accepted", async () => {
    const refusing = new GatewayStub(1);
    const agent = new TunnelAgent({
      gatewayUrl: refusing.url,
      token: "wrong-token",
      hostnames: ["nope.tunnel.akanjs.com"],
      origin: "http://127.0.0.1:1",
    });

    await expect(agent.start()).rejects.toThrow(/refused by the gateway \(4001/);

    refusing.stop();
  });

  test("stops retrying a link that never goes ready, even with no close code to read", async () => {
    const silent = Bun.serve({ port: 0, idleTimeout: 0, fetch: () => new Response("no", { status: 401 }) });
    const agent = new TunnelAgent({
      gatewayUrl: `ws://localhost:${silent.port}`,
      token: "test-token",
      hostnames: ["nope.tunnel.akanjs.com"],
      origin: "http://127.0.0.1:1",
      retryLimit: 2,
    });

    await expect(agent.start()).rejects.toThrow(/never connected after 2 attempts/);

    silent.stop(true);
  });

  test("drops a gateway gone silent after three heartbeats, without waiting for its Close frame", async () => {
    const mute = new MuteGatewayStub(1_000);
    let lostAt = 0;
    const agent = new TunnelAgent({
      gatewayUrl: mute.url,
      token: "test-token",
      hostnames: ["mute.tunnel.akanjs.com"],
      origin: "http://127.0.0.1:1",
      onLost: () => {
        lostAt ||= Date.now();
      },
    });
    await agent.start();
    const readyAt = Date.now();

    expect(await until(() => lostAt > 0, 8_000)).toBe(true);
    expect(lostAt - readyAt).toBeLessThan(6_000);

    await agent.stop();
    mute.stop();
  }, 15_000);

  test("refills the pool when a data socket dies", async () => {
    const victim = gateway.idle.pop();
    victim?.close();
    expect(await until(() => gateway.idle.length >= gateway.idleTarget)).toBe(true);
  });
});
