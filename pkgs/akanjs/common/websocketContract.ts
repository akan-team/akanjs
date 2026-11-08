import { decodeJwtPayload } from "./jwtDecode";

export interface WebsocketAuthRequest {
  key: string;
  data: [string | null];
}

export interface WebsocketAuthAckData {
  type: "auth";
  revokedRooms: string[];
}

// The frame carries the raw bearer token; verifying it stays in userland middleware.
export const websocketAuthContract = {
  key: "__auth",
  makeRequest: (jwt: string | null): WebsocketAuthRequest => ({ key: "__auth", data: [jwt] }),
  makeAck: (revokedRooms: string[]): WebsocketAuthAckData => ({ type: "auth", revokedRooms }),
  readJwt: (data: unknown): string | null => {
    const jwt = Array.isArray(data) ? data[0] : null;
    return typeof jwt === "string" && jwt.length > 0 ? jwt : null;
  },
} as const;

export interface WebsocketHeartbeatRequest {
  key: string;
  data: [];
}

export interface WebsocketHeartbeatAckData {
  type: "pong";
}

//? A page cannot hand an open socket the cookie it renewed: the server closes the socket at the credential's `exp`, and
//? the reconnect's handshake carries the cookie the browser holds by then. Read unverified, it only times the close.
export const websocketCredentialContract = {
  expiredCode: 4401,
  expiredReason: "credential expired",
  expiresAtOf: (jwt: string): number | null => {
    try {
      const { exp } = decodeJwtPayload<{ exp?: unknown }>(jwt);
      return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
    } catch {
      return null;
    }
  },
} as const;

// A browser cannot send a protocol ping, so an idle socket would be reaped by intermediaries; the ack matters because a
// half-open socket still accepts `send()`, leaving inbound traffic the only evidence the peer is there.
export const websocketHeartbeatContract = {
  key: "__ping",
  /** Under the 60s idle timeout nginx and most CDNs ship with. */
  intervalMs: 45_000,
  /** Without any inbound frame this long, the socket is assumed half-open and reconnected. */
  silenceMs: 45_000 * 3,
  makeRequest: (): WebsocketHeartbeatRequest => ({ key: "__ping", data: [] }),
  makeAck: (): WebsocketHeartbeatAckData => ({ type: "pong" }),
} as const;

const canonicalOf = (value: unknown, holding: Set<object>): unknown => {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value !== "object") return value;
  if (holding.has(value)) throw new Error("A room key cannot be built from a value that contains itself");
  holding.add(value);
  try {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") return canonicalOf(toJSON.call(value), holding);
    if (ArrayBuffer.isView(value))
      return { "%bytes": [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)] };
    if (value instanceof Map)
      return { "%map": [...value].map(([key, item]) => [canonicalOf(key, holding), canonicalOf(item, holding)]) };
    if (value instanceof Set) return { "%set": [...value].map((item) => canonicalOf(item, holding)) };
    if (value instanceof RegExp) return { "%regexp": [value.source, value.flags] };
    if (Array.isArray(value)) return value.map((item) => canonicalOf(item, holding) ?? null);
    const record: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = canonicalOf((value as Record<string, unknown>)[key], holding);
      if (item !== undefined) record[key] = item;
    }
    return record;
  } finally {
    holding.delete(value);
  }
};

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalOf(value, new Set())) ?? "~";

// Every code unit outside `[A-Za-z0-9_.]` is escaped, so `-` only separates and `("a-b", "c")` is not `("a", "b-c")`.
const escapeRoomToken = (text: string) =>
  text.replace(/[^A-Za-z0-9_.]/g, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x100
      ? `%${code.toString(16).toUpperCase().padStart(2, "0")}`
      : `%u${code.toString(16).toUpperCase().padStart(4, "0")}`;
  });

export const websocketRoomContract = {
  /** The label a client files a subscription under; the server joins `roomOf`, and the ack names both. */
  idOf: (key: string, args: unknown[]) => `${key}${args.length ? "-" : ""}${args.join("-")}`,
  roomOf: (key: string, tokens: string[]) => (tokens.length ? `${key}-${tokens.join("-")}` : key),
  /** For an argument of one declared type; `~` is never an escape's output, so it can stand for an absent value. */
  tokenOf: (value: unknown): string => {
    if (value === null || value === undefined) return "~";
    if (typeof value === "string") return escapeRoomToken(value);
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
      return escapeRoomToken(String(value));
    const canonical = canonicalOf(value, new Set());
    return escapeRoomToken(typeof canonical === "string" ? canonical : (JSON.stringify(canonical) ?? "~"));
  },
  /** For an `Any` argument, where `"1"` and `1` are different values. */
  jsonTokenOf: (value: unknown): string => (value === undefined ? "~" : escapeRoomToken(canonicalJson(value))),
} as const;

export interface WebsocketBinaryFrame {
  roomId: string;
  payload: Uint8Array;
}

const MAGIC = 0xab;
const KIND_PUB = 0x01;
const HEADER_BYTES = 4;
const MAX_ROOM_BYTES = 0xffff;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Not the JSON envelope: `Buffer.toJSON()` spells bytes `{ type: "Buffer", data: number[] }` (3.6x, never restored).
export const websocketBinaryFrameContract = {
  encode: ({ roomId, payload }: WebsocketBinaryFrame): Uint8Array => {
    const room = encoder.encode(roomId);
    if (room.length > MAX_ROOM_BYTES) throw new Error(`Room id is too long to frame: ${roomId}`);
    const frame = new Uint8Array(HEADER_BYTES + room.length + payload.length);
    frame[0] = MAGIC;
    frame[1] = KIND_PUB;
    frame[2] = room.length >> 8;
    frame[3] = room.length & 0xff;
    frame.set(room, HEADER_BYTES);
    frame.set(payload, HEADER_BYTES + room.length);
    return frame;
  },
  decode: (data: ArrayBuffer | Uint8Array): WebsocketBinaryFrame | null => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.length < HEADER_BYTES || bytes[0] !== MAGIC || bytes[1] !== KIND_PUB) return null;
    const roomBytes = (bytes[2] << 8) | bytes[3];
    if (bytes.length < HEADER_BYTES + roomBytes) return null;
    return {
      roomId: decoder.decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + roomBytes)),
      payload: bytes.subarray(HEADER_BYTES + roomBytes),
    };
  },
} as const;
