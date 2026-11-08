import type { TunnelDataFromAgent, TunnelResetCode } from "akanjs/common";

/** `sendPayload` resolves once the data socket has drained. */
export interface TunnelStreamLink {
  sendFrame: (frame: TunnelDataFromAgent) => void;
  sendPayload: (data: Uint8Array) => Promise<void>;
  closeSocket: () => void;
}

export interface TunnelStream {
  /** Dials the local origin and answers with a `head`, then pumps until the origin is done. */
  run: () => Promise<void>;
  /** A payload frame from the gateway — a request body chunk, or an inner websocket/tcp message. */
  push: (data: Uint8Array) => void;
  /** The gateway has no more to send in its direction. */
  end: () => void;
  /** The gateway gave up, or the socket died under the stream. */
  reset: () => void;
}

// lib.dom's WebSocket.send refuses a Uint8Array<ArrayBufferLike>, though nothing here is SharedArrayBuffer-backed.
export const wsBytes = (data: Uint8Array) => data as unknown as Uint8Array<ArrayBuffer>;

const refusedCodes = new Set(["ConnectionRefused", "ECONNREFUSED"]);

// Bun reports a failed dial only through `error.name` / `error.code`; the message is prose.
// `originRefused` means the app is not running — the one a developer can act on.
export const tunnelResetCodeOf = (error: unknown): TunnelResetCode => {
  const { name, code } = (error ?? {}) as { name?: string; code?: string | number };
  if (name === "TimeoutError") return "originTimeout";
  if (name === "AbortError") return "canceled";
  if (typeof code === "string" && refusedCodes.has(code)) return "originRefused";
  if (typeof code === "string" && code.startsWith("E")) return "originUnreachable";
  return "internal";
};

//* The path is joined onto the origin as text, so one like `@host/x` would move the authority to another host.
export const tunnelTargetUrl = (origin: string, path: string): URL | null => {
  if (!path.startsWith("/")) return null;
  const url = URL.parse(`${origin}${path}`);
  return url && url.origin === URL.parse(origin)?.origin ? url : null;
};
