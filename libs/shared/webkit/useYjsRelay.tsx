"use client";
import type { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { YJS_DOC_FRAME, YJS_PRESENCE_FRAME, yjsFrameOf } from "@libs/shared/common";
import { Logger } from "akanjs/common";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector, mergeUpdates } from "yjs";

import { YjsRelayRoom } from "./yjsRelayRoom";

/** How the page's own endpoints reach the relay. Kept as props so this hook belongs to no one model. */
export interface YjsRelayTransport {
  join: (id: string) => Promise<{ state: string; seed: boolean }>;
  push: (id: string, frame: Uint8Array) => void;
  subscribe: (id: string, onFrame: (frame: Uint8Array) => void) => () => void;
}

type ProviderFactory = ComponentProps<typeof CollaborationPlugin>["providerFactory"];
type ProviderAwareness = ReturnType<ProviderFactory>["awareness"];
type UserState = NonNullable<ReturnType<ProviderAwareness["getLocalState"]>>;

/**
 * A `@lexical/yjs` provider over an akan websocket room.
 *
 * The interface a Lexical collaboration provider has to satisfy is small — connect/disconnect, four event
 * kinds, and six awareness methods — and akan's own socket already carries the guards, the Redis fan-out
 * across replicas, and the resubscribe on reconnect. Running `y-websocket` beside it would mean a second
 * port, a second deployment and a second implementation of who may edit this page.
 *
 * Awareness is JSON rather than the `y-protocols` encoding: both ends of this wire are this class, and the
 * saving does not pay for another dependency. Presence expires on a timeout, since a closed tab has no
 * reliable way to say goodbye.
 */
class RelayProvider {
  /** A frame this client sent comes back from its own room; yjs is idempotent but the bandwidth is not free. */
  static readonly #remoteOrigin = "akan-relay";
  /** Updates are batched because every message frame re-runs the endpoint's guards. */
  static readonly #updateBatchMs = 200;
  static readonly #presenceThrottleMs = 200;
  static readonly #heartbeatMs = 10_000;
  /** A peer that has not spoken for this long is gone: a closed tab sends no goodbye a browser can rely on. */
  static readonly #peerTimeoutMs = 30_000;
  static readonly #logger = new Logger("RelayProvider");

  readonly awareness: ProviderAwareness;
  readonly #doc: Doc;
  readonly #id: string;
  readonly #transport: YjsRelayTransport;
  readonly #room: YjsRelayRoom;
  readonly #initialState: string;
  readonly #handlers = new Map<string, Set<(payload: never) => void>>();
  readonly #awarenessHandlers = new Set<() => void>();
  readonly #states = new Map<number, UserState>();
  readonly #seenAt = new Map<number, number>();
  #localState: UserState | null = null;
  #pending: Uint8Array[] = [];
  #batchTimer: ReturnType<typeof setTimeout> | null = null;
  #presenceTimer: ReturnType<typeof setTimeout> | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #connected = false;
  #changedLocally = false;
  #repairedTo: Uint8Array | undefined = undefined;

  constructor(doc: Doc, id: string, transport: YjsRelayTransport, room: YjsRelayRoom, initialState: string) {
    this.#doc = doc;
    this.#id = id;
    this.#transport = transport;
    this.#room = room;
    this.#initialState = initialState;
    this.awareness = {
      getLocalState: () => this.#localState,
      getStates: () => new Map(this.#states),
      on: (_type, cb) => this.#awarenessHandlers.add(cb),
      off: (_type, cb) => this.#awarenessHandlers.delete(cb),
      setLocalState: (state) => {
        this.#localState = state;
        this.#announce();
      },
      setLocalStateField: (field, value) => {
        this.#localState = { ...this.#localState, [field]: value } as UserState;
        this.#announce();
      },
    };
  }

  static #decodeBase64(state: string) {
    const binary = atob(state);
    const bytes = new Uint8Array(binary.length);
    for (let idx = 0; idx < binary.length; idx += 1) bytes[idx] = binary.charCodeAt(idx);
    return bytes;
  }

  on(type: string, cb: (payload: never) => void) {
    const handlers = this.#handlers.get(type) ?? new Set();
    handlers.add(cb);
    this.#handlers.set(type, handlers);
  }

  off(type: string, cb: (payload: never) => void) {
    this.#handlers.get(type)?.delete(cb);
  }

  connect() {
    if (this.#connected) return;
    this.#connected = true;
    this.#doc.on("update", this.#onLocalUpdate);
    // Apply what the server holds before announcing the sync: `CollaborationPlugin` bootstraps only when
    // the root is still empty at that moment, so a document with stored state skips it on its own.
    if (this.#initialState) this.#apply(RelayProvider.#decodeBase64(this.#initialState));
    this.#repairedTo = encodeStateVector(this.#doc);
    this.#emit("status", { status: "connected" });
    this.#emit("sync", true);
    // Held frames land after the sync: a peer's edit applied first could make a seeder skip its bootstrap.
    this.#room.attach((frame) => {
      this.#receive(frame);
    });
    // `CollaborationPlugin` sets the local state before it connects, when there was no room to send it to.
    if (this.#localState) this.#publishAwareness();
    this.#heartbeat = setInterval(() => {
      this.#expirePeers();
      if (this.#localState) this.#publishAwareness();
      this.#repair();
    }, RelayProvider.#heartbeatMs);
  }

  get clientId() {
    return this.#doc.clientID;
  }

  peerIds() {
    return [...this.#states.keys()];
  }

  disconnect() {
    if (!this.#connected) return;
    this.#flush();
    // The whole state on the way out: a flush that lost a read-modify-write race is repaired by this,
    // and the last editor leaving is exactly when an unrepaired one would be lost for good.
    this.#send(yjsFrameOf(YJS_DOC_FRAME, encodeStateAsUpdate(this.#doc)));
    // The goodbye goes out while the room is still open: sent after, it is dropped, and the peers keep
    // counting this client — and waiting on it as the leader — until its presence times out.
    this.#localState = null;
    this.#publishAwareness();
    this.#connected = false;
    this.#doc.off("update", this.#onLocalUpdate);
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#room.close();
    this.#emit("status", { status: "disconnected" });
  }

  #onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === RelayProvider.#remoteOrigin) return;
    this.#changedLocally = true;
    this.#pending.push(update);
    if (this.#batchTimer) return;
    this.#batchTimer = setTimeout(() => {
      this.#flush();
    }, RelayProvider.#updateBatchMs);
  };

  #flush() {
    if (this.#batchTimer) clearTimeout(this.#batchTimer);
    this.#batchTimer = null;
    if (!this.#pending.length) return;
    const pending = this.#pending;
    this.#pending = [];
    this.#send(yjsFrameOf(YJS_DOC_FRAME, pending.length === 1 ? pending[0] : mergeUpdates(pending)));
  }

  // Everything this document gained since the last repair, sent only by a client that changed it: that also
  // re-sends a flush in between that lost the server's read-modify-write race, which is what this is for.
  #repair() {
    if (!this.#changedLocally) return;
    this.#changedLocally = false;
    this.#send(yjsFrameOf(YJS_DOC_FRAME, encodeStateAsUpdate(this.#doc, this.#repairedTo)));
    this.#repairedTo = encodeStateVector(this.#doc);
  }

  #send(frame: Uint8Array) {
    if (!this.#connected) return;
    this.#transport.push(this.#id, frame);
  }

  #receive(frame: Uint8Array) {
    if (!frame.length) return;
    const payload = frame.subarray(1);
    if (frame[0] === YJS_DOC_FRAME) this.#apply(payload);
    else if (frame[0] === YJS_PRESENCE_FRAME) this.#receiveAwareness(payload);
  }

  // A peer's frame is input like any other, and one that does not decode must cost that frame, not the room.
  #apply(update: Uint8Array) {
    try {
      // The remote origin keeps this out of #onLocalUpdate, so a received frame is never echoed back upstream.
      applyUpdate(this.#doc, update, RelayProvider.#remoteOrigin);
    } catch (error) {
      RelayProvider.#logger.warn(`Dropped a document frame that does not apply: ${error}`);
    }
  }

  #receiveAwareness(payload: Uint8Array) {
    let parsed: { clientId?: number; state?: UserState | null };
    try {
      parsed = JSON.parse(new TextDecoder().decode(payload)) as typeof parsed;
    } catch {
      return;
    }
    const clientId = parsed.clientId;
    if (typeof clientId !== "number" || clientId === this.#doc.clientID) return;
    if (parsed.state && typeof parsed.state === "object") {
      const joined = !this.#states.has(clientId);
      this.#states.set(clientId, parsed.state);
      this.#seenAt.set(clientId, Date.now());
      // A newcomer counts the room — and picks the leader — from what it hears, so it hears from us now.
      if (joined && this.#localState) this.#announce();
    } else {
      this.#states.delete(clientId);
      this.#seenAt.delete(clientId);
    }
    this.#notifyAwareness();
  }

  // A cursor moves with every keystroke, so the latest position goes out on a trailing timer. A goodbye never waits.
  #announce() {
    if (!this.#localState) {
      if (this.#presenceTimer) clearTimeout(this.#presenceTimer);
      this.#presenceTimer = null;
      this.#publishAwareness();
      return;
    }
    if (this.#presenceTimer) return;
    this.#presenceTimer = setTimeout(() => {
      this.#presenceTimer = null;
      this.#publishAwareness();
    }, RelayProvider.#presenceThrottleMs);
  }

  #publishAwareness() {
    const payload = new TextEncoder().encode(JSON.stringify({ clientId: this.#doc.clientID, state: this.#localState }));
    this.#send(yjsFrameOf(YJS_PRESENCE_FRAME, payload));
    this.#notifyAwareness();
  }

  #expirePeers() {
    const cutoff = Date.now() - RelayProvider.#peerTimeoutMs;
    let dropped = false;
    for (const [clientId, seenAt] of this.#seenAt) {
      if (seenAt >= cutoff) continue;
      this.#seenAt.delete(clientId);
      this.#states.delete(clientId);
      dropped = true;
    }
    if (dropped) this.#notifyAwareness();
  }

  #notifyAwareness() {
    for (const handler of this.#awarenessHandlers) handler();
  }

  #emit(type: string, payload: unknown) {
    for (const handler of this.#handlers.get(type) ?? []) (handler as (value: unknown) => void)(payload);
  }
}

export interface YjsRelay {
  ready: boolean;
  /** The join did not come back. The caller should fall back to a plain editor rather than show nothing. */
  failed: boolean;
  seed: boolean;
  /**
   * Whether this client is the one that writes the document back as plain content.
   *
   * Every editor's `onChange` fires for remote edits too, so without a lease N editors would each save the
   * same body N times. The lowest yjs client id holds it — the standard convention, and one that needs no
   * server: when that client leaves, the next lowest takes over on its own.
   */
  isLeader: boolean;
  providerFactory: ProviderFactory;
  /** Peers currently on this document, by their yjs client id. */
  peers: UserState[];
  /**
   * The shared document, once `CollaborationPlugin` has asked for a provider.
   *
   * A caller that keeps a field outside the editor body — a title, an icon — puts it in a sibling type here
   * instead of round-tripping through the server: the relay already carries the whole document, so the field
   * merges with the same rules as the body and needs no debounce.
   */
  doc: Doc | null;
}

/**
 * Joins a document's relay room and hands back what `CollaborationPlugin` needs.
 *
 * `seed` has to be known before the plugin mounts — it decides `shouldBootstrap`, and exactly one client
 * per document may say yes — so the join happens here rather than inside the provider's `connect`.
 */
export const useYjsRelay = (id: string, transport: YjsRelayTransport, enabled = true): YjsRelay => {
  const [joined, setJoined] = useState<{ id: string; state: string; seed: boolean; room: YjsRelayRoom } | null>(null);
  const [failed, setFailed] = useState(false);
  const [peers, setPeers] = useState<UserState[]>([]);
  const [isLeader, setIsLeader] = useState(true);
  const [doc, setDoc] = useState<Doc | null>(null);

  useEffect(() => {
    if (!enabled || !id) return;
    let cancelled = false;
    const room = new YjsRelayRoom(id, transport);
    void (async () => {
      try {
        const { state, seed } = await room.join();
        if (!cancelled) setJoined({ id, state, seed, room });
      } catch {
        room.close();
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      room.close();
      setJoined(null);
      setFailed(false);
    };
  }, [id, enabled]);

  const providerFactory = useMemo<ProviderFactory>(() => {
    return (docId, docMap) => {
      const sharedDoc = docMap.get(docId) ?? new Doc();
      docMap.set(docId, sharedDoc);
      setDoc(sharedDoc);
      const ownJoin = joined?.id === docId ? joined : null;
      const room = ownJoin?.room ?? new YjsRelayRoom(docId, transport);
      const provider = new RelayProvider(sharedDoc, docId, transport, room, ownJoin?.state ?? "");
      provider.awareness.on("update", () => {
        setPeers([...provider.awareness.getStates().values()]);
        setIsLeader(provider.peerIds().every((peerId) => provider.clientId < peerId));
      });
      return provider;
    };
  }, [joined?.id, joined?.state, joined?.room]);

  return {
    ready: !!joined && joined.id === id,
    failed,
    seed: joined?.seed ?? false,
    isLeader,
    providerFactory,
    peers,
    doc,
  };
};
