import { describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { fakeHost } from "../../menu/test/fake-host.ts";
import manifest from "../native-plugin.json";
import { pactlLevel, pactlMuted } from "../src/common.ts";
import { createDesktopVolume, resubscribeDelay, resubscribing } from "../src/desktop.ts";

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("volume plugin", () => {
  test("the desktop and Android, not iOS", () => {
    const plugin = { spec: "volume", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual({ volume: { methods: manifest.methods, events: ["change"] } });
    expect(pluginDecls([plugin], "android")).toEqual({ volume: { methods: manifest.methods, events: ["change"] } });
  });

  test("reads pactl's output: the channels' mean, boosts read as full, and the mute", () => {
    expect(
      pactlLevel(
        "Volume: front-left: 32768 /  50% / -18.06 dB,   front-right: 32768 /  50% / -18.06 dB\n        balance 0.00",
      ),
    ).toBe(0.5);
    expect(pactlLevel("Volume: front-left: 26214 /  40% / -23.88 dB,   front-right: 32768 /  50% / -18.06 dB")).toBe(
      0.45,
    );
    expect(pactlLevel("Volume: mono: 98304 / 150% / 10.57 dB")).toBe(1);
    expect(pactlLevel("")).toBeNull();
    expect([pactlMuted("Mute: yes\n"), pactlMuted("Mute: no\n")]).toEqual([true, false]);
  });

  test("macOS and Windows ask the shell, and a bad level never reaches it", async () => {
    const state = { level: 0.3, muted: false, settable: true };
    const host = fakeHost(createDesktopVolume("win32"), () => state);
    expect(await host.call("setVolume", { level: 0.3 })).toMatchObject({ ok: true, result: state });
    await host.call("setMuted", { muted: true });
    await host.call("getVolume");
    expect(await host.call("setVolume", { level: 1.5 })).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(host.shell).toEqual([
      { op: "volume.set", args: { level: 0.3, window: 1 } },
      { op: "volume.mute", args: { muted: true, window: 1 } },
      { op: "volume.get", args: { window: 1 } },
    ]);
  });

  test("macOS: the shell's notices make a change event only when the volume differs", async () => {
    let state = { level: 0.5, muted: false, settable: true };
    const host = fakeHost(createDesktopVolume("darwin"), (op) => (op === "volume.get" ? state : null));
    await host.call("$listen", { event: "change" }, 1);
    await settle();
    expect(host.shell.map((c) => c.op)).toContain("volume.watch");
    host.fire("volume", { event: "changed" });
    await settle();
    expect(host.emitted).toEqual([]);
    state = { level: 0.25, muted: false, settable: true };
    host.fire("volume", { event: "changed" });
    await settle();
    expect(host.emitted).toEqual([{ event: "change", data: state, windows: [1] }]);
  });

  test("Linux: pactl reads and writes the default sink, and its subscribe lines drive the events", async () => {
    const calls: string[][] = [];
    let percent = 50;
    let onLine: (line: string) => void = () => {};
    const pactl = async (...args: string[]) => {
      calls.push(args);
      if (args[0] === "set-sink-volume") percent = Number.parseInt(args[2] ?? "0", 10);
      if (args[0] === "get-sink-volume")
        return `Volume: front-left: 1 / ${percent}% / 0 dB, front-right: 1 / ${percent}% / 0 dB`;
      return "Mute: no\n";
    };
    const host = fakeHost(
      createDesktopVolume("linux", pactl, (listener) => {
        onLine = listener;
        return () => {};
      }),
    );
    expect(await host.call("setVolume", { level: 0.8 })).toMatchObject({
      ok: true,
      result: { level: 0.8, muted: false, settable: true },
    });
    expect(calls[0]).toEqual(["set-sink-volume", "@DEFAULT_SINK@", "80%"]);
    await host.call("$listen", { event: "change" }, 1);
    await settle();
    percent = 20;
    onLine("Event 'new' on client #42");
    await settle();
    expect(host.emitted).toEqual([]);
    onLine("Event 'change' on sink #53");
    await settle();
    expect(host.emitted).toEqual([
      { event: "change", data: { level: 0.2, muted: false, settable: true }, windows: [1] },
    ]);
    expect(host.shell).toEqual([]);
  });

  test("Linux: pactl subscribe starts again after it ends, waiting longer each time, until stopped", async () => {
    const started: { end(): void; stopped: boolean }[] = [];
    const delays: number[] = [];
    const subscribe = resubscribing(
      () => {
        let end = () => {};
        const ended = new Promise<void>((resolve) => (end = resolve));
        const run = { end, stopped: false };
        started.push(run);
        return {
          ended,
          stop: () => {
            run.stopped = true;
          },
        };
      },
      (ends) => {
        delays.push(resubscribeDelay(ends));
        return 1;
      },
    );
    const stop = subscribe(() => {});
    started[0]?.end();
    await Bun.sleep(10);
    started[1]?.end();
    await Bun.sleep(10);
    expect(started).toHaveLength(3);
    expect(delays).toEqual([1000, 2000]);
    stop();
    expect(started[2]?.stopped).toBe(true);
    started[2]?.end();
    await Bun.sleep(10);
    expect(started).toHaveLength(3);
  });

  test("Linux without an audio server answers NOT_FOUND", async () => {
    const host = fakeHost(
      createDesktopVolume("linux", async () => {
        const { AkanNativeError } = await import("../../../packages/core/src/index.ts");
        throw new AkanNativeError("NOT_FOUND", "no audio server answers: Connection failure");
      }),
    );
    expect(await host.call("getVolume")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
