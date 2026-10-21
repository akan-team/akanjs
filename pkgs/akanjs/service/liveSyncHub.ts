import {
  baseDocumentColumns,
  type DocumentQuery,
  DocumentQueryEvaluator,
  type DocumentRowView,
  documentQueryHelper,
  isDocumentQueryNode,
  type QueryFieldMap,
} from "akanjs/document";

/** What happened to one document from one room's point of view — never the CRUD verb that caused it. */
export type LiveOp = "enter" | "update" | "leave";

export interface LiveEvent {
  op: LiveOp;
  id: string;
}

export interface LiveRoomTarget {
  roomId: string;
  op: LiveOp;
  /** An invalidation-only room says nothing about which document moved, so its subscribers refetch. */
  invalidate: boolean;
  payload: "light" | "id";
}

export interface LiveRoomRegistration {
  refName: string;
  roomId: string;
  query: DocumentQuery | undefined;
  fallback: "invalidate" | null;
  payload?: "light" | "id";
  fields?: QueryFieldMap;
}

interface LiveRoom {
  refName: string;
  roomId: string;
  query: DocumentQuery | undefined;
  invalidate: boolean;
  evaluator: DocumentQueryEvaluator;
  payload: "light" | "id";
  subscribers: number;
  /** The query's top-level `eq` conditions when it is a plain conjunction; a document disagreeing skips the room. */
  index: Map<string, unknown> | null;
}

/**
 * Evaluates each room's query before and after a write: appearing is `enter`, disappearing `leave`, staying `update`.
 * `removedAt` is wrapped in here as the store does on every read, or a soft delete would route as an update.
 */
export class LiveSyncHub {
  readonly #rooms = new Map<string, LiveRoom>();
  readonly #roomsByModel = new Map<string, Set<LiveRoom>>();

  get roomCount() {
    return this.#rooms.size;
  }

  roomCountOf(refName: string) {
    return this.#roomsByModel.get(refName)?.size ?? 0;
  }

  /** Idempotent: a second socket subscribing to the same room shares the one evaluation. */
  join({ refName, roomId, query, fallback, payload = "light", fields }: LiveRoomRegistration): LiveRoom {
    const existing = this.#rooms.get(roomId);
    if (existing) {
      existing.subscribers += 1;
      return existing;
    }
    const invalidate = fallback === "invalidate";
    if (!invalidate) {
      const reason = DocumentQueryEvaluator.unevaluableReason(query);
      if (reason)
        throw new Error(
          `Live slice "${roomId}" resolved to a query that cannot be routed in memory (${reason}). ` +
            `Declare .live({ fallback: "invalidate" }) on the slice to fall back to refetching.`,
        );
    }
    const room: LiveRoom = {
      refName,
      roomId,
      query,
      invalidate,
      evaluator: new DocumentQueryEvaluator(fields ?? {}),
      payload,
      subscribers: 1,
      index: invalidate ? null : LiveSyncHub.#indexOf(query, fields ?? {}),
    };
    this.#rooms.set(roomId, room);
    const forModel = this.#roomsByModel.get(refName) ?? new Set<LiveRoom>();
    forModel.add(room);
    this.#roomsByModel.set(refName, forModel);
    return room;
  }

  roomIds(): string[] {
    return [...this.#rooms.keys()];
  }

  leave(roomId: string) {
    const room = this.#rooms.get(roomId);
    if (!room) return;
    room.subscribers -= 1;
    if (room.subscribers > 0) return;
    this.#rooms.delete(roomId);
    const forModel = this.#roomsByModel.get(room.refName);
    forModel?.delete(room);
    if (forModel && !forModel.size) this.#roomsByModel.delete(room.refName);
  }

  /** `previous` is absent on a create — no room held the document before. */
  route(refName: string, next: Record<string, unknown>, previous?: Record<string, unknown>): LiveRoomTarget[] {
    const rooms = this.#roomsByModel.get(refName);
    if (!rooms?.size) return [];
    const nextRow = DocumentQueryEvaluator.rowViewOf(next);
    const previousRow = previous ? DocumentQueryEvaluator.rowViewOf(previous) : null;
    const targets: LiveRoomTarget[] = [];
    for (const room of rooms) {
      if (room.invalidate) {
        targets.push({ roomId: room.roomId, op: "update", invalidate: true, payload: room.payload });
        continue;
      }
      if (!LiveSyncHub.#mayMatch(room, nextRow) && !(previousRow && LiveSyncHub.#mayMatch(room, previousRow))) continue;
      const wrapped = documentQueryHelper.all(documentQueryHelper.empty("removedAt"), room.query ?? {});
      const inNext = room.evaluator.evaluate(wrapped, nextRow);
      const inPrevious = previousRow ? room.evaluator.evaluate(wrapped, previousRow) : false;
      if (!inNext && !inPrevious) continue;
      const op: LiveOp = inNext ? (inPrevious ? "update" : "enter") : "leave";
      targets.push({ roomId: room.roomId, op, invalidate: false, payload: room.payload });
    }
    return targets;
  }

  static #mayMatch(room: LiveRoom, row: DocumentRowView): boolean {
    if (!room.index) return true;
    for (const [path, value] of room.index) {
      const actual = (row.doc as Record<string, unknown>)[path];
      if (actual !== value) return false;
    }
    return true;
  }

  //* A base column is stored encoded and an array field's bare value means membership; indexing either skips a match.
  static #indexOf(query: DocumentQuery | undefined, fields: QueryFieldMap): Map<string, unknown> | null {
    if (!query || typeof query !== "object" || isDocumentQueryNode(query)) return null;
    const index = new Map<string, unknown>();
    for (const [path, value] of Object.entries(query)) {
      if (path.includes(".") || baseDocumentColumns.has(path)) return null;
      if (value === null || typeof value === "object") return null;
      const field = fields[path];
      if ((field?.getProps?.() ?? field)?.isArray) return null;
      index.set(path, value);
    }
    return index.size ? index : null;
  }
}
