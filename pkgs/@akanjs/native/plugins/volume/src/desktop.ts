// Desktop: the default output's volume and mute.
// - macOS: CoreAudio in the shell (native/desktop/src/volume.rs), which also reports changes (volume.watch).
// - Windows: the endpoint volume in the shell (win/volume.rs), read again every second for changes.
// - Linux: pactl, the PulseAudio client that PipeWire serves too; `pactl subscribe` reports changes.
//   A desktop without an audio server (a container, a headless box) answers NOT_FOUND.
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import { checkLevel, checkMuted, pactlLevel, pactlMuted, sameVolume } from "./common.ts";
import type { VolumeApi, VolumeEvents, VolumeState } from "./index.ts";

const POLL_MS = 1000;

/** Runs pactl and answers its stdout. */
export type Pactl = (...args: string[]) => Promise<string>;

/** Answers stdout lines of `pactl subscribe` until the returned function stops it. */
export type PactlSubscribe = (onLine: (line: string) => void) => () => void;

//? A desktop session's PATH has /usr/bin, but whatever launched the app may have passed no PATH at all.
const pactlPath = () => Bun.which("pactl") ?? "/usr/bin/pactl";
//? pactl translates its output ("Mute: 예", "이벤트 '변경'"), and only the C locale's words are parsed here.
const pactlEnv = () => ({ ...process.env, LC_ALL: "C" });

export const resubscribeDelay = (ends: number) => Math.min(1000 * 2 ** Math.max(ends - 1, 0), 30_000);

export const runPactl: Pactl = async (...args) => {
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn([pactlPath(), ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: pactlEnv() });
  } catch {
    throw new AkanNativeError("UNSUPPORTED", "there is no pactl (PulseAudio's or PipeWire's pulseaudio-utils)");
  }
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new AkanNativeError("NOT_FOUND", `no audio server answers: ${err.trim() || `exit ${code}`}`);
  return out;
};

/** One `pactl subscribe`: its lines until it ends; `stop` ends it. */
export type PactlSubscription = (onLine: (line: string) => void) => { ended: Promise<void>; stop(): void } | null;

const pactlSubscription: PactlSubscription = (onLine) => {
  let proc: Bun.Subprocess<"ignore", "pipe", "ignore">;
  try {
    proc = Bun.spawn([pactlPath(), "subscribe"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      env: pactlEnv(),
    });
  } catch {
    return null;
  }
  const ended = (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of proc.stdout) {
      const lines = (pending + decoder.decode(chunk, { stream: true })).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    }
  })().catch(() => {});
  return { ended, stop: () => proc.kill() };
};

/** `pactl subscribe`, started again (resubscribeDelay) whenever it ends until stopped: a restarted audio server ends it. */
export function resubscribing(
  subscription: PactlSubscription = pactlSubscription,
  delay = resubscribeDelay,
): PactlSubscribe {
  return (onLine) => {
    let stopped = false;
    let current: ReturnType<PactlSubscription> = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ends = 0;
    const start = () => {
      if (stopped) return;
      const startedAt = Date.now();
      current = subscription(onLine);
      if (!current) return;
      void current.ended.then(() => {
        if (stopped) return;
        ends = Date.now() - startedAt >= 60_000 ? 1 : ends + 1;
        timer = setTimeout(start, delay(ends));
      });
    };
    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      current?.stop();
    };
  };
}

export const subscribePactl: PactlSubscribe = resubscribing();

export function createDesktopVolume(
  platform: NodeJS.Platform = process.platform,
  pactl: Pactl = runPactl,
  subscribe: PactlSubscribe = subscribePactl,
) {
  const linux = platform === "linux";

  async function linuxState(): Promise<VolumeState> {
    const [volume, mute] = await Promise.all([
      pactl("get-sink-volume", "@DEFAULT_SINK@"),
      pactl("get-sink-mute", "@DEFAULT_SINK@"),
    ]);
    const level = pactlLevel(volume);
    return { level, muted: pactlMuted(mute), settable: level !== null };
  }

  const read = (ctx: DesktopContext) => (linux ? linuxState() : (ctx.shell("volume.get") as Promise<VolumeState>));

  /** Starts hearing changes; the shell's notices and pactl's lines only say that something changed. */
  function watch(ctx: DesktopContext, changed: () => void): () => void {
    if (platform === "darwin") {
      const stop = ctx.onNativeEvent("volume", changed);
      ctx.shell("volume.watch").catch((error) => console.warn("[akan-native] volume: cannot watch changes", error));
      return stop;
    }
    if (linux)
      return subscribe((line) => {
        if (/'change' on (sink|server)/.test(line)) changed();
      });
    const timer = setInterval(changed, POLL_MS);
    return () => clearInterval(timer);
  }

  return defineDesktopPlugin<VolumeApi, VolumeEvents>({
    id: "volume",
    methods: {
      getVolume: (_args, ctx) => read(ctx),
      async setVolume(args, ctx) {
        const level = checkLevel(args?.level);
        if (!linux) return (await ctx.shell("volume.set", { level })) as VolumeState;
        await pactl("set-sink-volume", "@DEFAULT_SINK@", `${Math.round(level * 100)}%`);
        return linuxState();
      },
      async setMuted(args, ctx) {
        const muted = checkMuted(args?.muted);
        if (!linux) return (await ctx.shell("volume.mute", { muted })) as VolumeState;
        await pactl("set-sink-mute", "@DEFAULT_SINK@", muted ? "1" : "0");
        return linuxState();
      },
    },
    events: {
      change(emit, ctx) {
        let active = true;
        let last: VolumeState | null = null;
        let reading = false;
        let again = false;
        // One read at a time; a change during a read makes one more read after it.
        const refresh = async () => {
          if (reading) {
            again = true;
            return;
          }
          reading = true;
          try {
            do {
              again = false;
              const state = await read(ctx);
              if (!active) return;
              if (last && !sameVolume(last, state)) emit(state);
              last = state;
            } while (again && active);
          } catch (error) {
            if (last) console.warn("[akan-native] volume: reading the volume failed", error);
          } finally {
            reading = false;
          }
        };
        const stop = watch(ctx, () => void refresh());
        void refresh();
        return () => {
          active = false;
          stop();
        };
      },
    },
  });
}

export default createDesktopVolume();
