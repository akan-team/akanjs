// Routes bridge requests to desktop plugins. Pure TypeScript, no FFI, so it is unit tested.

import { mkdirSync } from "node:fs";
import type { AppInfo, CallScope, FileRef, ResolvedAcl } from "../../core/src/index.ts";
import { AkanNativeError, aclCheck, listenItem } from "../../core/src/index.ts";
import { admitDocument, declares, externalSchemes } from "../../core/src/kernel.ts";
import {
  BRIDGE_PLUGIN,
  type BridgeEvent,
  type BridgeRequest,
  type BridgeResponse,
  CANCEL,
  type CancelReason,
  errorResponse,
  LISTEN,
  type ListenArgs,
  okResponse,
  UNLISTEN,
  validateRequest,
} from "../../core/src/protocol.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type {
  DesktopContext,
  DesktopPlugin,
  DesktopServerStatus,
  DocumentInfo,
  DocumentScope,
  EmitTarget,
  Launch,
  NativeEvent,
} from "./plugin.ts";

/** How long the window waits for one plugin's setup. */
export const SETUP_TIMEOUT_MS = 3000;

/**
 * How long a page's call to a plugin whose setup is still running (it outlasted SETUP_TIMEOUT_MS)
 * waits for it before it is answered INTERNAL with `retryable`.
 */
export const SETUP_WAIT_MS = 5000;

export interface HostServices {
  app: AppInfo;
  dev?: boolean;
  appDataDir: string;
  /** paths.ts appLocalDataDir; appDataDir when not given. */
  appLocalDataDir?: string;
  /** desktop.bin in the app's resources, or null. */
  binDir?: string | null;
  /** The carried server (resources/server.json), or null. */
  server?: DesktopServerStatus | null;
  /** Sends an event (numbered for its document) to a window's page. */
  emit(window: number, message: BridgeEvent): void;
  /**
   * Reserved plugin ids the host answers itself ($console, $host): the result, or a throw. `signal`
   * fires when the page cancels the call or goes away.
   */
  builtins?: Record<string, (req: BridgeRequest, window: number, signal: AbortSignal) => unknown>;
  /** Windows by last focus, most recent first (SH-6). For EmitTarget "focused". */
  focusOrder?(): number[];
  registerFile(path: string, mime: string): FileRef;
  /** Stops serving a FileRef ($bridge.release). False when the URL is not one of this session's. */
  releaseFile?(url: string): boolean;
  shell?(op: string, args?: Record<string, unknown>): Promise<unknown>;
  onNativeEvent?(type: string, listener: (event: NativeEvent) => void): () => void;
  deepLinkSchemes?: readonly string[];
  /** security.shell.externalSchemes from shell.json (L0). */
  externalSchemes?: readonly string[];
  openLinks?(args: readonly string[]): void;
  quit?(code: number): void;
  /** Quit and close sequence (lifecycle.ts). Without it, quit() ends the app at once and nothing can veto. */
  lifecycle?: Lifecycle;
}

export interface Dispatcher {
  /** Every plugin's setup finished (or ran out of time): what the window should look like, or exit. */
  launched: Promise<Launch>;
  /** Handles one request body (JSON text) from a window's page and returns the response. Never throws. */
  handle(body: string, window?: number): Promise<BridgeResponse>;
  /**
   * A window's page (re)loaded or the window is gone: its document ends, its subscriptions are
   * gone, and event sources nobody listens to any more stop. Without a window: every page.
   */
  reset(window?: number): void;
  /** Sends an event to a window's current document whether or not it listens (host built-ins). */
  emitTo(window: number, plugin: string, event: string, data?: unknown): void;
  /** Table sizes for the document churn check (K13, dev $host.info). */
  stats(): DispatcherStats;
}

export interface DispatcherStats {
  documents: number;
  /** Ended document ids remembered, all windows. */
  ended: number;
  /** $listen counts, all windows and events. */
  subscriptions: number;
  /** Event sources running. */
  sources: number;
  /** Calls not answered yet. */
  running: number;
  /** Resources owned by live documents (ctx.document.own). */
  resources: number;
  /** ctx.onDocumentEnd listeners. */
  documentListeners: number;
}

/**
 * A document's request ids (bridge v1.1 `once`): each is accepted once. The page numbers its
 * requests upward, but they arrive over HTTP and can overtake each other, so the recent ids are
 * kept in a set and older ones are covered by a floor.
 */
export class CallIds {
  private floor = -Infinity;
  private readonly seen = new Set<number>();

  /** Whether the id was received (or is older than what is remembered). */
  has(id: number): boolean {
    return id <= this.floor || this.seen.has(id);
  }

  accept(id: number): boolean {
    if (id <= this.floor || this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > 1024) {
      const oldest = [...this.seen].sort((a, b) => a - b).slice(0, 512);
      for (const old of oldest) this.seen.delete(old);
      this.floor = oldest[oldest.length - 1]!;
    }
    return true;
  }
}

/** One page load of a window (bridge v1.1 `doc`): the numbering of what it is sent, and its calls. */
interface PageDocument {
  /**
   * "" while a window's requests carry no document (v1 callers such as tests): nothing is numbered
   * or refused. Once a document with an id is current, requests without one are refused.
   */
  id: string;
  seq: number;
  ids: CallIds;
  /** Calls still running (v1.1 `cancel`). */
  running: Map<number, RunningCall>;
  /**
   * Cancels that came before their call: requests travel over separate HTTP requests and can
   * overtake each other. The call is answered at once when it arrives. A few are kept.
   */
  cancelledEarly: Map<number, CancelReason>;
  window: number;
  /** Set when it ends: owning a resource then closes it at once, and nothing else runs twice. */
  ended: boolean;
  /** What the document's calls own (ctx.document.own), closed last first when it ends. */
  resources: { dispose(): unknown }[];
  /** The plugins' view of it. */
  scope: DocumentScope;
  /**
   * Coalescing events not sent yet, in order. A newer one replaces the last entry when that is the
   * same event; any other message for the document sends them first, so order holds.
   */
  outbox: { key: string; message: BridgeEvent }[];
  outboxTimer: ReturnType<typeof setTimeout> | null;
}

/** A call in progress: its plugin sees `signal`, and `finish` answers the page now. */
interface RunningCall {
  name: string;
  controller: AbortController;
  finish(response: BridgeResponse): void;
}

/** What a cancelled call answers: CANCELLED, or TIMEOUT when the page's signal was a timeout. */
function cancelled(id: number, reason: CancelReason | "ended"): BridgeResponse {
  if (reason === "timeout") return errorResponse(id, "TIMEOUT", "the page's time limit for this call ran out");
  return errorResponse(
    id,
    "CANCELLED",
    reason === "ended" ? "the page that made this call is gone" : "cancelled by the page",
  );
}

/** Ended documents remembered per window, so their late calls are refused. */
const ENDED_KEPT = 16;

/**
 * How long a coalescing event (manifest `coalesce`, architecture review stage 4) waits for a newer one
 * before it is sent: about 10 per second at most.
 */
export const COALESCE_MS = 100;

export interface DispatcherOptions {
  setupTimeoutMs?: number;
  setupWaitMs?: number;
  /** The app's resolved capabilities from boot.json (PL-11). Absent: everything is allowed. */
  acl?: ResolvedAcl | null;
  /**
   * boot.json `plugins` (L2 declaration gate): a method or event a plugin does not declare for this
   * platform is NOT_FOUND before the ACL and the plugin, whatever its module implements. Absent: no gate (tests).
   */
  declarations?: Record<string, unknown>;
}

/** Only the plugin's own members: "constructor" or "toString" must not reach Object.prototype. */
function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

export function createDispatcher(
  plugins: DesktopPlugin[],
  services: HostServices,
  options: DispatcherOptions = {},
): Dispatcher {
  const byId = new Map(plugins.map((p) => [p.id, p]));
  let dataDirReady = false;
  let localDataDirReady = false;
  const launch: Launch = { window: {} };
  let launching = true;
  const duringLaunch = (plugin: DesktopPlugin, what: string, apply: () => void) => {
    if (launching) apply();
    else console.warn(`[akan-native] ${plugin.id}: ctx.launch.${what} after the window was created is ignored`);
  };
  const quit = (code: number) => (services.lifecycle ? void services.lifecycle.quit(code) : services.quit?.(code));
  const contexts = new Map<string, DesktopContext>();
  const context = (plugin: DesktopPlugin): DesktopContext => {
    let ctx = contexts.get(plugin.id);
    if (!ctx) {
      ctx = {
        app: services.app,
        dev: services.dev === true,
        get appDataDir() {
          if (!dataDirReady) {
            mkdirSync(services.appDataDir, { recursive: true });
            dataDirReady = true;
          }
          return services.appDataDir;
        },
        get appLocalDataDir() {
          const dir = services.appLocalDataDir ?? services.appDataDir;
          if (!localDataDirReady) {
            mkdirSync(dir, { recursive: true });
            localDataDirReady = true;
          }
          return dir;
        },
        binDir: services.binDir ?? null,
        server: services.server ?? null,
        emit: (event, data, target) => deliver(plugin.id, event, data, target),
        registerFile: (path, mime) => services.registerFile(path, mime),
        shell: (op, args) =>
          services.shell
            ? services.shell(op, args)
            : Promise.reject(new AkanNativeError("UNSUPPORTED", "no native shell")),
        onNativeEvent: (type, listener) => services.onNativeEvent?.(type, listener) ?? (() => {}),
        deepLinkSchemes: services.deepLinkSchemes ?? [],
        externalSchemes: externalSchemes(services.externalSchemes ?? []),
        openLinks: (args) => services.openLinks?.(args),
        quit: (code = 0) => quit(code),
        onQuit: (fn) => services.lifecycle?.onQuit(fn) ?? (() => {}),
        onDocumentEnd: (fn) => {
          const entry = { fn };
          documentListeners.add(entry);
          return () => void documentListeners.delete(entry);
        },
        onBeforeQuit: (fn) => services.lifecycle?.onBeforeQuit(fn) ?? (() => {}),
        onCloseRequested: (fn) => services.lifecycle?.onCloseRequested(fn) ?? (() => {}),
        closeWindow: (window) =>
          services.lifecycle ? void services.lifecycle.closeWindow(window) : services.quit?.(0),
        launch: {
          setWindow: (bounds) => duringLaunch(plugin, "setWindow", () => Object.assign(launch.window, bounds)),
          exit: (code = 0) => {
            if (launching) launch.exit ??= code;
            else {
              console.warn(`[akan-native] ${plugin.id}: ctx.launch.exit after the window was created quits the app`);
              quit(code);
            }
          },
        },
      };
      contexts.set(plugin.id, ctx);
    }
    return ctx;
  };
  /** A method call's context: window ops and closeWindow() default to the calling window. */
  const callContext = (
    plugin: DesktopPlugin,
    window: number,
    scope: CallScope | undefined,
    signal: AbortSignal,
  ): DesktopContext => {
    const base = context(plugin);
    return Object.create(base, {
      window: { value: window, enumerable: true },
      scope: { value: scope, enumerable: true },
      signal: { value: signal, enumerable: true },
      document: { value: documents.get(window)?.scope, enumerable: true },
      shell: {
        value: (op: string, args: Record<string, unknown> = {}) =>
          base.shell(op, { ...args, window: args.window ?? window }),
      },
      closeWindow: { value: (target?: number) => base.closeWindow(target ?? window) },
    }) as DesktopContext;
  };

  const timeout = options.setupTimeoutMs ?? SETUP_TIMEOUT_MS;
  /** Setups still running (plugin lifecycle rule: calls and $listen wait for them). */
  const settingUp = new Map<string, Promise<unknown>>();
  const setUp = async (plugin: DesktopPlugin) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const done = Promise.resolve(plugin.setup?.(context(plugin)));
      settingUp.set(plugin.id, done);
      const forget = () => void settingUp.delete(plugin.id);
      done.then(forget, forget);
      const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), timeout)));
      if ((await Promise.race([done, late])) === "late")
        console.warn(`[akan-native] ${plugin.id} setup took over ${timeout} ms; creating the window anyway`);
    } catch (error) {
      console.error(`[akan-native] ${plugin.id} setup failed`, error);
    } finally {
      clearTimeout(timer);
    }
  };
  // Gate plugins first, in order; a launch that exits there sets up nothing else.
  const setups = (async () => {
    for (const plugin of plugins.filter((p) => p.launchPhase === "gate")) {
      await setUp(plugin);
      if (launch.exit !== undefined) return;
    }
    await Promise.all(plugins.filter((p) => p.launchPhase !== "gate").map(setUp));
  })();
  const launched = setups.then(() => {
    launching = false;
    return { window: { ...launch.window }, ...(launch.exit === undefined ? {} : { exit: launch.exit }) };
  });

  // "plugin.event" → subscribed windows (window → $listen count) and the source's stop.
  const sources = new Map<string, { windows: Map<number, number>; stop: () => void }>();

  const deliver = (plugin: string, event: string, data: unknown, target?: EmitTarget): number[] => {
    const subscribed = [...(sources.get(`${plugin}.${event}`)?.windows.keys() ?? [])];
    let windows: number[];
    if (target === "focused") {
      const first = (services.focusOrder?.() ?? []).find((w) => subscribed.includes(w)) ?? Math.min(...subscribed);
      windows = subscribed.length ? [first] : [];
    } else windows = target ? subscribed.filter((w) => w === target.window) : subscribed;
    for (const window of windows) emitTo(window, plugin, event, data);
    return windows;
  };

  // Bridge v1.1: each window's current document, and the ones that ended.
  const documents = new Map<number, PageDocument>();
  const ended = new Map<number, string[]>();
  // Entries, not functions: the same function may be added twice.
  const documentListeners = new Set<{ fn: (doc: DocumentInfo) => void }>();

  const newDocument = (window: number, id: string): PageDocument => {
    const doc: PageDocument = {
      id,
      seq: 0,
      ids: new CallIds(),
      running: new Map(),
      cancelledEarly: new Map(),
      window,
      ended: false,
      resources: [],
      scope: undefined!,
      outbox: [],
      outboxTimer: null,
    };
    doc.scope = {
      id,
      window,
      get ended() {
        return doc.ended;
      },
      own(dispose) {
        if (doc.ended) {
          disposeNow(dispose, `window ${window}`);
          return () => {};
        }
        const entry = { dispose };
        doc.resources.push(entry);
        return () => {
          const at = doc.resources.indexOf(entry);
          if (at >= 0) doc.resources.splice(at, 1);
        };
      },
    };
    return doc;
  };

  /** Numbers a message for its document, if that document is still the window's current one. */
  const stamp = <M extends BridgeResponse | BridgeEvent>(window: number, doc: PageDocument, message: M): M =>
    !doc.id
      ? message
      : documents.get(window) === doc
        ? { ...message, doc: doc.id, seq: ++doc.seq }
        : { ...message, doc: doc.id };

  // "plugin.event" of the events whose payload is a snapshot (boot.json plugins[].coalesce).
  const coalescing = new Set<string>(["$host.tick"]);
  for (const [id, decl] of Object.entries(options.declarations ?? {})) {
    const list = (decl as { coalesce?: unknown } | null)?.coalesce;
    if (Array.isArray(list)) for (const event of list) coalescing.add(`${id}.${String(event)}`);
  }

  const emitTo = (window: number, plugin: string, event: string, data?: unknown) => {
    const doc = documents.get(window);
    if (!doc) return;
    const message: BridgeEvent = data === undefined ? { v: 1, plugin, event } : { v: 1, plugin, event, data };
    const key = `${plugin}.${event}`;
    if (!coalescing.has(key)) {
      flushOutbox(window, doc);
      services.emit(window, stamp(window, doc, message));
      return;
    }
    const last = doc.outbox.at(-1);
    if (last?.key === key) last.message = message;
    else doc.outbox.push({ key, message });
    doc.outboxTimer ??= setTimeout(() => flushOutbox(window, doc), COALESCE_MS);
  };

  /** Sends the document's waiting coalesced events, in order (numbered now, when they go). */
  const flushOutbox = (window: number, doc: PageDocument) => {
    if (doc.outboxTimer) clearTimeout(doc.outboxTimer);
    doc.outboxTimer = null;
    if (!doc.outbox.length || documents.get(window) !== doc) {
      doc.outbox = [];
      return;
    }
    for (const { message } of doc.outbox.splice(0)) services.emit(window, stamp(window, doc, message));
  };

  /** A response for the page: what waits in the outbox goes first, so the page sees them in order. */
  const answer = (window: number, doc: PageDocument, response: BridgeResponse): BridgeResponse => {
    flushOutbox(window, doc);
    return stamp(window, doc, response);
  };

  /**
   * The window's document for a request (kernel admitDocument, the rule every host shares): join
   * the current one, start a new one (ending the current), or refuse: an ended document ("ended"),
   * or a request without an id while the current document has one ("no-doc").
   */
  const enter = (window: number, id: string | undefined): PageDocument | "ended" | "no-doc" => {
    const current = documents.get(window);
    const admission = admitDocument(current?.id ?? null, ended.get(window) ?? [], id ?? null);
    if (admission === "current") return current!;
    if (admission !== "new") return admission;
    endDocument(window);
    const doc = newDocument(window, id ?? "");
    documents.set(window, doc);
    return doc;
  };

  /**
   * A window's page is gone (reloaded, navigated, window destroyed, renderer died). In this order,
   * each step guarded so that one failure does not skip the rest (only the first is logged in
   * full): its calls end (their signals fire), its subscriptions go (sources nobody else listens to
   * stop), what it owns is closed last first, then the plugins' onDocumentEnd hooks and listeners
   * run. The host does all of it; the page is not asked. Calling it again does nothing.
   */
  const endDocument = (window: number) => {
    const doc = documents.get(window);
    if (!doc || doc.ended) return;
    doc.ended = true;
    documents.delete(window);
    if (doc.outboxTimer) clearTimeout(doc.outboxTimer);
    doc.outbox = [];
    if (doc.id) ended.set(window, [...(ended.get(window) ?? []), doc.id].slice(-ENDED_KEPT));
    let failures = 0;
    const step = (what: string, fn: () => void) => {
      try {
        fn();
      } catch (error) {
        if (failures++ === 0)
          console.error(`[akan-native] window ${window}: ending the page's document: ${what} failed`, error);
      }
    };
    for (const id of [...doc.running.keys()]) step(`cancelling call ${id}`, () => cancelCall(doc, id, "ended"));
    for (const [key, source] of [...sources]) {
      if (!source.windows.delete(window)) continue;
      if (source.windows.size === 0) step(`stopping ${key}`, () => stopSource(key));
    }
    for (const resource of doc.resources.splice(0).reverse())
      step("closing a resource", () => disposeNow(() => resource.dispose(), `window ${window}`));
    const info: DocumentInfo = { window, id: doc.id };
    for (const plugin of plugins)
      if (plugin.onDocumentEnd) step(`${plugin.id}.onDocumentEnd`, () => plugin.onDocumentEnd!(info, context(plugin)));
    for (const listener of [...documentListeners]) step("an onDocumentEnd listener", () => listener.fn(info));
    if (failures > 1)
      console.error(
        `[akan-native] window ${window}: ${failures - 1} more steps failed while ending the page's document`,
      );
  };

  /** Runs a disposer; an async one's failure is logged, not thrown. */
  const disposeNow = (dispose: () => unknown, where: string) => {
    const result = dispose();
    if (result instanceof Promise)
      result.catch((error: unknown) => console.error(`[akan-native] ${where}: closing a resource failed`, error));
  };

  /** Ends a running call: its plugin's signal fires and the page gets the answer at once. */
  const cancelCall = (doc: PageDocument, id: number, reason: CancelReason | "ended"): boolean => {
    const call = doc.running.get(id);
    if (!call) return false;
    doc.running.delete(id);
    const response = cancelled(id, reason);
    try {
      call.controller.abort(AkanNativeError.fromBody(response.ok ? undefined : response.error));
    } catch (error) {
      console.error(`[akan-native] ${call.name}: an abort listener threw`, error);
    }
    call.finish(response);
    return true;
  };

  /** $bridge operations: follow-ups on what this document's own calls handed out (no ACL entry). */
  const bridgeOp = (req: BridgeRequest, doc: PageDocument): BridgeResponse => {
    const args = req.args as { id?: number; reason?: CancelReason; url?: string };
    if (req.method === CANCEL) {
      const id = args.id!;
      const reason = args.reason ?? "abort";
      if (cancelCall(doc, id, reason)) return okResponse(req.id, { cancelled: true });
      // Not received yet (the cancel overtook it): answer it at once when it comes.
      if (doc.id && !doc.ids.has(id)) {
        doc.cancelledEarly.set(id, reason);
        if (doc.cancelledEarly.size > 64) doc.cancelledEarly.delete(doc.cancelledEarly.keys().next().value!);
      }
      return okResponse(req.id, { cancelled: false });
    }
    return okResponse(req.id, { released: services.releaseFile?.(args.url!) ?? false });
  };

  const stopSource = (key: string) => {
    const source = sources.get(key);
    if (!source) return;
    sources.delete(key);
    try {
      source.stop();
    } catch (error) {
      console.error("[akan-native] stopping an event source failed", error);
    }
  };

  const subscribe = (plugin: DesktopPlugin, req: BridgeRequest, window: number): BridgeResponse => {
    const { event } = req.args as ListenArgs;
    const start = own(plugin.events, event);
    if (!start) return errorResponse(req.id, "NOT_FOUND", `unknown event ${plugin.id}.${event}`);
    const key = `${plugin.id}.${event}`;
    const source = sources.get(key);
    if (req.method === LISTEN) {
      if (source) source.windows.set(window, (source.windows.get(window) ?? 0) + 1);
      else {
        // Registered before start: a source may emit right away.
        const entry = { windows: new Map([[window, 1]]), stop: () => {} };
        sources.set(key, entry);
        try {
          entry.stop = start(
            (data: unknown, target?: EmitTarget) => deliver(plugin.id, event, data, target),
            context(plugin),
          );
        } catch (error) {
          sources.delete(key); // not listening: the next $listen starts it again
          throw error;
        }
      }
    } else if (source) {
      const count = (source.windows.get(window) ?? 0) - 1;
      if (count > 0) source.windows.set(window, count);
      else source.windows.delete(window);
      if (source.windows.size === 0) stopSource(key);
    }
    return okResponse(req.id);
  };

  return {
    launched,
    async handle(body, window = 1) {
      let req: BridgeRequest;
      try {
        req = JSON.parse(body);
      } catch {
        return errorResponse(0, "INVALID_ARGS", "request is not JSON");
      }
      const invalid = validateRequest(req);
      if (invalid) return errorResponse(typeof req?.id === "number" ? req.id : 0, "INVALID_ARGS", invalid);
      const doc = enter(window, req.doc);
      if (doc === "ended") return errorResponse(req.id, "INTERNAL", "the page that made this call is gone");
      // Its answer would take a number the page runtime never sees (a gap), and its id would be
      // spent for the runtime's own request with that id.
      if (doc === "no-doc") return errorResponse(req.id, "INVALID_ARGS", "request has no document id");
      // A repeat is answered under another id: the page's call for this id waits for the first answer.
      if (doc.id && !doc.ids.accept(req.id))
        return errorResponse(-1, "INVALID_ARGS", `request ${req.id} was already received`);
      if (req.plugin === BRIDGE_PLUGIN) return answer(window, doc, bridgeOp(req, doc));
      const early = doc.cancelledEarly.get(req.id);
      if (early) {
        doc.cancelledEarly.delete(req.id);
        return answer(window, doc, cancelled(req.id, early));
      }
      const controller = new AbortController();
      const response = await new Promise<BridgeResponse>((resolve) => {
        let done = false;
        const finish = (r: BridgeResponse) => {
          if (done) return;
          done = true;
          resolve(r);
        };
        doc.running.set(req.id, { name: `${req.plugin}.${req.method}`, controller, finish });
        run(req, window, controller.signal).then(finish, (error: unknown) =>
          finish(errorResponse(req.id, "INTERNAL", String(error))),
        );
      });
      doc.running.delete(req.id);
      return answer(window, doc, response);
    },
    reset(window) {
      if (window !== undefined) return endDocument(window);
      for (const w of [...documents.keys()]) endDocument(w);
      for (const key of [...sources.keys()]) stopSource(key);
    },
    emitTo,
    stats() {
      let subscriptions = 0;
      for (const source of sources.values()) for (const count of source.windows.values()) subscriptions += count;
      let running = 0;
      let resources = 0;
      for (const doc of documents.values()) {
        running += doc.running.size;
        resources += doc.resources.length;
      }
      let endedIds = 0;
      for (const list of ended.values()) endedIds += list.length;
      return {
        documents: documents.size,
        ended: endedIds,
        subscriptions,
        sources: sources.size,
        running,
        resources,
        documentListeners: documentListeners.size,
      };
    },
  };

  async function run(req: BridgeRequest, window: number, signal: AbortSignal): Promise<BridgeResponse> {
    const builtin = own(services.builtins, req.plugin);
    if (builtin) {
      try {
        return okResponse(req.id, await builtin(req, window, signal));
      } catch (error) {
        const e = AkanNativeError.from(error);
        return errorResponse(req.id, e.code, e.message, e);
      }
    }
    const plugin = byId.get(req.plugin);
    if (!plugin) return errorResponse(req.id, "NOT_FOUND", `plugin ${req.plugin} is not registered`);
    const event = req.method === LISTEN || req.method === UNLISTEN ? String((req.args as ListenArgs).event) : null;
    if (options.declarations && !declares(options.declarations[plugin.id], req.method, event)) {
      return errorResponse(
        req.id,
        "NOT_FOUND",
        event === null
          ? `method ${req.plugin}.${req.method} is not declared`
          : `event ${req.plugin}.${event} is not declared`,
      );
    }
    // A setup that outlasted the launch (Tauri #16135): its plugin's calls wait for it, a while.
    const starting = settingUp.get(plugin.id);
    if (starting) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = await Promise.race([
        starting.then(
          () => false,
          () => false,
        ),
        new Promise<boolean>(
          (resolve) => (timer = setTimeout(() => resolve(true), options.setupWaitMs ?? SETUP_WAIT_MS)),
        ),
      ]);
      clearTimeout(timer);
      if (late)
        return errorResponse(req.id, "INTERNAL", `${plugin.id} is still starting; try again`, { retryable: true });
    }
    // PL-11 / plugins.md C7: the app's capabilities, checked before anything runs. $unlisten
    // only undoes a subscription, so it is always let through.
    let scope: CallScope | undefined;
    if (req.method !== UNLISTEN) {
      const event = (req.args as ListenArgs | undefined)?.event;
      const item = req.method === LISTEN ? listenItem(String(event)) : req.method;
      const access = aclCheck(options.acl, plugin.id, item, window);
      if (!access.allowed) {
        const what = req.method === LISTEN ? `${event} events` : `${req.method}()`;
        return errorResponse(req.id, "NOT_ALLOWED", `${req.plugin}.${what} is not allowed by the app's capabilities`);
      }
      scope = access.scope;
    }
    try {
      if (req.method === LISTEN || req.method === UNLISTEN) return subscribe(plugin, req, window);
      const method = own(plugin.methods as Record<string, (args: unknown, ctx: DesktopContext) => unknown>, req.method);
      if (!method) return errorResponse(req.id, "NOT_FOUND", `method ${req.plugin}.${req.method} is not registered`);
      return okResponse(req.id, await method(req.args, callContext(plugin, window, scope, signal)));
    } catch (error) {
      const e = AkanNativeError.from(error);
      if (e.code === "INTERNAL" && !signal.aborted)
        console.error(`[akan-native] ${req.plugin}.${req.method} failed`, error);
      return errorResponse(req.id, e.code, e.message, e);
    }
  }
}
