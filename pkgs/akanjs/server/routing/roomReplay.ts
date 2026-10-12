import type { WebsocketPublishData, WebsocketRoomCursor } from "akanjs/signal";

interface RoomLog {
  /** Names this numbering: a room log that expired and started over counts from 1 again under another epoch. */
  epoch: string;
  seq: number;
  watchedAt: number;
  frames: { seq: number; at: number; frame: string }[];
}

export interface RoomReplayOptions {
  /** Whether this process sees every publish to a room, so a run of sequence numbers it holds has no hole. */
  vouches: boolean;
  /** Frames kept per room. */
  depth?: number;
  /** How long a room nobody subscribes to here keeps numbering and keeping its frames. */
  retainMs?: number;
  /** Rooms tracked at once; the least recently watched goes first. */
  rooms?: number;
}

//* Numbers each JSON frame a room delivers from this process, so a socket can tell a hole in what it received (a
//* frame dropped under backpressure) and, after a reconnect, ask for what it missed. Only a process that sees every
//* publish may vouch for "nothing else happened": behind the gateway a room's publishes from another replica reach this
//* one only while a socket here subscribes, so there a reconnect is always answered with a gap.
export class RoomReplay {
  readonly #process = crypto.randomUUID();
  #generation = 0;
  readonly vouches: boolean;
  readonly #depth: number;
  readonly #retainMs: number;
  readonly #maxRooms: number;
  readonly #rooms = new Map<string, RoomLog>();

  constructor({ vouches, depth = 128, retainMs = 5 * 60_000, rooms = 10_000 }: RoomReplayOptions) {
    this.vouches = vouches;
    this.#depth = depth;
    this.#retainMs = retainMs;
    this.#maxRooms = rooms;
  }

  /** A socket subscribed here: the room is numbered from now on, and for `retainMs` after its last subscriber left. */
  watch(roomId: string, now = Date.now()) {
    const room = this.#rooms.get(roomId) ?? {
      epoch: `${this.#process}.${++this.#generation}`,
      seq: 0,
      watchedAt: now,
      frames: [],
    };
    room.watchedAt = now;
    this.#rooms.delete(roomId);
    this.#rooms.set(roomId, room);
    while (this.#rooms.size > this.#maxRooms) {
      const oldest = this.#rooms.keys().next().value;
      if (oldest === undefined) break;
      this.#rooms.delete(oldest);
    }
  }

  /** The frame to send for one publish; numbered, and kept, while the room is watched. */
  frameOf(publishData: WebsocketPublishData, subscribed: boolean, now = Date.now()): string {
    const room = this.#rooms.get(publishData.roomId);
    if (room && subscribed) room.watchedAt = now;
    if (!room || now - room.watchedAt > this.#retainMs) {
      if (room) this.#rooms.delete(publishData.roomId);
      return JSON.stringify(publishData);
    }
    room.seq += 1;
    const frame = JSON.stringify({ ...publishData, seq: room.seq });
    room.frames.push({ seq: room.seq, at: now, frame });
    while (room.frames.length > this.#depth || (room.frames[0] && now - room.frames[0].at > this.#retainMs))
      room.frames.shift();
    return frame;
  }

  /** Where the room's numbering stands here, for a subscribe's ack; `null` for a room nobody watches. */
  cursor(roomId: string): WebsocketRoomCursor | null {
    const room = this.#rooms.get(roomId);
    return room ? { epoch: room.epoch, seq: room.seq } : null;
  }

  /** The frames numbered after the cursor, or `null` when this process cannot tell whether that is all of them. */
  since(roomId: string, { epoch, seq }: WebsocketRoomCursor): string[] | null {
    const room = this.#rooms.get(roomId);
    if (!this.vouches || !room || epoch !== room.epoch || !Number.isSafeInteger(seq) || seq < 0 || seq > room.seq)
      return null;
    if (seq === room.seq) return [];
    const first = room.frames[0];
    if (!first || first.seq > seq + 1) return null;
    return room.frames.filter((entry) => entry.seq > seq).map((entry) => entry.frame);
  }
}
