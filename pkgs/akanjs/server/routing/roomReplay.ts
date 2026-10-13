import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SolidPubSub, type WebsocketAdaptor } from "akanjs/service";
import type { WebsocketPublishData, WebsocketRoomCursor } from "akanjs/signal";

interface RoomLog {
  /** Names this numbering: a room log that expired and started over counts from 1 again under another epoch. */
  epoch: string;
  seq: number;
  watchedAt: number;
  /** The last number before a frame went out without one (a binary one); a cursor at or below it may have missed it. */
  unnumberedAfter: number;
  frames: { seq: number; at: number; frame: string }[];
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
  readonly #subscribed: (roomId: string) => boolean;
  readonly #rooms = new Map<string, RoomLog>();

  constructor({
    vouches,
    depth = 128,
    retainMs = 5 * 60_000,
    rooms = 10_000,
    subscribed = () => false,
  }: RoomReplayOptions) {
    this.vouches = vouches;
    this.#depth = depth;
    this.#retainMs = retainMs;
    this.#maxRooms = rooms;
    this.#subscribed = subscribed;
  }

  /** A socket subscribed here: the room is numbered from now on, and for `retainMs` after its last subscriber left. */
  watch(roomId: string, now = Date.now()) {
    const room = this.#rooms.get(roomId) ?? {
      epoch: `${this.#process}.${++this.#generation}`,
      seq: 0,
      watchedAt: now,
      unnumberedAfter: -1,
      frames: [],
    };
    this.#touch(roomId, room, now);
    this.#trim(now);
  }

  /** A socket left the room here; its retention counts from the last one to leave. */
  left(roomId: string, now = Date.now()) {
    const room = this.#rooms.get(roomId);
    if (room) this.#touch(roomId, room, now);
  }

  /** The room's numbering no longer covers what was published to it, as for a live room routed nothing while empty. */
  forget(roomId: string) {
    this.#rooms.delete(roomId);
  }

  /** A frame went out to the room without a number, so no cursor taken before it is vouched for. */
  unnumbered(roomId: string) {
    const room = this.#rooms.get(roomId);
    if (room) room.unnumberedAfter = room.seq;
  }

  /** The frame to send for one publish; numbered while the room is watched, and kept when this process vouches. */
  frameOf(publishData: WebsocketPublishData, subscribed: boolean, now = Date.now()): string {
    this.#trim(now);
    const room = this.#rooms.get(publishData.roomId);
    if (room && subscribed) this.#touch(publishData.roomId, room, now);
    if (!room || now - room.watchedAt > this.#retainMs) {
      if (room) this.#rooms.delete(publishData.roomId);
      return JSON.stringify(publishData);
    }
    room.seq += 1;
    const frame = JSON.stringify({ ...publishData, seq: room.seq });
    if (this.vouches) room.frames.push({ seq: room.seq, at: now, frame });
    while (room.frames.length > this.#depth || (room.frames[0] && now - room.frames[0].at > this.#retainMs))
      room.frames.shift();
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

  #touch(roomId: string, room: RoomLog, now: number) {
    room.watchedAt = now;
    this.#rooms.delete(roomId);
    this.#rooms.set(roomId, room);
  }

  //? Every watchedAt write goes through #touch, so the map runs oldest first and the first room still in use ends this.
  #trim(now: number) {
    let budget = this.#rooms.size;
    for (const [roomId, room] of this.#rooms) {
      if (budget-- === 0) break;
      if (this.#rooms.size <= this.#maxRooms && now - room.watchedAt <= this.#retainMs) break;
      if (this.#subscribed(roomId)) this.#touch(roomId, room, now);
      else this.#rooms.delete(roomId);
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
