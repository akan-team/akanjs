import { AkanError } from "akanjs/base";
import {
  type DocumentQuery,
  DocumentQueryEvaluator,
  documentQueryHelper,
  type EqualityConjunct,
  type QueryFieldMap,
} from "akanjs/document";
import { canonicalJson } from "../common/websocketContract";

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
  queryKey: string;
  routed: DocumentQuery;
  invalidate: boolean;
  evaluator: DocumentQueryEvaluator;
  payload: "light" | "id";
  subscribers: number;
  joinedAt: number;
  /** Its condition in the model's index; an evaluated room without one is scanned on every write. */
  filed: EqualityConjunct | null;
}

interface ModelRooms {
  rooms: Set<LiveRoom>;
  invalidating: Set<LiveRoom>;
  scanned: Set<LiveRoom>;
  /** path → `keyAt` key → the rooms a document holding that key there may belong to. */
  index: Map<string, Map<string, Set<LiveRoom>>>;
}

/**
 * Evaluates each room's query before and after a write: appearing is `enter`, disappearing `leave`, staying `update`.
 * `removedAt` is wrapped in here as the store does on every read, or a soft delete would route as an update.
 */
export class LiveSyncHub {
  readonly #rooms = new Map<string, LiveRoom>();
  readonly #models = new Map<string, ModelRooms>();
  #joins = 0;
  #onModels: ((models: string[]) => void) | null = null;

  get roomCount() {
    return this.#rooms.size;
  }

  roomCountOf(refName: string) {
    return this.#models.get(refName)?.rooms.size ?? 0;
  }

  models(): string[] {
    return [...this.#models.keys()];
  }

  onModelsChange(listener: (models: string[]) => void) {
    this.#onModels = listener;
  }

  /** Idempotent: a second socket subscribing to the same room shares the one evaluation. */
  join({ refName, roomId, query, fallback, payload = "light", fields }: LiveRoomRegistration): LiveRoom {
    const queryKey = canonicalJson(query ?? null);
    const existing = this.#rooms.get(roomId);
    if (existing) {
      //? A room is routed by the query it was created with, so a subscriber holding another one would read its matches.
      if (existing.queryKey !== queryKey)
        throw new AkanError("liveRoomTaken", `Live room "${roomId}" is already held for another query`);
      existing.subscribers += 1;
      return existing;
    }
    const invalidate = fallback === "invalidate";
    if (!invalidate) {
      const reason = DocumentQueryEvaluator.unevaluableReason(query);
      if (reason)
        throw new AkanError(
          "unroutableLiveQuery",
          `Live slice "${roomId}" resolved to a query that cannot be routed in memory (${reason}). ` +
            `Declare .live({ fallback: "invalidate" }) on the slice to fall back to refetching.`,
        );
    }
    const known = this.#models.get(refName);
    const model = known ?? {
      rooms: new Set<LiveRoom>(),
      invalidating: new Set<LiveRoom>(),
      scanned: new Set<LiveRoom>(),
      index: new Map<string, Map<string, Set<LiveRoom>>>(),
    };
    this.#models.set(refName, model);
    const evaluator = new DocumentQueryEvaluator(fields ?? {});
    const room: LiveRoom = {
      refName,
      roomId,
      queryKey,
      routed: documentQueryHelper.all(documentQueryHelper.empty("removedAt"), query ?? {}),
      invalidate,
      evaluator,
      payload,
      subscribers: 1,
      joinedAt: this.#joins++,
      filed: invalidate ? null : LiveSyncHub.#leastCrowded(model, evaluator.equalityConjuncts(query)),
    };
    this.#rooms.set(roomId, room);
    model.rooms.add(room);
    if (invalidate) model.invalidating.add(room);
    else if (!room.filed) model.scanned.add(room);
    else {
      const byKey = model.index.get(room.filed.path) ?? new Map<string, Set<LiveRoom>>();
      model.index.set(room.filed.path, byKey);
      for (const key of room.filed.keys) byKey.set(key, (byKey.get(key) ?? new Set<LiveRoom>()).add(room));
    }
    if (!known) this.#onModels?.(this.models());
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
    const model = this.#models.get(room.refName);
    if (!model) return;
    model.rooms.delete(room);
    model.invalidating.delete(room);
    model.scanned.delete(room);
    const byKey = room.filed ? model.index.get(room.filed.path) : undefined;
    for (const key of byKey ? (room.filed?.keys ?? []) : []) {
      const filed = byKey?.get(key);
      filed?.delete(room);
      if (!filed?.size) byKey?.delete(key);
    }
    if (room.filed && !byKey?.size) model.index.delete(room.filed.path);
    if (model.rooms.size) return;
    this.#models.delete(room.refName);
    this.#onModels?.(this.models());
  }

  /** `previous` is absent on a create — no room held the document before. */
  route(refName: string, next: Record<string, unknown>, previous?: Record<string, unknown>): LiveRoomTarget[] {
    const model = this.#models.get(refName);
    if (!model) return [];
    const nextRow = DocumentQueryEvaluator.rowViewOf(next);
    const previousRow = previous ? DocumentQueryEvaluator.rowViewOf(previous) : null;
    const matched: { room: LiveRoom; op: LiveOp }[] = [];
    const visit = (room: LiveRoom) => {
      const inNext = room.evaluator.evaluate(room.routed, nextRow);
      const inPrevious = previousRow ? room.evaluator.evaluate(room.routed, previousRow) : false;
      if (inNext || inPrevious) matched.push({ room, op: inNext ? (inPrevious ? "update" : "enter") : "leave" });
    };
    for (const room of model.invalidating) matched.push({ room, op: "update" });
    for (const room of model.scanned) visit(room);
    for (const [path, byKey] of model.index) {
      const nextKey = DocumentQueryEvaluator.keyAt(path, nextRow);
      const previousKey = previousRow ? DocumentQueryEvaluator.keyAt(path, previousRow) : null;
      const nextRooms = nextKey === null ? undefined : byKey.get(nextKey);
      for (const room of nextRooms ?? []) visit(room);
      if (previousKey === null || previousKey === nextKey) continue;
      for (const room of byKey.get(previousKey) ?? []) if (!nextRooms?.has(room)) visit(room);
    }
    return matched
      .sort((a, b) => a.room.joinedAt - b.room.joinedAt)
      .map(({ room, op }) => ({ roomId: room.roomId, op, invalidate: room.invalidate, payload: room.payload }));
  }

  //? Greedy: the condition whose buckets hold the fewest rooms now, so one unselective path does not collect them all.
  static #leastCrowded(model: ModelRooms, conjuncts: EqualityConjunct[]): EqualityConjunct | null {
    let best: { conjunct: EqualityConjunct; crowd: number } | null = null;
    for (const conjunct of conjuncts) {
      const byKey = model.index.get(conjunct.path);
      const crowd = conjunct.keys.reduce((sum, key) => sum + (byKey?.get(key)?.size ?? 0) + 1, byKey ? 0 : 1);
      if (!best || crowd < best.crowd) best = { conjunct, crowd };
    }
    return best?.conjunct ?? null;
  }
}
