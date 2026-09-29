// Bridge runtime: transport selection, pending calls and event listeners.

import { type AkanNativeBoot, akanNativeGlobal, readBoot } from "./boot.ts";
import { AkanNativeError } from "./errors.ts";
import {
  BRIDGE_PLUGIN,
  type BridgeEvent,
  type BridgeRequest,
  type BridgeResponse,
  CANCEL,
  type CancelReason,
  CONSOLE_PLUGIN,
  type ErrorCode,
  HOST_PLUGIN,
  isEvent,
  isResponse,
} from "./protocol.ts";

/** One way to reach the host. Events always come back through `__AKAN_NATIVE__.receive`. */
export interface Transport {
  send(request: BridgeRequest): Promise<BridgeResponse>;
  /** Internal diagnostics for the self-test (e.g. how many bridge ports the page adopted). */
  info?(): Record<string, unknown>;
}

type Listener = (data: unknown) => void;

interface Pending {
  resolve(response: BridgeResponse): void;
}

export interface Runtime {
  boot: AkanNativeBoot;
  transport: Transport | null;
  nextId: number;
  /** Calls waiting for their response, which always comes through receive(). */
  pending: Map<number, Pending>;
  /** "plugin\0event" → listeners, shared by native and web event sources. */
  listeners: Map<string, Set<Listener>>;
  /** This document's id (bridge v1.1 `doc`), sent with every request. */
  doc: string;
  /** The runtime's timers (the gap timer, the next-task deferrals); tests replace them with a virtual clock. */
  timers: Timers;
  /** In-order delivery of host messages (v1.1 `seq`): see receive(). */
  order: {
    /** The next number to deliver, and later ones that came early. */
    next: number;
    held: Map<number, BridgeResponse | BridgeEvent>;
    timer: unknown;
    /** A response was delivered in this task: events wait for the next one. */
    answered: boolean;
    /** Messages in order that wait for the next task. */
    later: (BridgeResponse | BridgeEvent)[];
  };
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function eventKey(plugin: string, event: string): string {
  return `${plugin}\u0000${event}`;
}

export function runtime(): Runtime {
  const g = akanNativeGlobal();
  if (!g.__runtime) {
    const boot = readBoot();
    const rt: Runtime = {
      boot,
      transport: null,
      // Start at a random id so that a late answer for a call made before a
      // page reload cannot resolve a new call (capacitor/core/native-bridge.ts
      // `callbackIdCount` does the same).
      nextId: Math.floor(Math.random() * 0x8000000),
      pending: new Map(),
      listeners: new Map(),
      doc: randomNonce(),
      timers: realTimers,
      order: { next: 1, held: new Map(), timer: null, answered: false, later: [] },
    };
    rt.transport = createTransport(rt);
    g.__runtime = rt;
    g.receive = (message) => void receive(rt, message);
    // A page restored from the back-forward cache: the host ended its document when the page was
    // left, so it would refuse the page's calls, and its subscriptions are gone. Start it again.
    const w = globalThis as {
      addEventListener?: (type: string, fn: (e: { persisted?: boolean }) => void) => void;
      location?: { reload(): void };
    };
    if (rt.transport) w.addEventListener?.("pageshow", (e) => e.persisted && w.location?.reload());
    // Android too: WebChromeClient.onConsoleMessage sees console output only as text at the WebView's own levels.
    if (boot.dev && rt.transport) forwardConsole(boot.platform);
  }
  return g.__runtime as Runtime;
}

/**
 * Dev builds on native hosts: mirror console output and uncaught errors to the host,
 * which prints them next to its own logs (WV-3).
 */
function forwardConsole(platform: AkanNativeBoot["platform"]): void {
  // Patch once per page, whatever copy of @akanjs/native/core asks: the flag lives on the page's global, so a
  // module evaluated again (HMR) does not wrap console twice. Always send through the current
  // runtime (tests re-create it).
  const g = akanNativeGlobal() as { __consolePatched?: boolean };
  if (g.__consolePatched) return;
  g.__consolePatched = true;
  const c = globalThis.console as unknown as Record<string, (...args: unknown[]) => void>;
  const format = (value: unknown): string => {
    if (typeof value === "string") return value;
    // WebKit's `stack` holds the frames alone, where V8's starts with `Name: message`.
    if (value instanceof Error) {
      const head = `${value.name}: ${value.message}`;
      return value.stack?.startsWith(head) ? value.stack : `${head}${value.stack ? `\n${value.stack}` : ""}`;
    }
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  };
  // `console.error("%s: %s", a, b)`, as React writes its warnings: the substitutions a devtools console applies.
  const render = (args: unknown[]): string => {
    const [first, ...rest] = args;
    if (typeof first !== "string" || !/%[sdifoOc]/.test(first)) return args.map(format).join(" ");
    const text = first.replace(/%([sdifoOc%])/g, (match, spec: string) => {
      if (spec === "%") return "%";
      if (rest.length === 0) return match;
      const value = rest.shift();
      if (spec === "c") return "";
      if (spec === "d" || spec === "i") return String(Number.parseInt(String(value), 10));
      if (spec === "f") return String(Number(value));
      return format(value);
    });
    return [text, ...rest.map(format)].join(" ");
  };
  const send = (level: string, args: unknown[]) => {
    const rt = akanNativeGlobal().__runtime as Runtime | undefined;
    if (!rt?.transport || !rt.boot.dev) return;
    const request: BridgeRequest = {
      v: 1,
      id: ++rt.nextId,
      plugin: CONSOLE_PLUGIN,
      method: level,
      args: { message: render(args).replace(/\n+$/, "") },
    };
    rt.transport.send(request).catch(() => {});
  };
  // Android's WebView logs the page console itself until the host hears from the bridge that it is forwarded.
  if (platform === "android") send("attach", []);
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const original = c[level]!.bind(globalThis.console);
    c[level] = (...args: unknown[]) => {
      original(...args);
      send(level, args);
    };
  }
  const w = globalThis as { addEventListener?: (type: string, fn: (e: any) => void) => void };
  w.addEventListener?.("error", (e) => send("error", ["uncaught:", e.error ?? e.message]));
  w.addEventListener?.("unhandledrejection", (e) => send("error", ["unhandled rejection:", e.reason]));
}

/**
 * macOS: WKWebView ignores window.print(), so the page asks the shell to print its window
 * (plugins.md D8; Tauri replaces window.print the same way, tauri/crates/tauri/src/webview/scripts/print.js).
 * Runs when @akanjs/native/core loads; init.js has already set the platform by then. Returns whether it replaced print.
 */
export function installPrint(): boolean {
  const w = globalThis as { print?: () => void; __AKAN_NATIVE__?: { platform?: string } };
  if (w.__AKAN_NATIVE__?.platform !== "macos" || typeof w.print !== "function") return false;
  w.print = () => {
    const rt = runtime();
    rt.transport?.send({ v: 1, id: ++rt.nextId, plugin: HOST_PLUGIN, method: "print" }).catch(() => {});
  };
  return true;
}
installPrint();

/**
 * Dev builds: errors the page had before this module ran, collected by the snippet the build puts
 * after init.js (__AKAN_NATIVE__.early). They go to the host log once, marked "[before runtime]"; the
 * snippet stops collecting and does not report them itself.
 */
export function flushEarlyErrors(): void {
  const w = globalThis as { window?: unknown; __AKAN_NATIVE__?: { early?: unknown } };
  const early = w.__AKAN_NATIVE__?.early;
  if (typeof w.window === "undefined" || !Array.isArray(early)) return;
  w.__AKAN_NATIVE__!.early = null;
  if (!early.length) return;
  runtime(); // dev builds forward console output to the host from here on
  console.error(`[before runtime] ${early.length} error(s) before @akanjs/native/core started:\n${early.join("\n")}`);
}
flushEarlyErrors();

/** Drops all runtime state. Only for tests. */
export function resetRuntime(): void {
  const g = akanNativeGlobal();
  const rt = g.__runtime as Runtime | undefined;
  if (rt?.order.timer) rt.timers.clear(rt.order.timer);
  delete g.__runtime;
  delete g.receive;
}

export function dispatchEvent(rt: Runtime, plugin: string, event: string, data: unknown): void {
  const set = rt.listeners.get(eventKey(plugin, event));
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(data);
    } catch (error) {
      console.error(`[akan-native] listener for ${plugin}.${event} threw`, error);
    }
  }
}

/** How long later messages wait for a missing number before they are delivered anyway. */
export const SEQ_GAP_MS = 500;

/**
 * A message from the host (a response or an event). Messages of another document are dropped
 * (answers and events meant for the page that was here before). Numbered ones are delivered in
 * `seq` order: the host numbers them where it sends them, but they reach the page by different
 * paths (an HTTP response and evaluate_script on desktop, the reply and callAsyncJavaScript on
 * iOS), which reorder them. A number that is missing for SEQ_GAP_MS is given up on.
 */
function receive(rt: Runtime, message: unknown): "delivered" | "held" | "ignored" {
  const msg = typeof message === "string" ? safeParse(message) : message;
  if (!isResponse(msg) && !isEvent(msg)) {
    console.warn("[akan-native] ignored malformed host message", message);
    return "ignored";
  }
  if (msg.doc !== undefined && msg.doc !== rt.doc) return "ignored";
  const order = rt.order;
  if (typeof msg.seq !== "number" || msg.seq < order.next) {
    deliver(rt, msg); // unnumbered, or late after a gap was given up on
    return "delivered";
  }
  if (msg.seq > order.next) {
    order.held.set(msg.seq, msg);
    order.timer ??= rt.timers.set(() => skipGap(rt), SEQ_GAP_MS);
    return "held";
  }
  order.next++;
  deliver(rt, msg);
  flush(rt);
  return "delivered";
}

/**
 * An event that follows a response waits for the next task: the code awaiting the response runs in
 * promise reactions (microtasks), and a listener called in the same task would run before it, e.g.
 * before the page learned the id that the event refers to. Everything after it waits too, in order.
 */
function deliver(rt: Runtime, msg: BridgeResponse | BridgeEvent): void {
  const order = rt.order;
  if (order.later.length === 0 && !("event" in msg && order.answered)) {
    deliverNow(rt, msg);
    return;
  }
  if (order.later.push(msg) === 1) rt.timers.set(() => drainLater(rt), 0);
}

function deliverNow(rt: Runtime, msg: BridgeResponse | BridgeEvent): void {
  if ("event" in msg) {
    dispatchEvent(rt, msg.plugin, msg.event, msg.data);
    return;
  }
  const pending = rt.pending.get(msg.id);
  if (!pending) return;
  rt.pending.delete(msg.id);
  pending.resolve(msg);
  if (!rt.order.answered) {
    rt.order.answered = true;
    rt.timers.set(() => (rt.order.answered = false), 0);
  }
}

function drainLater(rt: Runtime): void {
  const order = rt.order;
  order.answered = false;
  const queue = order.later;
  while (queue.length) {
    if ("event" in queue[0]! && order.answered) {
      rt.timers.set(() => drainLater(rt), 0);
      return;
    }
    deliverNow(rt, queue.shift()!);
  }
}

/** Delivers the held messages that are next in order; the gap timer restarts for what is left. */
function flush(rt: Runtime): void {
  const order = rt.order;
  for (let msg = order.held.get(order.next); msg; msg = order.held.get(order.next)) {
    order.held.delete(order.next++);
    deliver(rt, msg);
  }
  if (order.timer) rt.timers.clear(order.timer);
  order.timer = order.held.size ? rt.timers.set(() => skipGap(rt), SEQ_GAP_MS) : null;
}

function skipGap(rt: Runtime): void {
  const order = rt.order;
  order.timer = null;
  if (!order.held.size) return;
  const first = Math.min(...order.held.keys());
  if (rt.boot.dev)
    console.warn(
      `[akan-native] bridge messages ${order.next}-${first - 1} did not arrive in ${SEQ_GAP_MS} ms; delivering the later ones`,
    );
  order.next = first;
  flush(rt);
}

/**
 * The page gave up on a call that has no answer yet (its AbortSignal fired, v1.1 `cancel`): it stops
 * waiting now, and the host is told so that the plugin can stop and the call's resources go. The
 * host's late answer finds no pending call and is dropped.
 */
export function cancelCall(rt: Runtime, id: number, reason: CancelReason): void {
  rt.pending.delete(id);
  rt.transport
    ?.send({ v: 1, id: ++rt.nextId, plugin: BRIDGE_PLUGIN, method: CANCEL, args: { id, reason } })
    .catch(() => {});
}

/** Answers a waiting call from the page side (the host could not be reached). */
function settle(rt: Runtime, id: number, code: ErrorCode, message: string): void {
  const pending = rt.pending.get(id);
  rt.pending.delete(id);
  pending?.resolve({ v: 1, id, ok: false, error: { code, message } });
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * How a platform reaches the host: `post` sends a request and returns the host's reply (desktop,
 * iOS), or nothing when replies come through receive() (Android).
 */
interface Channel {
  post(request: BridgeRequest): Promise<unknown>;
  info?(): Record<string, unknown>;
}

/** Every request carries the document id, and every reply goes through receive() (order, doc). */
function connect(rt: Runtime, channel: Channel): Transport {
  return {
    info: channel.info,
    send(req) {
      const request: BridgeRequest = { ...req, doc: rt.doc };
      return new Promise<BridgeResponse>((resolve) => {
        rt.pending.set(request.id, { resolve });
        channel.post(request).then(
          (reply) => {
            if (reply !== undefined && receive(rt, reply) === "ignored")
              settle(rt, request.id, "INTERNAL", "bridge: the host's reply is not a response for this page");
          },
          (error: unknown) =>
            settle(
              rt,
              request.id,
              "INTERNAL",
              error instanceof AkanNativeError
                ? error.message
                : `bridge: ${String((error as Error)?.message ?? error)}`,
            ),
        );
      });
    },
  };
}

function unavailable(reason: string, code: "INTERNAL" | "UNSUPPORTED" = "INTERNAL"): Channel {
  return {
    post: async (req) => ({ v: 1, id: req.id, ok: false, error: { code, message: reason } }),
  };
}

/** True inside an iframe. Cross-origin parents still allow comparing `top` with `self`. */
function inSubframe(): boolean {
  const w = globalThis as { top?: unknown; self?: unknown };
  try {
    return w.top !== undefined && w.top !== w.self;
  } catch {
    return true;
  }
}

function createTransport(rt: Runtime): Transport | null {
  if (rt.boot.platform === "web") return null;
  // SEC-1/SEC-4: the bridge belongs to the app's main frame. A frame running the app bundle
  // (the app's own page in an iframe) answers UNSUPPORTED at once instead of ringing the shell;
  // the hosts refuse frames on their side as well.
  const channel = inSubframe()
    ? unavailable("the native bridge only runs in the app's main frame", "UNSUPPORTED")
    : platformChannel(rt);
  return channel && connect(rt, channel);
}

function platformChannel(rt: Runtime): Channel | null {
  const w = globalThis as any;
  switch (rt.boot.platform) {
    case "macos":
    case "windows":
    case "linux":
      // The desktop host answers in the HTTP response body (architecture §3.3).
      return {
        async post(req) {
          const res = await fetch("/__akan_native/ipc", {
            method: "POST",
            // The marker tells bridge calls apart from stray form posts. The host checks the
            // Referer (WebKit sends no Origin on same-origin POSTs), so keep it even if the
            // page sets <meta name="referrer" content="no-referrer">.
            headers: { "content-type": "application/json", "x-akan-native-ipc": "1" },
            referrerPolicy: "same-origin",
            // Always a string: Blob bodies arrive empty through WRY's custom protocol.
            body: JSON.stringify(req),
          });
          if (!res.ok) {
            throw new AkanNativeError("INTERNAL", `bridge HTTP ${res.status}`);
          }
          return await res.json();
        },
      };

    case "ios": {
      const handler = w.webkit?.messageHandlers?.akanNative;
      if (!handler) return unavailable("webkit.messageHandlers.akanNative is missing");
      // WKScriptMessageHandlerWithReply: postMessage returns a Promise of the reply.
      // JSON text goes over the wire on every platform so that value conversion
      // (NSNumber booleans, nulls, undefined) never differs between hosts.
      return {
        post: async (req) => {
          const reply: unknown = await handler.postMessage(JSON.stringify(req));
          return typeof reply === "string" ? JSON.parse(reply) : reply;
        },
      };
    }

    case "android":
      return androidChannel(rt);
    default:
      return null;
  }
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Android: a MessagePort handed over by the shell with postWebMessage(targetOrigin = app origin),
 * so only the app's main frame gets the bridge. A JavascriptInterface would be injected into
 * every frame, cross-origin iframes included (docs/research/android.md §4.1).
 *
 *   page: listen for "message" → fetch("/__akan_native/hello?n=<nonce>") → shell posts "akan-native:port:<nonce>" + port
 *   page: sends "akan-native:claim" on the port it takes; only then does the shell drop the old port
 *   requests, responses and events all travel over that port as JSON text
 *
 * The nonce and the claim step are SEC-4: any frame can ring the doorbell (a sandboxed frame's
 * fetch carries the app origin as Referer, because the Referer of a frame whose document came from
 * the app origin is that origin), and each ring makes the shell post a port to the main frame. The
 * page takes only the port for its own ring, and the shell keeps the current port until the page
 * claims a new one, so a frame's ring changes nothing.
 *
 * One port per document: the page rings again when no port came within 3 s, so a slow shell can
 * answer twice; the second port is closed unused (taking it would make the shell drop the first
 * one's subscriptions). Requests made before the port are sent once, when it comes. After four
 * rings without a port the waiting calls fail with INTERNAL, as do later ones until a port comes.
 */
function androidChannel(rt: Runtime): Channel {
  const w = globalThis as {
    addEventListener?: typeof addEventListener;
    removeEventListener?: typeof removeEventListener;
    fetch?: typeof fetch;
  };
  let port: MessagePort | null = null;
  let adopted = 0;
  let gaveUp = false;
  const nonce = randomNonce();
  // Requests made before the port came, sent when it does.
  const queue: { id: number; text: string }[] = [];
  let rings = 0;
  const ring = () => {
    rings++;
    // The shell only accepts rings with the app origin as Referer: keep it even under a no-referrer page policy.
    w.fetch?.(`/__akan_native/hello?n=${nonce}`, { referrerPolicy: "same-origin" }).catch(() => {});
  };

  const onMessage = (event: MessageEvent) => {
    // A runtime replaced by a newer one (tests) must not take the port.
    if (akanNativeGlobal().__runtime !== rt && akanNativeGlobal().__runtime !== undefined) {
      w.removeEventListener?.("message", onMessage as EventListener);
      return;
    }
    // The shell's message has no source window (a port posted by an iframe has one) and carries
    // this page's nonce (a port the shell posted for someone else's ring does not).
    if (event.data !== `akan-native:port:${nonce}` || event.source !== null || event.ports.length !== 1) return;
    event.stopImmediatePropagation();
    if (port) {
      event.ports[0]!.close(); // the answer to a second ring
      return;
    }
    adopted++;
    gaveUp = false;
    port = event.ports[0]!;
    port.onmessage = (e) => receive(rt, e.data);
    port.postMessage("akan-native:claim");
    for (const { text } of queue.splice(0)) port.postMessage(text);
  };
  w.addEventListener?.("message", onMessage as EventListener);
  // The doorbell carries nothing and grants nothing. Ring again if no port came (safety net).
  ring();
  const NO_PORT = "the native bridge did not connect (no port from the shell)";
  const fail = (id: number) => settle(rt, id, "INTERNAL", NO_PORT);
  const retry = setInterval(() => {
    if (port) clearInterval(retry);
    else if (rings < 4) ring();
    else {
      clearInterval(retry);
      gaveUp = true;
      for (const { id } of queue.splice(0)) fail(id);
    }
  }, 3000);

  return {
    info: () => ({ ports: adopted }),
    async post(req) {
      const text = JSON.stringify(req);
      if (port) port.postMessage(text);
      else if (gaveUp) throw new AkanNativeError("INTERNAL", NO_PORT);
      else queue.push({ id: req.id, text });
      return undefined; // the response comes over the port
    },
  };
}
