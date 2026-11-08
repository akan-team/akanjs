interface GateSocketData {
  upstream: WebSocket;
  client: Bun.ServerWebSocket<GateSocketData> | null;
  pending: (string | ArrayBuffer)[];
  closed: { code: number; reason: string } | null;
}

const devRoutePrefixes = [
  "/_akan/devtools",
  "/_akan/signal",
  "/_akan/constant",
  "/_akan/deps",
  "/_akan/dictionary",
  "/_akan/hmr",
  "/_akan/app",
  "/_akan/ops",
];

// The gate answers the caller's handshake itself, so these never reach the dial to the app.
const handshakeHeaders = new Set([
  "upgrade",
  "connection",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
  "sec-websocket-accept",
  "sec-websocket-protocol",
]);

const relayableCloseCode = (code: number) =>
  (code >= 3000 && code <= 4999) || (code >= 1000 && code <= 1014 && ![1004, 1005, 1006].includes(code)) ? code : 1001;

export class TunnelGate {
  static isDevRoute(pathname: string) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return true;
    }
    // Bun's router serves `//_akan/x` as `/_akan/x`, so repeated slashes collapse before the match.
    const route = decoded.replace(/\/{2,}/g, "/").toLowerCase();
    return (
      route.endsWith(".map") || devRoutePrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
    );
  }

  readonly #target: string;
  readonly #server: Bun.Server<GateSocketData>;
  readonly origin: string;

  constructor(target: string) {
    this.#target = target.replace(/\/$/, "");
    this.#server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      idleTimeout: 0,
      fetch: (req, server) => this.#handle(req, server),
      error: () => new Response("The local app did not answer", { status: 502 }),
      websocket: {
        idleTimeout: 0,
        open: (ws) => {
          ws.data.client = ws;
          for (const message of ws.data.pending.splice(0)) ws.send(message);
          if (ws.data.closed) ws.close(relayableCloseCode(ws.data.closed.code), ws.data.closed.reason);
        },
        message: (ws, message) => {
          if (ws.data.upstream.readyState === WebSocket.OPEN) ws.data.upstream.send(message);
        },
        close: (ws, code, reason) => ws.data.upstream.close(relayableCloseCode(code), reason),
        data: {} as GateSocketData,
      },
    });
    this.origin = `http://127.0.0.1:${this.#server.port}`;
  }

  stop() {
    void this.#server.stop(true);
  }

  async #handle(req: Request, server: Bun.Server<GateSocketData>): Promise<Response | undefined> {
    const url = new URL(req.url);
    if (TunnelGate.isDevRoute(url.pathname)) return new Response("Not Found", { status: 404 });
    const target = `${this.#target}${url.pathname}${url.search}`;
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") return await this.#upgrade(req, server, target);
    const headers = new Headers(req.headers);
    headers.delete("x-akan-debug");
    return await fetch(target, {
      method: req.method,
      headers,
      body: req.body,
      redirect: "manual",
      // Bun's fetch would decode the body yet keep content-encoding, and the agent decodes what the gate relays.
      decompress: false,
      duplex: "half",
    } as RequestInit);
  }

  async #upgrade(req: Request, server: Bun.Server<GateSocketData>, target: string) {
    const protocols = (req.headers.get("sec-websocket-protocol") ?? "")
      .split(",")
      .map((one) => one.trim())
      .filter(Boolean);
    const headers: Record<string, string> = {};
    for (const [name, value] of req.headers)
      if (!handshakeHeaders.has(name) && name !== "x-akan-debug") headers[name] = value;
    const upstream = new WebSocket(target.replace(/^http/, "ws"), {
      headers,
      ...(protocols.length ? { protocols } : {}),
    } as unknown as string[]);
    upstream.binaryType = "arraybuffer";
    const opened = await new Promise<boolean>((resolve) => {
      upstream.onopen = () => resolve(true);
      upstream.onerror = () => resolve(false);
      upstream.onclose = () => resolve(false);
    });
    if (!opened) return new Response("The local app refused the websocket", { status: 502 });
    const data: GateSocketData = { upstream, client: null, pending: [], closed: null };
    upstream.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (data.client) data.client.send(event.data);
      else data.pending.push(event.data);
    };
    upstream.onclose = (event) => {
      data.closed = { code: event.code, reason: event.reason };
      data.client?.close(relayableCloseCode(event.code), event.reason);
    };
    upstream.onerror = () => {
      data.closed = { code: 1011, reason: "local app websocket error" };
      data.client?.close(1011, data.closed.reason);
    };
    const upgraded = server.upgrade(req, {
      data,
      ...(upstream.protocol ? { headers: { "Sec-WebSocket-Protocol": upstream.protocol } } : {}),
    });
    if (upgraded) return undefined;
    upstream.close();
    return new Response("WebSocket upgrade failed", { status: 500 });
  }
}
