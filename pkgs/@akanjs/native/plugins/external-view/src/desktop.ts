// Desktop: external views live in the shell (native/desktop/src/external.rs). Trusted keys and the capture go
// through the view's Chrome DevTools Protocol on WebView2, which the shell reaches as `externalView.cdp`.
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type {
  ExternalViewApi,
  ExternalViewBounds,
  ExternalViewConsoleLevel,
  ExternalViewEvents,
  ExternalViewState,
} from "./index.ts";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LEVELS: ExternalViewConsoleLevel[] = ["debug", "info", "warn", "error"];
/** consoleMessage per view: this many in CONSOLE_WINDOW_MS, the rest counted and reported with the next one. */
export const CONSOLE_BURST = 20;
export const CONSOLE_WINDOW_MS = 10_000;

function id(args: unknown): string {
  const value = (args as { id?: unknown } | undefined)?.id;
  if (typeof value !== "string" || !ID.test(value))
    throw new AkanNativeError("INVALID_ARGS", "id must be 1-64 letters, digits, - or _");
  return value;
}

function text(args: unknown, name: string): string {
  const value = (args as Record<string, unknown> | undefined)?.[name];
  if (typeof value !== "string" || !value) throw new AkanNativeError("INVALID_ARGS", `${name} must be a string`);
  return value;
}

function bool(args: unknown, name: string): boolean {
  const value = (args as Record<string, unknown> | undefined)?.[name];
  if (typeof value !== "boolean") throw new AkanNativeError("INVALID_ARGS", `${name} must be a boolean`);
  return value;
}

function bounds(value: unknown): ExternalViewBounds | undefined {
  if (value === undefined || value === "fill") return value;
  const b = value as Record<string, unknown> | null;
  const ok = !!b && ["x", "y", "width", "height"].every((k) => typeof b[k] === "number" && Number.isFinite(b[k]));
  if (!ok || (b?.width as number) <= 0 || (b?.height as number) <= 0)
    throw new AkanNativeError("INVALID_ARGS", 'bounds must be "fill" or { x, y, width, height } with a positive size');
  return value as ExternalViewBounds;
}

export function consoleLevel(value: unknown): ExternalViewConsoleLevel | null {
  if (value === undefined || value === false) return null;
  if (value === true) return "warn";
  if (typeof value === "string" && (LEVELS as string[]).includes(value)) return value as ExternalViewConsoleLevel;
  throw new AkanNativeError("INVALID_ARGS", `console must be a boolean or one of ${LEVELS.join(", ")}`);
}

const shell = (ctx: DesktopContext, op: string, args: Record<string, unknown>) => ctx.shell(`externalView.${op}`, args);

const captureDir = (ctx: DesktopContext) => join(tmpdir(), ctx.app.id, "external-view");

/** The engine's own text, which the shell sends on as a string: JSON, or not, as the engine had it. */
function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function state(raw: unknown): ExternalViewState {
  const { view, ...rest } = raw as { view: string } & Omit<ExternalViewState, "id">;
  return { id: view, ...rest };
}

/** Chrome's virtual key code for a KeyboardEvent.code, which a trusted key event needs beside `key`. */
export function virtualKey(code: string): number {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter?.[1]) return letter[1].charCodeAt(0);
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit?.[1]) return (code.startsWith("Numpad") ? 96 : 48) + Number(digit[1]);
  const fn = /^F([0-9]{1,2})$/.exec(code);
  if (fn?.[1] && Number(fn[1]) >= 1 && Number(fn[1]) <= 24) return 111 + Number(fn[1]);
  const named: Record<string, number> = {
    Space: 32,
    Enter: 13,
    NumpadEnter: 13,
    Escape: 27,
    Tab: 9,
    Backspace: 8,
    Delete: 46,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34,
    Slash: 191,
    Minus: 189,
    Equal: 187,
    Period: 190,
    Comma: 188,
    Semicolon: 186,
    Quote: 222,
    BracketLeft: 219,
    BracketRight: 221,
    Backslash: 220,
    Backquote: 192,
  };
  const known = Object.hasOwn(named, code) ? named[code] : undefined;
  if (known === undefined) throw new AkanNativeError("INVALID_ARGS", `code ${code} is not a key sendKey knows`);
  return known;
}

interface CdpConsoleCall {
  type?: string;
  args?: { value?: unknown; description?: string; unserializableValue?: string; type?: string }[];
  stackTrace?: { callFrames?: { url?: string; lineNumber?: number }[] };
}
interface CdpException {
  exceptionDetails?: {
    text?: string;
    url?: string;
    lineNumber?: number;
    exception?: { description?: string };
    stackTrace?: CdpConsoleCall["stackTrace"];
  };
}

/** One console call or uncaught exception as a message, from the protocol event the shell passed on. */
export function consoleMessageOf(
  method: string,
  params: unknown,
): Omit<ExternalViewEvents["consoleMessage"], "id"> | null {
  if (method === "Runtime.exceptionThrown") {
    const details = (params as CdpException).exceptionDetails ?? {};
    const frame = details.stackTrace?.callFrames?.[0];
    return {
      level: "error",
      text: details.exception?.description ?? details.text ?? "Uncaught exception",
      ...(details.url || frame?.url ? { url: details.url || frame?.url } : {}),
      ...(typeof details.lineNumber === "number" ? { line: details.lineNumber + 1 } : {}),
    };
  }
  if (method !== "Runtime.consoleAPICalled") return null;
  const call = params as CdpConsoleCall;
  const level: ExternalViewConsoleLevel =
    call.type === "error" || call.type === "assert"
      ? "error"
      : call.type === "warning"
        ? "warn"
        : call.type === "debug"
          ? "debug"
          : "info";
  const parts = (call.args ?? []).map((arg) =>
    typeof arg.value === "string"
      ? arg.value
      : String(arg.value ?? arg.unserializableValue ?? arg.description ?? arg.type),
  );
  const frame = call.stackTrace?.callFrames?.[0];
  return {
    level,
    text: parts.join(" "),
    ...(frame?.url ? { url: frame.url } : {}),
    ...(typeof frame?.lineNumber === "number" ? { line: frame.lineNumber + 1 } : {}),
  };
}

/** Lets CONSOLE_BURST messages through per window of time, and counts what it held back for the next one. */
export function createConsoleCap(now: () => number = Date.now) {
  const views = new Map<string, { since: number; sent: number; dropped: number }>();
  return (view: string): { pass: boolean; dropped: number } => {
    const t = now();
    const entry = views.get(view) ?? { since: t, sent: 0, dropped: 0 };
    if (t - entry.since >= CONSOLE_WINDOW_MS) Object.assign(entry, { since: t, sent: 0 });
    views.set(view, entry);
    if (entry.sent >= CONSOLE_BURST) {
      entry.dropped++;
      return { pass: false, dropped: 0 };
    }
    entry.sent++;
    const dropped = entry.dropped;
    entry.dropped = 0;
    return { pass: true, dropped };
  };
}

export function createDesktopExternalView() {
  /** The console level each view was opened with: the shell sends every message, and this filters them. */
  const levels = new Map<string, ExternalViewConsoleLevel>();
  /** Each view's last capture, deleted by its next one: a kiosk captured around the clock keeps one file per view. */
  const captures = new Map<string, string>();

  return defineDesktopPlugin<ExternalViewApi, ExternalViewEvents>({
    id: "external-view",
    setup(ctx) {
      // Captures of an earlier session are no longer reachable (their FileRefs are gone).
      rmSync(captureDir(ctx), { recursive: true, force: true });
    },
    methods: {
      async open(args, ctx) {
        const view = id(args);
        const url = text(args, "url");
        const allowOrigins = (args as { allowOrigins?: unknown }).allowOrigins;
        if (!Array.isArray(allowOrigins) || !allowOrigins.length || allowOrigins.some((o) => typeof o !== "string"))
          throw new AkanNativeError("INVALID_ARGS", "allowOrigins must be a list of origins");
        const level = consoleLevel(args.console);
        const opened = state(
          await shell(ctx, "open", {
            view,
            url,
            allowOrigins,
            ...(args.bounds !== undefined ? { bounds: bounds(args.bounds) } : {}),
            ...(typeof args.initScript === "string" ? { initScript: args.initScript } : {}),
            muted: args.muted === true,
            autoplay: args.autoplay !== false,
            console: level !== null,
            ...(args.window !== undefined ? { window: args.window } : {}),
          }),
        );
        if (level) levels.set(view, level);
        else levels.delete(view);
        return opened;
      },
      async navigate(args, ctx) {
        await shell(ctx, "navigate", { view: id(args), url: text(args, "url") });
      },
      async reload(args, ctx) {
        await shell(ctx, "reload", { view: id(args) });
      },
      async close(args, ctx) {
        const view = id(args);
        await shell(ctx, "close", { view });
        levels.delete(view);
      },
      async list(_args, ctx) {
        return ((await shell(ctx, "list", {})) as unknown[]).map(state);
      },
      async setVisible(args, ctx) {
        await shell(ctx, "setVisible", { view: id(args), visible: bool(args, "visible") });
      },
      async setBounds(args, ctx) {
        await shell(ctx, "setBounds", { view: id(args), bounds: bounds(args.bounds) ?? "fill" });
      },
      async evaluate(args, ctx) {
        return { value: parsed(await shell(ctx, "evaluate", { view: id(args), script: text(args, "script") })) };
      },
      async sendKey(args, ctx) {
        const view = id(args);
        const key = text(args, "key");
        const code = text(args, "code");
        const vk = virtualKey(code);
        const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
        //? keyDown carrying `text` makes Chrome fire keypress and input too, as a real printable key does; Enter's is
        //? "\r", without which a form does not submit and a focused button does not click.
        const typed = key.length === 1 ? key : key === "Enter" ? "\r" : "";
        const keyUp = () =>
          shell(ctx, "cdp", { view, method: "Input.dispatchKeyEvent", params: { type: "keyUp", ...base } });
        try {
          await shell(ctx, "cdp", {
            view,
            method: "Input.dispatchKeyEvent",
            params: { type: "keyDown", ...base, ...(typed ? { text: typed, unmodifiedText: typed } : {}) },
          });
        } catch (error) {
          //? A keyDown past its deadline still waits in the busy page's queue: its keyUp follows, or the key stays held.
          if (error instanceof AkanNativeError && error.code === "TIMEOUT") void keyUp().catch(() => {});
          throw error;
        }
        await keyUp();
      },
      async setMuted(args, ctx) {
        await shell(ctx, "setMuted", { view: id(args), muted: bool(args, "muted") });
      },
      async clearData(args, ctx) {
        await shell(ctx, "clearData", { view: id(args) });
      },
      async capture(args, ctx) {
        const view = id(args);
        const shot = parsed(
          await shell(ctx, "cdp", { view, method: "Page.captureScreenshot", params: { format: "png" } }),
        ) as { data?: string } | null;
        if (!shot?.data) throw new AkanNativeError("INTERNAL", "the view answered no screenshot");
        const dir = captureDir(ctx);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${view}-${Date.now()}.png`);
        const bytes = Buffer.from(shot.data, "base64");
        await Bun.write(file, bytes);
        const previous = captures.get(view);
        captures.set(view, file);
        if (previous && previous !== file) rmSync(previous, { force: true });
        //? A PNG's IHDR, always at the same place: its width and height without decoding the image.
        const size = bytes.length >= 24 ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {};
        return { ...ctx.registerFile(file, "image/png"), ...size };
      },
    },
    events: {
      load: (emit, ctx) =>
        ctx.onNativeEvent("externalView", (e) => {
          if (e.event !== "load") return;
          emit(
            { id: e.view as string, state: e.state as "started" | "finished", url: e.url as string },
            { window: e.window as number },
          );
        }),
      loadFailed: (emit, ctx) =>
        ctx.onNativeEvent("externalView", (e) => {
          if (e.event !== "loadFailed") return;
          emit(
            { id: e.view as string, url: e.url as string, errorCode: e.errorCode as string },
            { window: e.window as number },
          );
        }),
      gone: (emit, ctx) =>
        ctx.onNativeEvent("externalView", (e) => {
          if (e.event !== "gone") return;
          emit(
            { id: e.view as string, reason: e.reason as string, restarts: e.restarts as number },
            { window: e.window as number },
          );
        }),
      consoleMessage: (emit, ctx) => {
        const cap = createConsoleCap();
        return ctx.onNativeEvent("externalView", (e) => {
          if (e.event !== "cdp") return;
          const view = e.view as string;
          const min = levels.get(view);
          const message = min ? consoleMessageOf(e.method as string, e.params) : null;
          if (!min || !message || LEVELS.indexOf(message.level) < LEVELS.indexOf(min)) return;
          const { pass, dropped } = cap(view);
          if (!pass) return;
          emit({ id: view, ...message, ...(dropped ? { dropped } : {}) }, { window: e.window as number });
        });
      },
    },
  });
}

export default createDesktopExternalView();
