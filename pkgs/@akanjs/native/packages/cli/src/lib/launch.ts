// A launched app whose log lines the CLI can print (akan-native run) or scan (akan-native test).

export interface LaunchOptions {
  /** Runtime env overrides (dev builds), e.g. { AKAN_NATIVE_PUBLIC_SELFTEST: "1" }. */
  env: Record<string, string>;
  /** Do not open windows or steal focus where the platform allows it. */
  headless: boolean;
  /** Receives every log line. Default: print it. */
  onLine?: (line: string) => void;
}

/** A simulator, emulator or device an app can run on (docs/api.md devices). */
export interface Device {
  platform: "ios" | "android";
  /** A simulator's UDID, a paired iPhone's devicectl id, an adb serial, or the name of an AVD that is not running. */
  id: string;
  name: string;
  kind: "simulator" | "emulator" | "device";
  /** "26.5" on iOS; "Android 17 (API 37)" for a running Android device, "API 37" for an AVD that is not. */
  os: string;
  /**
   * booted / shutdown (simulators, AVDs), connected (a paired iPhone, an adb device), unavailable (a
   * paired iPhone out of reach), unpaired (an iPhone this Mac is not paired with), unauthorized (an
   * Android device that has not allowed USB debugging), offline.
   */
  state: "booted" | "shutdown" | "connected" | "unavailable" | "unpaired" | "unauthorized" | "offline";
}

/** Which device: a name or id as text, or one of these. `{ kind }` takes the first one of the kind, running ones first. */
export type DeviceSelector = string | { id: string } | { name: string } | { kind: Device["kind"] };

export interface Launched {
  /** Resolves with the exit code once the app (or log stream) ends. */
  exited: Promise<number>;
  stop(): void;
  /** Where the app runs (iOS and Android). */
  device?: Device;
}

/** Splits a byte stream into lines and hands each to `onLine`. */
export async function pipeLines(
  stream: ReadableStream<Uint8Array> | null | undefined,
  onLine: (line: string) => void,
): Promise<void> {
  if (!stream) return;
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    rest += decoder.decode(chunk, { stream: true });
    let nl = rest.indexOf("\n");
    while (nl >= 0) {
      onLine(rest.slice(0, nl).replace(/\r$/, ""));
      rest = rest.slice(nl + 1);
      nl = rest.indexOf("\n");
    }
  }
  if (rest) onLine(rest);
}

export const printLine = (line: string) => console.info(line);

/** AKAN_NATIVE_PUBLIC_* variables of the CLI's own environment. */
export function envFromProcess(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("AKAN_NATIVE_PUBLIC_") && value !== undefined) out[key] = value;
  }
  return out;
}

const STOP_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/**
 * Calls `handler` once on Ctrl+C, kill or a closed terminal and returns a function that unregisters it.
 * Spawned children (the app, logcat, simctl log stream, Chrome) outlive a CLI that dies of a signal.
 */
export function onStopSignal(handler: () => void): () => void {
  let fired = false;
  const once = () => {
    if (fired) return;
    fired = true;
    handler();
  };
  for (const signal of STOP_SIGNALS) process.on(signal, once);
  return () => {
    for (const signal of STOP_SIGNALS) process.off(signal, once);
  };
}

/** Waits for a launched app and stops it when the CLI is interrupted. */
export async function follow(app: Launched): Promise<number> {
  const off = onStopSignal(() => app.stop());
  try {
    return await app.exited;
  } finally {
    off();
  }
}
