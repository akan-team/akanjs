import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SolidPubSub, type WebsocketAdaptor } from "akanjs/service";
import type { WebsocketPublishData, WebsocketRoomCursor } from "akanjs/signal";
import { RecencyList } from "./recencyList";

interface RoomLog {
  /** Names this numbering: a room log that expired and started over counts from 1 again under another epoch. */
  epoch: string;
  seq: number;
  watchedAt: number;
  /** The last number before a frame went out without one (a binary one); a cursor at or below it may have missed it. */
  unnumberedAfter: number;
  frames: { seq: number; at: number; frame: string; bytes: number }[];
  bytes: number;
}

export interface RoomReplayOptions {
  /** Whether this process sees every publish to a room, so a run of sequence numbers it holds has no hole. */
  vouches: boolean;
  /** Frames kept per room. */
  depth?: number;
  /** How long a room nobody subscribes to here keeps numbering and keeping its frames. */
  retainMs?: number;
  /** Rooms tracked at once; past it, the least recently watched room no socket here subscribes to goes first. */
  rooms?: number;
  /** Whether a socket here subscribes to the room: its log is never dropped, or it would number from 1 under it. */
  subscribed?: (roomId: string) => boolean;
  /** Frame bytes kept across every room; past it, the room that published least recently loses its oldest first. */
  bytes?: number;
}

//* Numbers each JSON frame a room delivers from this process, so a socket can tell a hole in what it received (a
//* frame dropped under backpressure) and, after a reconnect, ask for what it missed. Only a process that sees every
//* publish may vouch for "nothing else happened": another process's publishes to a room (a replica behind the
//* gateway, a pod on Redis) reach this one only while a socket here subscribes, so there a reconnect is always
//* answered with a gap.
export class RoomReplay {
  /** A lone process on the in-process adaptor; Redis drops another server's publish to a room nobody here is in. */
  static vouchesFor(websocket: WebsocketAdaptor, solo: boolean) {
    return solo && websocket instanceof SolidPubSub;
  }

  readonly #process = crypto.randomUUID();
  //? Signs the cursor a subscribe is acked with, so a `since` cannot reach below the subscribe it was handed to.
  readonly #key = randomBytes(32);
  #generation = 0;
  readonly vouches: boolean;
  readonly #depth: number;
  readonly #retainMs: number;
  readonly #maxRooms: number;
  readonly #maxBytes: number;
  readonly #subscribed: (roomId: string) => boolean;
  readonly #rooms = new Map<string, RoomLog>();
  //* Each oldest first by `watchedAt`. A room enters `#held` only once a socket here is seen subscribed to it, and the
  //* room cap evicts from `#idle` alone, so a sweep stops at the first room it keeps instead of walking every held one.
  readonly #held = new RecencyList<RoomLog>();
  readonly #idle = new RecencyList<RoomLog>();
  /** Rooms keeping frames, oldest last frame first: the stale and the over-budget ones sit at the front. */
  readonly #published = new RecencyList<RoomLog>();
  #bytes = 0;

  constructor({
    vouches,
    depth = 128,
    retainMs = 5 * 60_000,
    rooms = 10_000,
    subscribed = () => false,
    bytes = 64 * 1024 * 1024,
  }: RoomReplayOptions) {
    this.vouches = vouches;
    this.#depth = depth;
    this.#retainMs = retainMs;
    this.#maxRooms = rooms;
    this.#maxBytes = bytes;
    this.#subscribed = subscribed;
  }

  /** A socket subscribed here: the room is numbered from now on, and for `retainMs` after its last subscriber left. */
  watch(roomId: string, now = Date.now()) {
    const room = this.#rooms.get(roomId);
    if (room && this.#held.has(roomId)) this.#hold(roomId, room, now);
    else
      this.#release(
        roomId,
        room ?? {
          epoch: `${this.#process}.${++this.#generation}`,
          seq: 0,
          watchedAt: now,
          unnumberedAfter: -1,
          frames: [],
          bytes: 0,
        },
        now,
      );
    //? The socket subscribes after this returns, so the room just watched cannot yet prove it is held.
    this.#sweep(now, roomId);
  }

  /** A socket left the room here; its retention counts from the last one to leave. */
  left(roomId: string, now = Date.now()) {
    const room = this.#rooms.get(roomId);
    if (room) this.#release(roomId, room, now);
  }

  /** The room's numbering no longer covers what was published to it, as for a live room routed nothing while empty. */
  forget(roomId: string) {
    this.#drop(roomId);
  }

  /** A frame went out to the room without a number, so no cursor taken before it is vouched for. */
  unnumbered(roomId: string) {
    const room = this.#rooms.get(roomId);
    if (room) room.unnumberedAfter = room.seq;
  }

  /** The frame to send for one publish; numbered while the room is watched, and kept when this process vouches. */
  frameOf(publishData: WebsocketPublishData, subscribed: boolean, now = Date.now()): string {
    const { roomId } = publishData;
    this.#sweep(now);
    const room = this.#rooms.get(roomId);
    if (room && subscribed) this.#hold(roomId, room, now);
    if (!room || now - room.watchedAt > this.#retainMs) {
      if (room) this.#drop(roomId);
      return JSON.stringify(publishData);
    }
    room.seq += 1;
    const frame = JSON.stringify({ ...publishData, seq: room.seq });
    if (this.vouches) {
      const bytes = Buffer.byteLength(frame);
      room.frames.push({ seq: room.seq, at: now, frame, bytes });
      room.bytes += bytes;
      this.#bytes += bytes;
      this.#published.touch(roomId, room);
    }
    while (room.frames.length > this.#depth || (room.frames[0] && now - room.frames[0].at > this.#retainMs))
      this.#shiftFrame(roomId, room);
    this.#trimFrames(now);
    return frame;
  }

  /** Where the room's numbering stands here, for a subscribe's ack; `null` for a room nobody watches. */
  cursor(roomId: string): WebsocketRoomCursor | null {
    const room = this.#rooms.get(roomId);
    return room ? { epoch: this.#sign(roomId, room.epoch, room.seq), seq: room.seq } : null;
  }

  /** The frames numbered after the cursor, or `null` when this process cannot tell whether that is all of them. */
  since(roomId: string, { epoch, seq }: WebsocketRoomCursor): string[] | null {
    const room = this.#rooms.get(roomId);
    if (!this.vouches || !room || !Number.isSafeInteger(seq) || seq > room.seq || seq <= room.unnumberedAfter)
      return null;
    const subscribedAt = this.#subscribedAt(roomId, room, epoch);
    if (subscribedAt === null || seq < subscribedAt) return null;
    if (seq === room.seq) return [];
    const first = room.frames[0];
    if (!first || first.seq > seq + 1) return null;
    return room.frames.filter((entry) => entry.seq > seq).map((entry) => entry.frame);
  }

  #hold(roomId: string, room: RoomLog, now: number) {
    room.watchedAt = now;
    this.#rooms.set(roomId, room);
    this.#idle.delete(roomId);
    this.#held.touch(roomId, room);
  }

  #release(roomId: string, room: RoomLog, now: number) {
    room.watchedAt = now;
    this.#rooms.set(roomId, room);
    this.#held.delete(roomId);
    this.#idle.touch(roomId, room);
  }

  #drop(roomId: string) {
    const room = this.#rooms.get(roomId);
    if (!room) return;
    this.#rooms.delete(roomId);
    this.#held.delete(roomId);
    this.#idle.delete(roomId);
    this.#clearFrames(roomId, room);
  }

  #clearFrames(roomId: string, room: RoomLog) {
    this.#bytes -= room.bytes;
    room.bytes = 0;
    room.frames = [];
    this.#published.delete(roomId);
  }

  #shiftFrame(roomId: string, room: RoomLog) {
    const dropped = room.frames.shift();
    room.bytes -= dropped?.bytes ?? 0;
    this.#bytes -= dropped?.bytes ?? 0;
    if (!room.frames.length) this.#published.delete(roomId);
  }

  //? Every watchedAt write goes through #hold or #release, so each list runs oldest first and its first kept room ends
  //? its loop; a held room is asked again only once it has gone quiet for retainMs.
  #sweep(now: number, watching?: string) {
    let checks = this.#held.size;
    for (let front = this.#held.oldest(); front && checks-- > 0; front = this.#held.oldest()) {
      if (now - front.value.watchedAt <= this.#retainMs) break;
      if (this.#subscribed(front.key)) this.#hold(front.key, front.value, now);
      else this.#drop(front.key);
    }
    for (let front = this.#idle.oldest(); front && front.key !== watching; front = this.#idle.oldest()) {
      if (this.#rooms.size <= this.#maxRooms && now - front.value.watchedAt <= this.#retainMs) break;
      if (this.#subscribed(front.key)) this.#hold(front.key, front.value, now);
      else this.#drop(front.key);
    }
    this.#trimFrames(now);
  }

  #trimFrames(now: number) {
    for (let front = this.#published.oldest(); front; front = this.#published.oldest()) {
      const last = front.value.frames.at(-1);
      const stale = !last || now - last.at > this.#retainMs;
      if (!stale && this.#bytes <= this.#maxBytes) break;
      if (stale) this.#clearFrames(front.key, front.value);
      else this.#shiftFrame(front.key, front.value);
    }
  }

  #sign(roomId: string, epoch: string, from: number) {
    const mac = createHmac("sha256", this.#key).update(`${roomId}\n${epoch}\n${from}`).digest("base64url");
    return `${epoch}.${from}.${mac.slice(0, 22)}`;
  }

  #subscribedAt(roomId: string, room: RoomLog, token: unknown): number | null {
    if (typeof token !== "string" || !token.startsWith(`${room.epoch}.`)) return null;
    const from = Number(token.slice(room.epoch.length + 1).split(".")[0]);
    if (!Number.isSafeInteger(from) || from < 0) return null;
    const [given, expected] = [Buffer.from(token), Buffer.from(this.#sign(roomId, room.epoch, from))];
    return given.length === expected.length && timingSafeEqual(given, expected) ? from : null;
  }
}
