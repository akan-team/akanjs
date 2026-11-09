import { forwardedHeaders } from "./clientAddress";

// One control socket plus a pool of data sockets, each carrying one stream at a time, all dialled by the agent.
// A text frame is always one JSON control message of this module; a binary frame is always payload.

/** `http` and `tcp` payloads are raw binary frames; a `websocket` one prefixes each with a `tunnelWsPayload` byte. */
export type TunnelStreamKind = "http" | "websocket" | "tcp";

export type TunnelResetCode =
  | "originUnreachable"
  | "originTimeout"
  | "originRefused"
  | "protocol"
  | "canceled"
  | "tooLarge"
  | "internal";

/** Pairs, not a record: `set-cookie` repeats, and a record keyed by name keeps only the last one. */
export type TunnelHeaderList = [string, string][];

export interface TunnelAgentIdentity {
  /** The operator's name for this share. */
  name: string;
  version: string;
  platform: string;
}

export interface TunnelHelloFrame {
  type: "hello";
  version: number;
  /** What the agent intends to serve; the gateway answers with what the token grants. */
  hostnames: string[];
  agent: TunnelAgentIdentity;
}

export interface TunnelReadyFrame {
  type: "ready";
  version: number;
  sessionId: string;
  /** Authoritative: the agent serves these and nothing else, whatever it asked for. */
  hostnames: string[];
  urls: string[];
  /** Idle data sockets to hold; `maxSockets` is the ceiling the pool never grows past. */
  idle: number;
  maxSockets: number;
  heartbeatMs: number;
  /** Epoch ms, when the control plane put a TTL on this share. */
  expiresAt?: number;
}

export interface TunnelPingFrame {
  type: "ping";
  at: number;
}

export interface TunnelPongFrame {
  type: "pong";
  at: number;
}

/** The gateway noticed the idle pool running short; the agent grows it to `idle`, capped by `maxSockets`. */
export interface TunnelDemandFrame {
  type: "demand";
  idle: number;
}

/** A graceful goodbye from either side, so the peer stops reconnecting instead of treating it as a drop. */
export interface TunnelByeFrame {
  type: "bye";
  reason?: string;
}

export type TunnelControlFromAgent = TunnelHelloFrame | TunnelPingFrame | TunnelPongFrame | TunnelByeFrame;
export type TunnelControlFromGateway =
  | TunnelReadyFrame
  | TunnelPingFrame
  | TunnelPongFrame
  | TunnelDemandFrame
  | TunnelByeFrame;

/** First frame on a data socket; the session id names the agent connection it belongs to. */
export interface TunnelAttachFrame {
  type: "attach";
  version: number;
  sessionId: string;
}

/** The socket joined the idle pool; until this arrives the agent must not count it toward `idle`. */
export interface TunnelAttachedFrame {
  type: "attached";
}

export interface TunnelOpenFrame {
  type: "open";
  streamId: string;
  kind: TunnelStreamKind;
  /** The tunnel host the public caller addressed. */
  hostname: string;
  /** `http` and `websocket`. */
  method?: string;
  /** `http` and `websocket`: path plus query, already percent-encoded. */
  path?: string;
  /**
   * `http` and `websocket`, replayed verbatim but for `host`, which the agent dials as the origin's own: the gateway
   * strips every `forwardedHeaderNames` entry the caller sent (else Host header injection) and writes
   * `x-forwarded-host` as the tunnel hostname (else CSRF refuses mutations).
   */
  headers?: TunnelHeaderList;
  /** `tcp`: the port on the local origin to dial. */
  port?: number;
  /** Whether payload frames follow; absent or false means the request is complete as sent. */
  body?: boolean;
}

export interface TunnelHeadFrame {
  type: "head";
  streamId: string;
  /** `101` accepts a `websocket` open and `200` a `tcp` one; any other status is the agent declining. */
  status: number;
  statusText?: string;
  headers: TunnelHeaderList;
  body?: boolean;
}

/** No more payload in the direction this was sent; each direction ends independently. */
export interface TunnelEndFrame {
  type: "end";
  streamId: string;
}

/** The stream failed; its socket is closed rather than returned to the pool. */
export interface TunnelResetFrame {
  type: "reset";
  streamId: string;
  code: TunnelResetCode;
  message?: string;
}

/** Gateway → agent once both directions ended: the socket is idle again. Only `http` streams are released. */
export interface TunnelReleaseFrame {
  type: "release";
  streamId: string;
}

// A payload frame carries no stream id, which stays safe only while nobody sends payload after its own `end`,
// `release` waits for both directions to end, and a JSON frame naming another `streamId` is dropped.
export type TunnelDataFromAgent = TunnelAttachFrame | TunnelHeadFrame | TunnelEndFrame | TunnelResetFrame;
export type TunnelDataFromGateway =
  | TunnelAttachedFrame
  | TunnelOpenFrame
  | TunnelEndFrame
  | TunnelResetFrame
  | TunnelReleaseFrame;

export type TunnelFrame =
  | TunnelControlFromAgent
  | TunnelControlFromGateway
  | TunnelDataFromAgent
  | TunnelDataFromGateway;

// The tunnel socket's text/binary split is spoken for by control/payload, so the inner kind rides a one-byte prefix.
export const tunnelWsPayload = {
  text: 0,
  binary: 1,
  /** Remainder is UTF-8 JSON `{ code, reason }` — the inner close, which is not the tunnel socket closing. */
  close: 2,
} as const;

export type TunnelWsPayloadKind = (typeof tunnelWsPayload)[keyof typeof tunnelWsPayload];

/** Stripped by both ends independently, so neither has to trust the other to have done it. */
export const tunnelHopByHopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

/**
 * The only way a refusal reaches the agent, which treats these as final and any other close as a drop to retry: a
 * refused upgrade arrives as a bare `1006`. Accept the upgrade and close on a later tick, never inside `open`.
 */
export const tunnelCloseCode = {
  unauthorized: 4001,
  unsupportedVersion: 4002,
  hostnameNotGranted: 4003,
  unknownSession: 4004,
  /** A newer session for the same tunnel took over; this one must not reconnect. */
  superseded: 4005,
  streamLimit: 4008,
  goingAway: 4009,
} as const;

export type TunnelCloseCode = (typeof tunnelCloseCode)[keyof typeof tunnelCloseCode];

/** Includes `forwarded`, RFC 7239's single-header spelling of the same claim. */
export const tunnelForwardedHeaders = [...forwardedHeaders, "forwarded"] as const;

const hopByHop = new Set<string>(tunnelHopByHopHeaders);

export const tunnelWireContract = {
  version: 1,
  controlPath: "/_tunnel/control",
  dataPath: "/_tunnel/data",
  // The bearer token is the only thing either upgrade carries, which keeps the tunnel's identity out of access logs.
  authScheme: "Bearer",
  defaultIdleSockets: 4,
  defaultMaxSockets: 128,
  defaultHeartbeatMs: 30_000,

  /** What a sender splits an `http` or `tcp` payload to. */
  chunkBytes: 64 * 1024,
  /** Floor of every tunnel socket's `maxPayloadLength`: an inner 16 MB message plus its prefix rides one frame. */
  maxFrameBytes: 16 * 1024 * 1024 + 4096,

  stripForwarded: (headers: Headers): Headers => {
    for (const name of tunnelForwardedHeaders) headers.delete(name);
    return headers;
  },

  forwardedHeaderNames: tunnelForwardedHeaders,

  isHopByHop: (name: string): boolean => hopByHop.has(name.toLowerCase()),

  // `Headers.forEach` comma-joins repeats except `set-cookie`, which it yields one at a time — hence lossless.
  headerList: (headers: Headers): TunnelHeaderList => {
    const list: TunnelHeaderList = [];
    headers.forEach((value, name) => {
      if (!hopByHop.has(name.toLowerCase())) list.push([name, value]);
    });
    return list;
  },

  headersOf: (list: TunnelHeaderList): Headers => {
    const headers = new Headers();
    for (const [name, value] of list) {
      if (!hopByHop.has(name.toLowerCase())) headers.append(name, value);
    }
    return headers;
  },

  encodeWsPayload: (kind: TunnelWsPayloadKind, data: Uint8Array): Uint8Array => {
    const framed = new Uint8Array(data.byteLength + 1);
    framed[0] = kind;
    framed.set(data, 1);
    return framed;
  },

  decodeWsPayload: (frame: Uint8Array): { kind: TunnelWsPayloadKind; data: Uint8Array } | null => {
    if (!frame.byteLength) return null;
    const kind = frame[0] as TunnelWsPayloadKind;
    if (kind !== tunnelWsPayload.text && kind !== tunnelWsPayload.binary && kind !== tunnelWsPayload.close) return null;
    return { kind, data: frame.subarray(1) };
  },

  parseFrame: (raw: string): TunnelFrame | null => {
    try {
      const frame = JSON.parse(raw) as TunnelFrame;
      return frame && typeof frame === "object" && typeof (frame as { type?: unknown }).type === "string"
        ? frame
        : null;
    } catch {
      return null;
    }
  },
} as const;
