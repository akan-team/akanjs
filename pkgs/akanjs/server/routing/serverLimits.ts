import fs from "node:fs";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";

type Env = Record<string, string | undefined>;

export class ServerLimits {
  //? Bun caps idleTimeout at 255 s and checks it in ~4 s steps; 0 keeps a silent connection open for good.
  static readonly maxIdleSeconds = 255;
  static readonly defaultIdleSeconds = 120;
  static readonly defaultUploadBodyBytes = 128 * 1024 * 1024;
  static readonly defaultRequestBodyBytes = 16 * 1024 * 1024;
  static readonly loopbackHost = "127.0.0.1";
  static readonly #agentTurnPath = "/runAgentTurn";
  static readonly #tooLarge = new AkanError("payloadTooLarge", "Request body is over the server's limit", {
    statusCode: 413,
  });
  static readonly #logger = new Logger("ServerLimits");
  static readonly #warned = new Set<string>();

  readonly idleTimeout: number;
  readonly wsIdleTimeout: number;
  readonly uploadBodyBytes: number;
  readonly requestBodyBytes: number | null;

  constructor(env: Env = process.env) {
    const devHosted = env.AKAN_COMMAND_TYPE === "start";
    this.idleTimeout = ServerLimits.#seconds(env, "AKAN_IDLE_TIMEOUT", devHosted ? 0 : ServerLimits.defaultIdleSeconds);
    this.wsIdleTimeout = ServerLimits.#seconds(env, "AKAN_WS_IDLE_TIMEOUT", ServerLimits.defaultIdleSeconds);
    this.uploadBodyBytes = ServerLimits.#bytes(env, "AKAN_MAX_UPLOAD_BODY", ServerLimits.defaultUploadBodyBytes);
    const requestBody = env.AKAN_MAX_REQUEST_BODY?.trim();
    this.requestBodyBytes =
      requestBody === "0" || requestBody?.toLowerCase() === "off"
        ? null
        : Math.min(
            ServerLimits.#bytes(env, "AKAN_MAX_REQUEST_BODY", ServerLimits.defaultRequestBodyBytes),
            this.uploadBodyBytes,
          );
  }

  //? Bun counts a pending handler as idle; set back before the answer is written, the limit still bounds keep-alive.
  static async holdOpen<T extends Response | undefined>(
    server: Pick<Bun.Server<unknown>, "timeout">,
    req: Request,
    idleTimeout: number,
    handle: () => T | Promise<T>,
  ): Promise<T> {
    if (!idleTimeout) return await handle();
    server.timeout(req, 0);
    let upgraded = false;
    try {
      const response = await handle();
      upgraded = response === undefined;
      return response;
    } finally {
      if (!upgraded) server.timeout(req, idleTimeout);
    }
  }

  //? Dev binds loopback only; a container's port mapping arrives on its own interface, and `*` binds every interface.
  static listenHostname(env: Env = process.env, inContainer = ServerLimits.#inContainer(env)): string | undefined {
    const explicit = env.AKAN_LISTEN_HOST?.trim();
    if (explicit) return explicit === "*" ? undefined : explicit;
    return env.AKAN_COMMAND_TYPE === "start" && !inContainer ? ServerLimits.loopbackHost : undefined;
  }

  //? Security: a replica trusts forwarded headers on this socket; the umask closes the gap between bind and chmod.
  static serveOwnerOnly<T>(socketPath: string, serve: () => T): T {
    const previous = process.umask(0o177);
    try {
      return serve();
    } finally {
      process.umask(previous);
      try {
        fs.chmodSync(socketPath, 0o600);
      } catch {
        // Windows keeps no POSIX mode on a socket path.
      }
    }
  }

  static #inContainer(env: Env): boolean {
    if (env.KUBERNETES_SERVICE_HOST) return true;
    return fs.existsSync("/.dockerenv") || fs.existsSync("/run/.containerenv");
  }

  static #seconds(env: Env, name: string, fallback: number): number {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const match = /^(\d+)\s*s?$/i.exec(raw);
    if (match) return Math.min(Number(match[1]), ServerLimits.maxIdleSeconds);
    ServerLimits.#warnUnread(name, raw, "seconds such as 30 or 30s", `${fallback} s`);
    return fallback;
  }

  static #bytes(env: Env, name: string, fallback: number): number {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const match = /^(\d+(?:\.\d+)?)\s*(?:([kmg])(?:i?b)?|b)?$/i.exec(raw);
    const unit = match?.[2]?.toLowerCase();
    const scale = unit === "g" ? 1024 ** 3 : unit === "m" ? 1024 ** 2 : unit === "k" ? 1024 : 1;
    const bytes = match ? Math.floor(Number(match[1]) * scale) : 0;
    if (bytes > 0) return bytes;
    ServerLimits.#warnUnread(name, raw, "a size such as 512mb, 1.5g or 16MiB", `${fallback / 1024 ** 2} MiB`);
    return fallback;
  }

  static #warnUnread(name: string, raw: string, expected: string, fallback: string) {
    const key = `${name}=${raw}`;
    if (ServerLimits.#warned.has(key)) return;
    ServerLimits.#warned.add(key);
    ServerLimits.#logger.warn(`${name}="${raw}" is not ${expected}; using ${fallback}.`);
  }

  //? Multipart carries the uploads and takes the server-wide ceiling; every other body is parsed whole in memory.
  //? The agent turn resends its whole transcript, attachments included, so it takes the ceiling its relay limits fit under.
  bodyLimitOf(req: Request): number | null {
    if (this.requestBodyBytes === null || req.method === "GET" || req.method === "HEAD") return null;
    const type = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (type.startsWith("multipart/form-data")) return null;
    return new URL(req.url).pathname.endsWith(ServerLimits.#agentTurnPath) ? null : this.requestBodyBytes;
  }

  refuseDeclared(req: Request): Response | null {
    const limit = this.bodyLimitOf(req);
    const declared = req.headers.get("content-length");
    if (limit === null || declared === null) return null;
    return Number(declared) > limit ? ServerLimits.payloadTooLarge() : null;
  }

  static limitBody(
    body: ReadableStream<Uint8Array>,
    limit: number,
    onExceeded?: () => void,
  ): ReadableStream<Uint8Array> {
    let seen = 0;
    return body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          seen += chunk.byteLength;
          if (seen <= limit) return controller.enqueue(chunk);
          onExceeded?.();
          controller.error(ServerLimits.#tooLarge);
        },
      }),
    );
  }

  static payloadTooLarge(): Response {
    return new Response("Payload Too Large", {
      status: 413,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", connection: "close" },
    });
  }

  static isPayloadTooLarge(error: unknown): boolean {
    if (error === ServerLimits.#tooLarge) return true;
    return !!error && typeof error === "object" && (error as { cause?: unknown }).cause === ServerLimits.#tooLarge;
  }
}
