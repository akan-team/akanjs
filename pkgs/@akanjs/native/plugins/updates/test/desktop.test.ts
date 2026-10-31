// The desktop updates plugin on an app folder in a temporary "install", with a scripted relaunch and a local
// release server; the Linux layout on every OS (macOS would check a code signature).
import { afterEach, describe, expect, test } from "bun:test";
import { createHash, createPublicKey, generateKeyPairSync, type KeyObject, sign, verify } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, uptime } from "node:os";
import { dirname, join } from "node:path";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import { createLifecycle } from "../../../packages/desktop/src/lifecycle.ts";
import type { DesktopServerStatus, NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import { createServerStatus } from "../../../packages/desktop/src/server.ts";
import { createDesktopUpdates, type DesktopUpdatesOptions, MAX_STRIKES, type UpdatesConfig } from "../src/desktop.ts";

const APP_ID = "dev.test.updates";
const EXE = "demo";
const BUILD = 1000;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const writeApp = (dir: string, marker: string, { server = false } = {}) => {
  mkdirSync(join(dir, "resources"), { recursive: true });
  writeFileSync(join(dir, "resources", "boot.json"), JSON.stringify({ app: { id: APP_ID }, marker }));
  if (server) writeFileSync(join(dir, "resources", "server.json"), "{}");
  writeFileSync(join(dir, EXE), "");
};
const markerOf = (dir: string) =>
  (JSON.parse(readFileSync(join(dir, "resources", "boot.json"), "utf8")) as { marker: string }).marker;

interface HarnessOptions {
  /** state.json before the plugin's setup; `app` is the installed app's folder. */
  state?: (app: string) => Record<string, unknown>;
  server?: DesktopServerStatus;
  readyTimeout?: number;
  serverBootAllowance?: number;
  serverSettle?: number;
  url?: string;
  publicKey?: string;
  /** Protocol v2 with this ring (updates.json `publicKeys`). */
  publicKeys?: string[];
  target?: string;
  /** The installed app carries a server (resources/server.json). */
  carries?: boolean;
  platform?: NodeJS.Platform;
  embeddedSequence?: number;
  dev?: boolean;
  /** The folder the app is installed in, when it is not a fresh temporary one. */
  root?: string;
  signatureTool?: DesktopUpdatesOptions["signatureTool"];
  /** The native shell's ops (ctx.shell); none by default, so every op is UNSUPPORTED. */
  shell?: (op: string, args?: Record<string, unknown>) => Promise<unknown>;
  /** updates.automatic, off by default here; named, `quit()` runs the app's quit hooks. */
  automatic?: boolean;
  autoCheckDelay?: number;
  /** The relaunch helper refuses (another relaunch is under way). */
  relaunchRefuses?: boolean;
}

async function harness(options: HarnessOptions = {}) {
  const root = options.root ?? mkdtempSync(join(tmpdir(), "akan-native-updates-"));
  if (!options.root) roots.push(root);
  const install = join(root, "install");
  const app = join(install, "Renamed App");
  if (!existsSync(app)) writeApp(app, "installed", { server: options.carries });
  const stateDir = join(root, "local", options.dev ? "akan-native-updates-debug" : "akan-native-updates");
  if (options.state) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "state.json"), JSON.stringify(options.state(app)));
  }
  const config: UpdatesConfig = {
    app: APP_ID,
    platform: "linux",
    nativeApi: null,
    embeddedSequence: options.embeddedSequence ?? BUILD,
    url: options.url ?? "http://127.0.0.1:1",
    publicKey: options.publicKey ?? options.publicKeys?.[0] ?? "",
    ...(options.publicKeys ? { protocol: 2, publicKeys: options.publicKeys } : {}),
    ...(options.target ? { target: options.target } : {}),
    channel: "main",
    readyTimeout: options.readyTimeout ?? 50,
    ...(options.automatic ? {} : { automatic: false }),
  };
  const relaunches: {
    exe: string;
    moves: [string, string][];
    recover?: { script: string; name: string };
    start?: false;
  }[] = [];
  const plugin = createDesktopUpdates({
    platform: options.platform ?? "linux",
    app,
    config,
    exeName: EXE,
    serverBootAllowance: options.serverBootAllowance ?? 150,
    serverSettle: options.serverSettle ?? 20,
    autoCheckDelay: options.autoCheckDelay ?? 20,
    autoCheckInterval: 60_000,
    relaunch: async (exe, moves, recover, start = true) => {
      if (options.relaunchRefuses) throw new Error("the app is already being relaunched without these moves");
      if (options.platform !== "win32") for (const [from, to] of moves) renameSync(from, to);
      relaunches.push({ exe, moves, ...(recover ? { recover } : {}), ...(start ? {} : { start: false as const }) });
    },
    ...(options.signatureTool ? { signatureTool: options.signatureTool } : {}),
  });
  const listeners = new Map<string, Set<(event: NativeEvent) => void>>();
  const quits: number[] = [];
  const lifecycle =
    options.automatic !== undefined
      ? createLifecycle({
          quitOnLastWindowClosed: true,
          exit: (code) => void quits.push(code),
          cancelSessionEnd: () => {},
          hideWindow: async () => {},
        })
      : undefined;
  const dispatcher = createDispatcher([plugin], {
    app: { id: APP_ID, name: "Test", version: "1.0.0" },
    dev: options.dev,
    appDataDir: join(root, "roaming"),
    appLocalDataDir: join(root, "local"),
    server: options.server ?? null,
    emit: () => {},
    ...(options.shell ? { shell: options.shell } : {}),
    registerFile: () => ({ url: "", mime: "", size: 0 }),
    onNativeEvent: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      listeners.set(type, set.add(listener));
      return () => set.delete(listener);
    },
    quit: (code) => void quits.push(code),
    ...(lifecycle ? { lifecycle } : {}),
  });
  await dispatcher.launched;
  const quit = () => lifecycle?.quit(0);
  const call = async (method: string, args?: unknown) =>
    (await dispatcher.handle(
      JSON.stringify({ v: 1, id: 1, plugin: "updates", method, ...(args !== undefined ? { args } : {}) }),
      1,
    )) as {
      ok: boolean;
      result?: unknown;
      error?: { code: string; message: string };
    };
  const fire = (type: string, event: Record<string, unknown>) => {
    for (const listener of listeners.get(type) ?? []) listener({ type, ...event });
  };
  const state = () => JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8")) as Record<string, unknown>;
  return { root, install, app, stateDir, call, fire, state, relaunches, quits, quit };
}

/** A carried server the test moves through its states (the plugin host's ctx.server). */
const fakeServer = () => {
  const { status, settle, setState } = createServerStatus();
  const up = () => {
    settle(true);
    setState("up");
  };
  return { status, up, setState };
};

const until = async (check: () => boolean, ms = 2000) => {
  for (const started = performance.now(); !check() && performance.now() - started < ms; ) await Bun.sleep(10);
};

/** A release on trial whose app is the running build, with the app it replaced beside it. */
const onTrial = (app: string) => {
  writeApp(`${app}.previous`, "previous");
  return {
    trial: {
      bundle: "2000-aaaaaaaa",
      sequence: 2000,
      version: "2.0.0",
      tar: "0".repeat(64),
      build: BUILD,
      previous: `${app}.previous`,
      attempts: 0,
    },
    failed: [],
  };
};

describe("desktop updates: the channel a server moves this device to", () => {
  test("setChannel reads another manifest from now on, survives a restart, and null goes back to the built one", async () => {
    const asked: string[] = [];
    const feed = Bun.serve({
      port: 0,
      fetch: (req) => {
        asked.push(new URL(req.url).pathname);
        return new Response("no release", { status: 404 });
      },
    });
    try {
      const url = `http://127.0.0.1:${feed.port}/releases`;
      const { call, state, root } = await harness({ url });
      expect(await call("setChannel", { channel: "pilot" })).toMatchObject({ ok: true });
      expect(state().channel).toBe("pilot");
      expect(((await call("getState")).result as { channel: string }).channel).toBe("pilot");
      expect(await call("check")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(asked.at(-1)).toBe(`/releases/linux-${process.arch}/pilot.json`);

      const restarted = await harness({ url, root });
      expect(((await restarted.call("getState")).result as { channel: string }).channel).toBe("pilot");
      expect(await restarted.call("setChannel", { channel: null })).toMatchObject({ ok: true });
      await restarted.call("check");
      expect(asked.at(-1)).toBe(`/releases/linux-${process.arch}/main.json`);
      for (const channel of ["../stable", "Pilot", "app", "files", "x".repeat(42)])
        expect(await restarted.call("setChannel", { channel })).toMatchObject({
          ok: false,
          error: { code: "INVALID_ARGS" },
        });
    } finally {
      feed.stop(true);
    }
  });

  test("a download of the channel the device leaves is dropped, one of the channel it stays on is kept", async () => {
    const { call, state, install } = await harness({ state: (app) => pendingOf(app, BUILD + 100) });
    expect(await call("setChannel", { channel: "main" })).toMatchObject({ ok: true });
    expect(state().pending).toMatchObject({ bundle: `${BUILD + 100}-aaaaaaaa` });
    expect(await call("setChannel", { channel: "pilot" })).toMatchObject({ ok: true });
    expect(state().pending).toBeUndefined();
    expect(readdirSync(install)).toEqual(["Renamed App"]);
    expect(await call("apply")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    const back = await harness({ state: (app) => ({ ...pendingOf(app, BUILD + 100), channel: "pilot" }) });
    expect(await back.call("setChannel", { channel: null })).toMatchObject({ ok: true });
    expect(back.state().pending).toBeUndefined();
    expect(back.state().channel).toBeUndefined();
  });

  test("reset() keeps the channel setChannel() chose", async () => {
    const { call, state } = await harness({
      state: (app) => ({ ...pendingOf(app, BUILD + 100), failed: ["900-aaaaaaaa"], channel: "pilot" }),
    });
    expect(await call("reset")).toMatchObject({ ok: true });
    expect(state()).toMatchObject({ channel: "pilot", failed: [] });
    expect(state().pending).toBeUndefined();
    expect(((await call("getState")).result as { channel: string }).channel).toBe("pilot");
  });

  test("a release downloaded while setChannel() moved the device is not kept", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    let open = () => {};
    const release = serveRelease(root, { archiveGate: new Promise<void>((resolve) => (open = resolve)) });
    try {
      const { call, state, install } = await harness({ url: release.url, publicKey: release.publicKey });
      const downloaded = call("download");
      await until(() => release.archiveRequests() > 0);
      expect(await call("setChannel", { channel: "pilot" })).toMatchObject({ ok: true });
      open();
      expect(await downloaded).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
      expect(state().pending).toBeUndefined();
      expect(state().failed).toEqual([]);
      expect(readdirSync(install)).toEqual(["Renamed App"]);
    } finally {
      release.stop();
    }
  });
});

describe("desktop updates: the trial of a release that carries a server", () => {
  test("a server that never comes up rolls the release back at once and keeps it for another try", async () => {
    const server = fakeServer();
    const { state, relaunches, quits, app } = await harness({
      server: server.status,
      readyTimeout: 5000,
      serverBootAllowance: 100,
      state: onTrial,
    });
    await until(() => quits.length > 0);
    expect(quits).toEqual([0]);
    const kept = join(`${app}.update-2000-aaaaaaaa`, "Renamed App");
    expect(relaunches[0]?.moves).toEqual([
      [app, kept],
      [`${app}.previous`, app],
    ]);
    expect(markerOf(app)).toBe("previous");
    expect(markerOf(kept)).toBe("installed");
    expect(state()).toMatchObject({
      failed: [],
      strikes: { "2000-aaaaaaaa": 1 },
      rolledBack: "2000-aaaaaaaa",
      pending: { bundle: "2000-aaaaaaaa", staged: kept },
    });
    expect(state().trial).toBeUndefined();
  });

  test(`a server that gives up on its ${MAX_STRIKES}rd try fails the release for good`, async () => {
    const server = fakeServer();
    const { state, relaunches, quits, app } = await harness({
      server: server.status,
      readyTimeout: 5000,
      serverBootAllowance: 5000,
      state: (app) => ({ ...onTrial(app), strikes: { "2000-aaaaaaaa": MAX_STRIKES - 1 } }),
    });
    server.setState("gaveUp");
    await until(() => quits.length > 0);
    expect(relaunches[0]?.moves[0]).toEqual([app, `${app}.failed-2000-aaaaaaaa`]);
    expect(state()).toMatchObject({ failed: ["2000-aaaaaaaa"], rolledBack: "2000-aaaaaaaa" });
    expect((state().reasons as Record<string, string>)["2000-aaaaaaaa"]).toContain("gave up");
    expect(state().pending).toBeUndefined();
    expect(state().strikes).toEqual({});
  });

  test("a server slower than readyTimeout but within its allowance confirms the release once it settled", async () => {
    const server = fakeServer();
    const { fire, call, state, quits, app } = await harness({
      server: server.status,
      readyTimeout: 50,
      serverBootAllowance: 5000,
      serverSettle: 50,
      state: onTrial,
    });
    fire("pageLoad", { event: "finished", window: 1 });
    const confirmed = call("notifyReady");
    await Bun.sleep(150);
    server.up();
    expect(await confirmed).toMatchObject({ ok: true });
    await Bun.sleep(150);
    expect(quits).toEqual([]);
    expect(state()).toMatchObject({ current: { bundle: "2000-aaaaaaaa" }, failed: [] });
    expect(state().trial).toBeUndefined();
    expect(existsSync(`${app}.previous`)).toBe(false);
  });

  test("a server that crashes right after its ready is not confirmed until it stays up", async () => {
    const server = fakeServer();
    const { call, state, quits } = await harness({
      server: server.status,
      readyTimeout: 5000,
      serverBootAllowance: 5000,
      serverSettle: 100,
      state: onTrial,
    });
    const confirmed = call("notifyReady");
    server.up();
    await Bun.sleep(30);
    server.setState("starting");
    await Bun.sleep(150);
    expect(state().trial).toBeDefined();
    server.setState("up");
    expect(await confirmed).toMatchObject({ ok: true });
    expect(state()).toMatchObject({ current: { bundle: "2000-aaaaaaaa" } });
    expect(quits).toEqual([]);
  });

  test("a server that settled and then gave up before the page confirmed rolls the release back", async () => {
    const server = fakeServer();
    const { call, state, quits } = await harness({
      server: server.status,
      readyTimeout: 5000,
      serverBootAllowance: 5000,
      state: onTrial,
    });
    server.up();
    await Bun.sleep(60);
    server.setState("restarting");
    const confirmed = call("notifyReady");
    server.setState("gaveUp");
    expect(await confirmed).toMatchObject({ ok: true });
    await until(() => quits.length > 0);
    expect(state()).toMatchObject({ strikes: { "2000-aaaaaaaa": 1 }, rolledBack: "2000-aaaaaaaa" });
    expect(state().current).toBeUndefined();
  });

  test("the process that rolled a release back takes no release until it exits, least of all that one", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    const release = serveRelease(root, { sequence: 2000, bundle: "2000-aaaaaaaa", build: BUILD });
    try {
      const server = fakeServer();
      const { call, state, relaunches, quits, app } = await harness({
        url: release.url,
        publicKey: release.publicKey,
        server: server.status,
        readyTimeout: 5000,
        serverBootAllowance: 5000,
        state: onTrial,
      });
      server.setState("gaveUp");
      await until(() => quits.length > 0);
      const kept = join(`${app}.update-2000-aaaaaaaa`, "Renamed App");
      expect(state()).toMatchObject({ pending: { bundle: "2000-aaaaaaaa", staged: kept } });
      expect(await call("getState")).toMatchObject({ result: { trial: true } });
      expect(await call("check")).toMatchObject({ ok: true, result: { available: false } });
      expect(await call("apply")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
      release.publish({ sequence: 3000, bundle: "3000-bbbbbbbb", build: 2999 });
      expect(await call("check")).toMatchObject({ ok: true, result: { available: false, bundle: "3000-bbbbbbbb" } });
      expect(await call("download")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
      expect(release.archiveRequests()).toBe(0);
      expect(relaunches).toHaveLength(1);
      expect(markerOf(app)).toBe("previous");
      expect(markerOf(kept)).toBe("installed");
      expect(state().trial).toBeUndefined();
    } finally {
      release.stop();
    }
  });

  test("a live process under the trial's PID is not a second instance of an app that carries a server", async () => {
    const server = fakeServer();
    const { state } = await harness({
      server: server.status,
      readyTimeout: 5000,
      serverBootAllowance: 5000,
      state: (app) => ({ ...onTrial(app), trial: { ...onTrial(app).trial, attempts: 1, pid: process.ppid } }),
    });
    await until(() => state().trial === undefined);
    expect(state()).toMatchObject({ failed: ["2000-aaaaaaaa"], rolledBack: "2000-aaaaaaaa" });
  });
});

describe("desktop updates: while a release is on trial", () => {
  test("its own release is not newer than itself, and nothing is applied over it", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    const release = serveRelease(root, { sequence: 2000, bundle: "2000-aaaaaaaa", build: BUILD });
    try {
      const { call, app } = await harness({
        url: release.url,
        publicKey: release.publicKey,
        readyTimeout: 5000,
        state: (app) => ({ ...onTrial(app), ...pendingOf(app, 3000), failed: [] }),
      });
      expect(await call("getState")).toMatchObject({ result: { trial: true, bundle: "2000-aaaaaaaa" } });
      expect(await call("check")).toMatchObject({ ok: true, result: { available: false } });
      expect(await call("download")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(release.archiveRequests()).toBe(0);
      expect(await call("apply")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
      expect(markerOf(`${app}.previous`)).toBe("previous");
    } finally {
      release.stop();
    }
  });

  test("the release this binary was built from is not newer, though no entry names it", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    const key = newKey();
    const v1 = serveRelease(root, { sequence: 2000, bundle: "2000-aaaaaaaa", build: BUILD });
    const v2 = serveRelease(root, { sequence: 2000, bundle: "2000-aaaaaaaa", build: BUILD, signer: key });
    try {
      for (const options of [
        { url: v1.url, publicKey: v1.publicKey },
        { url: v2.url, publicKeys: [rawKey(key)] },
      ]) {
        const { call, state } = await harness({
          ...options,
          state: (app) => {
            const { pending } = pendingOf(app, 2000);
            return { pending: { ...pending, bundle: "2000-aaaaaaaa", build: BUILD }, failed: [] };
          },
        });
        expect(state().pending).toBeUndefined();
        expect(await call("check")).toMatchObject({ ok: true, result: { available: false } });
        expect(await call("download")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      }
      expect(v1.archiveRequests() + v2.archiveRequests()).toBe(0);
    } finally {
      v1.stop();
      v2.stop();
    }
  });

  test("a process under the recorded PID from before a reboot is not the trial", async () => {
    const { state } = await harness({
      state: (app) => ({
        ...onTrial(app),
        trial: { ...onTrial(app).trial, attempts: 1, pid: process.ppid, boot: 1 },
      }),
    });
    await until(() => state().trial === undefined);
    expect(state()).toMatchObject({ failed: ["2000-aaaaaaaa"], rolledBack: "2000-aaaaaaaa" });
  });

  test("a process under the recorded PID of this boot is a second instance, which leaves the trial alone", async () => {
    const { state, quits } = await harness({
      state: (app) => ({ ...onTrial(app), trial: { ...onTrial(app).trial, attempts: 1, pid: process.ppid } }),
    });
    await Bun.sleep(100);
    expect(quits).toEqual([]);
    expect(state()).toMatchObject({ trial: { bundle: "2000-aaaaaaaa", attempts: 1 } });
  });

  test("reset() keeps the trial it cannot undo", async () => {
    const { call, state } = await harness({ readyTimeout: 5000, state: onTrial });
    expect(await call("reset")).toMatchObject({ ok: true });
    expect(state()).toMatchObject({ trial: { bundle: "2000-aaaaaaaa" }, failed: [] });
  });
});

const pendingOf = (app: string, sequence: number) => {
  const bundle = `${sequence}-aaaaaaaa`;
  const staged = join(`${app}.update-${bundle}`, "Sample");
  writeApp(staged, "downloaded");
  return {
    pending: { bundle, sequence, version: "0.9.0", tar: "0".repeat(64), build: sequence, staged },
    failed: [],
  };
};

describe("desktop updates: what a restart finds", () => {
  test("a swap the Windows helper put back waits for the next apply, and fails the release on its last try", async () => {
    const trialOf = (app: string, strikes: number) => {
      const staged = join(`${app}.update-2000-aaaaaaaa`, "Sample");
      writeApp(staged, "downloaded");
      const { trial } = onTrial(app);
      rmSync(trial.previous, { recursive: true, force: true }); // the helper moved it back
      return {
        trial: { ...trial, build: 2000, from: BUILD, staged },
        failed: [],
        ...(strikes ? { strikes: { "2000-aaaaaaaa": strikes } } : {}),
      };
    };
    const first = await harness({ state: (app) => trialOf(app, 0) });
    expect(first.state()).toMatchObject({
      failed: [],
      strikes: { "2000-aaaaaaaa": 1 },
      pending: { bundle: "2000-aaaaaaaa", staged: join(`${first.app}.update-2000-aaaaaaaa`, "Sample") },
    });
    expect(first.state().trial).toBeUndefined();
    expect(existsSync(join(`${first.app}.update-2000-aaaaaaaa`, "Sample", EXE))).toBe(true);

    const last = await harness({ state: (app) => trialOf(app, MAX_STRIKES - 1) });
    expect(last.state()).toMatchObject({ failed: ["2000-aaaaaaaa"] });
    expect(last.state().pending).toBeUndefined();
    expect(readdirSync(last.install)).toEqual(["Renamed App"]);
  });

  test("a rollback whose moves did not happen is made again by the failed build", async () => {
    const { relaunches, state, app } = await harness({
      embeddedSequence: 2000,
      state: (app) => {
        writeApp(`${app}.previous`, "previous");
        return {
          failed: ["2000-aaaaaaaa"],
          rolledBack: "2000-aaaaaaaa",
          rollback: { build: 2000, previous: `${app}.previous`, to: `${app}.failed-2000-aaaaaaaa`, attempts: 1 },
        };
      },
    });
    expect(relaunches[0]?.moves).toEqual([
      [app, `${app}.failed-2000-aaaaaaaa`],
      [`${app}.previous`, app],
    ]);
    expect(markerOf(app)).toBe("previous");
    expect(state()).toMatchObject({ rollback: { attempts: 2 } });
  });

  test("an app installed again forgets the releases the earlier install refused", async () => {
    const { state } = await harness({
      embeddedSequence: BUILD + 5,
      state: () => ({ failed: ["2000-aaaaaaaa"], reasons: { "2000-aaaaaaaa": "x" }, installed: BUILD }),
    });
    expect(state()).toMatchObject({ failed: [], installed: BUILD + 5 });
  });

  test("an unreadable state.json falls back to the one it replaced", async () => {
    const { state, stateDir } = await harness({
      state: (app) => ({ ...onTrial(app), trial: { ...onTrial(app).trial, attempts: 1 } }),
    });
    await until(() => state().trial === undefined);
    writeFileSync(join(stateDir, "state.json"), "");
    const again = await harness({ root: dirname(dirname(stateDir)) });
    expect(again.state()).toMatchObject({ failed: ["2000-aaaaaaaa"] });
  });

  test("the .previous a confirmed release could not remove goes at the next start, and only then", async () => {
    const entry = { bundle: "2000-aaaaaaaa", sequence: 2000, version: "2.0.0", tar: "0".repeat(64), build: BUILD };
    const confirmed = await harness({
      state: (app) => {
        writeApp(`${app}.previous`, "previous");
        return { current: entry, failed: [] };
      },
    });
    expect(readdirSync(confirmed.install)).toEqual(["Renamed App"]);
    const stuck = await harness({
      embeddedSequence: 3000,
      state: (app) => {
        writeApp(`${app}.previous`, "previous");
        return { current: entry, failed: ["3000-aaaaaaaa"] };
      },
    });
    expect(readdirSync(stuck.install).sort()).toEqual(["Renamed App", "Renamed App.previous"]);
  });

  test("a debug build keeps its own record beside the release app's", async () => {
    const { state, stateDir } = await harness({ dev: true, state: (app) => pendingOf(app, BUILD + 100) });
    expect(stateDir.endsWith("akan-native-updates-debug")).toBe(true);
    expect(state().pending).toMatchObject({ bundle: `${BUILD + 100}-aaaaaaaa` });
  });

  test("a trial whose app is gone because another build was installed is dropped, not failed", async () => {
    const { state } = await harness({
      state: (app) => ({ trial: { ...onTrial(app).trial, build: 2000, from: 500 }, failed: [] }),
    });
    expect(state()).toMatchObject({ failed: [] });
    expect(state().trial).toBeUndefined();
  });

  test("a download left from before a reinstall at a newer build is dropped with its folder", async () => {
    const { state, call, install } = await harness({ state: (app) => pendingOf(app, BUILD - 100) });
    expect(state().pending).toBeUndefined();
    expect(readdirSync(install)).toEqual(["Renamed App"]);
    expect(await call("apply")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  test("a download newer than this app stays ready to apply", async () => {
    const { state, install } = await harness({ state: (app) => pendingOf(app, BUILD + 100) });
    expect(state().pending).toMatchObject({ bundle: `${BUILD + 100}-aaaaaaaa` });
    expect(readdirSync(install).sort()).toEqual(["Renamed App", `Renamed App.update-${BUILD + 100}-aaaaaaaa`]);
  });
});

interface ReleaseOptions {
  /** The release's app carries a server. */
  carries?: boolean;
  /** What the manifest says about it; absent in a manifest published before it said. */
  server?: boolean;
  sequence?: number;
  bundle?: string;
  build?: number;
  /** Holds the archive's answer until this resolves. */
  archiveGate?: Promise<unknown>;
  /** The release is a macOS app, "Sample.app". */
  mac?: boolean;
  /** Protocol v2: the envelope `<os>-<arch>/main/app.json` signed by `signer`, and no v1 pair. */
  signer?: KeyObject;
  target?: string;
  revokeKeys?: string[];
  resetSequence?: boolean;
  /** An envelope other than the one `signer` seals. */
  envelope?: (manifest: Uint8Array) => { manifest: string; keyId: string; signature: string };
}

const rawKey = (key: KeyObject) =>
  createPublicKey(key).export({ format: "der", type: "spki" }).subarray(12).toString("base64");
const keyIdOf = (raw: string) =>
  createHash("sha256").update(Buffer.from(raw, "base64")).digest().subarray(0, 8).toString("hex");
const newKey = () => generateKeyPairSync("ed25519").privateKey;

/** A macOS app as a release carries it: its executable, and the Info.plist naming the app. */
const writeMacApp = (dir: string) => {
  mkdirSync(join(dir, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(dir, "Contents", "Resources"), { recursive: true });
  writeFileSync(join(dir, "Contents", "MacOS", EXE), "");
  writeFileSync(
    join(dir, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${APP_ID}</string></dict></plist>
`,
  );
};

/**
 * Serves one signed release of the app, built as "Sample" (the tar's top folder is the build's app name); `publish`
 * replaces it with another.
 */
function serveRelease(root: string, options: ReleaseOptions = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  let files = releaseFiles(root, options, privateKey);
  let archiveRequests = 0;
  let requests = 0;
  const host = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      requests++;
      const path = new URL(request.url).pathname;
      const body = files[path];
      if (path.endsWith(".tar.gz")) {
        archiveRequests++;
        await options.archiveGate;
      }
      return body === undefined ? new Response("", { status: 404 }) : new Response(body);
    },
  });
  return {
    url: `http://127.0.0.1:${host.port}`,
    publicKey: publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64"),
    archiveRequests: () => archiveRequests,
    requests: () => requests,
    publish: (next: ReleaseOptions) => {
      files = releaseFiles(root, next, privateKey);
    },
    stop: () => host.stop(true),
  };
}

function releaseFiles(
  root: string,
  {
    carries = false,
    server,
    sequence = 2000,
    bundle = "2000-abcdef12",
    build = 1999,
    mac = false,
    signer,
    target,
    revokeKeys,
    resetSequence,
    envelope,
  }: ReleaseOptions,
  privateKey: KeyObject,
): Record<string, Blob> {
  const built = join(root, "built");
  const name = mac ? "Sample.app" : "Sample";
  if (mac) writeMacApp(join(built, name));
  else writeApp(join(built, name), "new", { server: carries });
  const tarPath = join(root, "release.tar");
  const packed = Bun.spawnSync([process.platform === "win32" ? "tar.exe" : "tar", "-cf", tarPath, "-C", built, name]);
  if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
  const tar = readFileSync(tarPath);
  const gz = Bun.gzipSync(tar);
  const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  const v2 = !!(signer || envelope);
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      schema: v2 ? 2 : 1,
      kind: "app",
      app: APP_ID,
      platform: "linux",
      channel: "main",
      sequence,
      bundle,
      version: "2.0.0",
      build,
      arch: process.arch,
      archive: { sha256: hash(tar), url: "app/release.tar.gz", size: gz.length, gzSha256: hash(gz) },
      ...(server === undefined ? {} : { server }),
      ...(target === undefined ? {} : { target }),
      ...(revokeKeys ? { revokeKeys } : {}),
      ...(resetSequence === undefined ? {} : { resetSequence }),
    }),
  );
  const base = `/linux-${process.arch}`;
  const sealed = (key: KeyObject) => ({
    manifest: Buffer.from(manifest).toString("base64"),
    keyId: keyIdOf(rawKey(key)),
    signature: sign(null, manifest, key).toString("base64"),
  });
  const signed = v2
    ? {
        [`${base}/main/app.json`]: new Blob([
          JSON.stringify(envelope ? envelope(manifest) : sealed(signer as KeyObject)),
        ]),
      }
    : {
        [`${base}/main.json`]: new Blob([manifest]),
        [`${base}/main.json.sig`]: new Blob([sign(null, manifest, privateKey).toString("base64")]),
      };
  return { ...signed, [`${base}/app/release.tar.gz`]: new Blob([gz]) };
}

describe("desktop updates: download and apply", () => {
  test("an app installed under another name than the build's takes the release under its own name", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    const release = serveRelease(root);
    try {
      const { call, state, relaunches, quits, app, install } = await harness({
        url: release.url,
        publicKey: release.publicKey,
      });
      expect(await call("check")).toMatchObject({ ok: true, result: { available: true, bundle: "2000-abcdef12" } });
      expect(await call("download")).toMatchObject({ ok: true, result: { bundle: "2000-abcdef12" } });
      expect(state().pending).toMatchObject({ staged: join(`${app}.update-2000-abcdef12`, "Sample") });
      expect(await call("apply")).toMatchObject({ ok: true });
      await until(() => quits.length > 0);
      expect(relaunches).toEqual([{ exe: join(app, EXE), moves: [] }]);
      expect(markerOf(app)).toBe("new");
      expect(markerOf(`${app}.previous`)).toBe("installed");
      expect(readdirSync(install).sort()).toEqual(["Renamed App", "Renamed App.previous"]);
      expect(state().trial).toMatchObject({ bundle: "2000-abcdef12", build: 1999 });
    } finally {
      release.stop();
    }
  });

  for (const carries of [true, false])
    test(`an app that carries ${carries ? "a" : "no"} server refuses before downloading a release whose manifest says it carries ${carries ? "none" : "one"}`, async () => {
      const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
      roots.push(root);
      const release = serveRelease(root, { carries: !carries, server: !carries });
      try {
        const { call, state, install } = await harness({ url: release.url, publicKey: release.publicKey, carries });
        expect(await call("check")).toMatchObject({ ok: true, result: { available: false } });
        const refused = await call("download");
        expect(refused).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
        expect(refused.error?.message).toContain(carries ? "carries no server" : "carries a server");
        expect(release.archiveRequests()).toBe(0);
        expect(state().failed ?? []).toEqual([]);
        expect(readdirSync(install)).toEqual(["Renamed App"]);
      } finally {
        release.stop();
      }
    });

  for (const carries of [true, false])
    test(`an app that carries ${carries ? "a" : "no"} server refuses a release that carries ${carries ? "none" : "one"}, once`, async () => {
      const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
      roots.push(root);
      const release = serveRelease(root, { carries: !carries });
      try {
        const { call, state, install } = await harness({ url: release.url, publicKey: release.publicKey, carries });
        const refused = await call("download");
        expect(refused).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
        expect(refused.error?.message).toContain(carries ? "carries no server" : "carries a server");
        expect(state().failed).toEqual(["2000-abcdef12"]);
        expect(state().pending).toBeUndefined();
        expect(readdirSync(install)).toEqual(["Renamed App"]);
        expect(await call("check")).toMatchObject({ ok: true, result: { available: false } });
      } finally {
        release.stop();
      }
    });

  test("a trial confirmed while a download ran stays confirmed", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    let open = () => {};
    const release = serveRelease(root, { archiveGate: new Promise<void>((resolve) => (open = resolve)) });
    try {
      const { call, state, stateDir } = await harness({ url: release.url, publicKey: release.publicKey });
      const downloaded = call("download");
      await until(() => release.archiveRequests() > 0);
      const confirmed = {
        bundle: "1500-bbbbbbbb",
        sequence: 1500,
        version: "1.5.0",
        tar: "1".repeat(64),
        build: BUILD,
      };
      writeFileSync(join(stateDir, "state.json"), JSON.stringify({ current: confirmed, failed: [] }));
      open();
      expect(await downloaded).toMatchObject({ ok: true });
      expect(state()).toMatchObject({ current: confirmed, pending: { bundle: "2000-abcdef12" } });
    } finally {
      release.stop();
    }
  });

  test("an app installed where this user cannot write is told so before anything is downloaded", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return;
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    const release = serveRelease(root);
    const { call, install } = await harness({ url: release.url, publicKey: release.publicKey });
    chmodSync(install, 0o555);
    try {
      const refused = await call("download");
      expect(refused).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
      expect(release.archiveRequests()).toBe(0);
    } finally {
      chmodSync(install, 0o755);
      release.stop();
    }
  });

  test("apply refuses a download whose server presence is not this app's", async () => {
    const { call, state, install } = await harness({
      carries: true,
      state: (app) => pendingOf(app, BUILD + 100),
    });
    expect(await call("apply")).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(state()).toMatchObject({ failed: [`${BUILD + 100}-aaaaaaaa`] });
    expect(state().pending).toBeUndefined();
    expect(readdirSync(install)).toEqual(["Renamed App"]);
  });

  test("Windows hands the helper the moves with a recovery for a swap cut short", async () => {
    const { call, relaunches, state, app } = await harness({
      platform: "win32",
      state: (app) => pendingOf(app, BUILD + 100),
    });
    expect(await call("apply")).toMatchObject({ ok: true });
    expect(relaunches[0]?.moves).toEqual([
      [app, `${app}.previous`],
      [join(`${app}.update-${BUILD + 100}-aaaaaaaa`, "Sample"), app],
    ]);
    expect(relaunches[0]?.recover?.name).toBe(`akan-native-update ${APP_ID}`);
    expect(state()).toMatchObject({
      trial: { from: BUILD, staged: join(`${app}.update-${BUILD + 100}-aaaaaaaa`, "Sample") },
    });
  });
});

describe("desktop updates: by itself (updates.automatic)", () => {
  const releaseRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    return root;
  };

  test("downloads a release soon after the start and moves it into place as the app quits; the next launch tries it", async () => {
    const release = serveRelease(releaseRoot());
    try {
      const { root, state, quit, quits, relaunches, app, install, stateDir } = await harness({
        url: release.url,
        publicKey: release.publicKey,
        automatic: true,
      });
      await until(() => existsSync(join(stateDir, "state.json")) && state().pending !== undefined);
      expect(state().pending).toMatchObject({ bundle: "2000-abcdef12" });
      expect(markerOf(app)).toBe("installed");
      await quit();
      expect(quits).toEqual([0]);
      expect(relaunches).toEqual([]);
      expect(markerOf(app)).toBe("new");
      expect(markerOf(`${app}.previous`)).toBe("installed");
      expect(readdirSync(install).sort()).toEqual(["Renamed App", "Renamed App.previous"]);
      expect(state()).toMatchObject({ trial: { bundle: "2000-abcdef12", build: 1999, attempts: 0 } });
      expect(state().pending).toBeUndefined();
      expect(existsSync(join(stateDir, "automatic.json"))).toBe(false);
      const next = await harness({ root, url: release.url, publicKey: release.publicKey, embeddedSequence: 1999 });
      expect(await next.call("getState")).toMatchObject({ result: { trial: true, bundle: "2000-abcdef12" } });
      expect(await next.call("notifyReady")).toMatchObject({ ok: true });
      expect(next.state()).toMatchObject({ current: { bundle: "2000-abcdef12" } });
      expect(existsSync(`${app}.previous`)).toBe(false);
    } finally {
      release.stop();
    }
  });

  test("a page's download while the background one runs is answered with it", async () => {
    let open = () => {};
    const release = serveRelease(releaseRoot(), { archiveGate: new Promise<void>((resolve) => (open = resolve)) });
    try {
      const { call, quit } = await harness({ url: release.url, publicKey: release.publicKey, automatic: true });
      await until(() => release.archiveRequests() > 0);
      const page = call("download");
      open();
      expect(await page).toMatchObject({ ok: true, result: { bundle: "2000-abcdef12" } });
      expect(release.archiveRequests()).toBe(1);
      await quit();
    } finally {
      release.stop();
    }
  });

  test("looks for nothing while a release is on trial, nor installs over it at quit; once confirmed it does", async () => {
    const release = serveRelease(releaseRoot(), { sequence: 3000, bundle: "3000-abcdef12", build: 2999 });
    try {
      const { call, quit, state, app } = await harness({
        url: release.url,
        publicKey: release.publicKey,
        automatic: true,
        readyTimeout: 5000,
        state: onTrial,
      });
      await Bun.sleep(100);
      expect(release.requests()).toBe(0);
      expect(await call("notifyReady")).toMatchObject({ ok: true });
      await until(() => state().pending !== undefined);
      expect(state()).toMatchObject({ current: { bundle: "2000-aaaaaaaa" }, pending: { bundle: "3000-abcdef12" } });
      await quit();
      expect(markerOf(app)).toBe("new");
      expect(markerOf(`${app}.previous`)).toBe("installed");
    } finally {
      release.stop();
    }
    const { quit, state, app } = await harness({
      automatic: true,
      autoCheckDelay: 60_000,
      readyTimeout: 5000,
      state: (app) => ({ ...onTrial(app), ...pendingOf(app, 3000), failed: [] }),
    });
    await quit();
    expect(markerOf(app)).toBe("installed");
    expect(markerOf(`${app}.previous`)).toBe("previous");
    expect(state()).toMatchObject({ trial: { bundle: "2000-aaaaaaaa" }, pending: { bundle: "3000-aaaaaaaa" } });
  });

  for (const options of [{ automatic: false }, { automatic: true, dev: true }])
    test(`${options.dev ? "a debug build" : "updates.automatic false"} looks for nothing and installs nothing at quit`, async () => {
      const release = serveRelease(releaseRoot());
      try {
        const { quit, state, app } = await harness({
          url: release.url,
          publicKey: release.publicKey,
          ...options,
          state: (app) => pendingOf(app, 3000),
        });
        await Bun.sleep(100);
        await quit();
        expect(release.requests()).toBe(0);
        expect(markerOf(app)).toBe("installed");
        expect(state().pending).toMatchObject({ bundle: "3000-aaaaaaaa" });
      } finally {
        release.stop();
      }
    });

  test("another running copy of the app does the updating: this one neither downloads nor installs", async () => {
    const release = serveRelease(releaseRoot());
    const owner = { pid: process.ppid, boot: Math.round(Date.now() / 1000 - uptime()) };
    try {
      const { quit, state, app, stateDir } = await harness({
        url: release.url,
        publicKey: release.publicKey,
        automatic: true,
        state: (app) => {
          const dir = join(dirname(dirname(app)), "local", "akan-native-updates");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, "automatic.json"), JSON.stringify(owner));
          return pendingOf(app, 3000);
        },
      });
      await Bun.sleep(100);
      await quit();
      expect(release.requests()).toBe(0);
      expect(markerOf(app)).toBe("installed");
      expect(state().pending).toMatchObject({ bundle: "3000-aaaaaaaa" });
      expect(JSON.parse(readFileSync(join(stateDir, "automatic.json"), "utf8"))).toEqual(owner);
    } finally {
      release.stop();
    }
  });

  test("Windows hands the helper the moves at quit and has it start nothing", async () => {
    const { quit, relaunches, state, app } = await harness({
      platform: "win32",
      automatic: true,
      autoCheckDelay: 60_000,
      state: (app) => pendingOf(app, BUILD + 100),
    });
    await quit();
    const staged = join(`${app}.update-${BUILD + 100}-aaaaaaaa`, "Sample");
    expect(relaunches).toMatchObject([
      {
        moves: [
          [app, `${app}.previous`],
          [staged, app],
        ],
        recover: { name: `akan-native-update ${APP_ID}` },
        start: false,
      },
    ]);
    expect(state()).toMatchObject({ trial: { from: BUILD, staged } });
  });

  test("a Windows helper that cannot take the moves leaves the download as it was, for apply() and quit alike", async () => {
    const { call, quit, state } = await harness({
      platform: "win32",
      automatic: true,
      autoCheckDelay: 60_000,
      relaunchRefuses: true,
      state: (app) => pendingOf(app, BUILD + 100),
    });
    expect(await call("apply")).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(state().trial).toBeUndefined();
    await quit();
    expect(state().trial).toBeUndefined();
    expect(state().pending).toMatchObject({ bundle: `${BUILD + 100}-aaaaaaaa` });
  });
});

describe("desktop updates: the signer of a release", () => {
  interface PowerShellRun {
    cmd: string[];
    env: Record<string, string>;
  }
  /** PowerShell running the plugin's script: what it printed and its exit code. */
  const powershell = (answer: { code: number; output: string }, asked: PowerShellRun[] = []) =>
    (async (cmd, env) => {
      if (!cmd.includes("-EncodedCommand") || !env) return { code: 1, output: "" };
      asked.push({ cmd, env });
      return answer;
    }) satisfies DesktopUpdatesOptions["signatureTool"];
  const verdict = (word: string) => ({ code: 0, output: `akan-signer: ${word}\r\n` });

  /** The head of an x64 or arm64 executable (PE32+), with an Authenticode signature in its certificate table or not. */
  const peImage = (signed: boolean) => {
    const image = Buffer.alloc(1024);
    const optional = 0x80 + 24;
    image.write("MZ");
    image.writeUInt32LE(0x80, 0x3c);
    image.write("PE\0\0", 0x80);
    image.writeUInt16LE(0x20b, optional);
    image.writeUInt32LE(16, optional + 108);
    if (signed) {
      image.writeUInt32LE(0x400, optional + 112 + 32);
      image.writeUInt32LE(0x2000, optional + 112 + 36);
    }
    return image;
  };

  const stops: (() => void)[] = [];
  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
  });
  const download = async (
    signatureTool: DesktopUpdatesOptions["signatureTool"],
    options: ReleaseOptions = {},
    installedExe?: Uint8Array,
  ) => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    const release = serveRelease(root, options);
    stops.push(release.stop);
    const platform = options.mac ? "darwin" : "win32";
    const updates = await harness({ url: release.url, publicKey: release.publicKey, platform, signatureTool });
    if (installedExe) writeFileSync(join(updates.app, EXE), installedExe);
    return { ...updates, result: await updates.call("download") };
  };

  test("a Windows app refuses a release PowerShell finds signed by another signer, and keeps it refused", async () => {
    const asked: PowerShellRun[] = [];
    const { result, state, call, install, app } = await download(powershell(verdict("other"), asked));
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(result.error?.message).toContain("not Authenticode-signed by the signer of this app");
    expect(asked[0]?.env).toMatchObject({
      AKAN_NATIVE_INSTALLED_EXE: join(app, EXE),
      AKAN_NATIVE_RELEASE_EXE: join(`${app}.update-2000-abcdef12`, "Sample", EXE),
    });
    expect(state().failed).toEqual(["2000-abcdef12"]);
    expect(state().pending).toBeUndefined();
    expect(readdirSync(install)).toEqual(["Renamed App"]);
    expect(await call("check")).toMatchObject({ ok: true, result: { available: false, bundle: "2000-abcdef12" } });
  });

  for (const word of ["same", "unsigned"])
    test(`a Windows app takes a release on PowerShell's verdict "${word}"`, async () => {
      const { result, state } = await download(powershell(verdict(word)));
      expect(result).toMatchObject({ ok: true, result: { bundle: "2000-abcdef12" } });
      expect(state().pending).toMatchObject({ bundle: "2000-abcdef12" });
    });

  test("PowerShell gets a script Constrained Language Mode runs: no .NET type, method call or base64", async () => {
    const asked: PowerShellRun[] = [];
    await download(powershell(verdict("same"), asked));
    const script = Buffer.from(asked[0]?.cmd.at(-1) ?? "", "base64").toString("utf16le");
    expect(script).toContain("Get-AuthenticodeSignature");
    expect(script).not.toMatch(/\[[\w.]+\]|::|\.\w+\(|Add-Type|New-Object/);
  });

  for (const [what, answer] of [
    ["is blocked by policy", { code: -1, output: "EPERM: operation not permitted, posix_spawn 'powershell.exe'" }],
    [
      "runs in Constrained Language Mode",
      {
        code: 1,
        output: "Cannot invoke method. Method invocation is supported only on core types in this language mode.\r\n",
      },
    ],
    ["prints a verdict but fails", { code: 1, output: "akan-signer: same\r\n" }],
  ] as const)
    test(`when PowerShell ${what}, a signed Windows app refuses the release and an unsigned one takes it`, async () => {
      for (const [installedExe, taken] of [
        [peImage(true), false],
        [new Uint8Array(), false],
        [peImage(false), true],
      ] as const) {
        const { result, state } = await download(powershell(answer), {}, installedExe);
        expect(result).toMatchObject(taken ? { ok: true } : { ok: false, error: { code: "NOT_ALLOWED" } });
        if (!taken) expect(result.error?.message).toContain("PowerShell could not check");
        expect(state().failed).toEqual(taken ? [] : ["2000-abcdef12"]);
      }
    });

  /** codesign as it answers for the installed app ("Renamed App") and the release, each signed by `teams` or ad hoc. */
  const codesign = (teams: { own: string | null; release: string | null }, asked: string[][] = []) =>
    (async (cmd) => {
      asked.push(cmd);
      const target = cmd.at(-1) ?? "";
      const team = target.endsWith("Renamed App") ? teams.own : teams.release;
      if (cmd.includes("--display"))
        return { code: 0, output: `Executable=${target}\nTeamIdentifier=${team ?? "not set"}\n` };
      const required = /subject\.OU\] = "(\w+)"/.exec(cmd.find((arg) => arg.startsWith("-R=")) ?? "")?.[1];
      return required === undefined || required === team
        ? { code: 0, output: "" }
        : { code: 3, output: "test-requirement: code failed to satisfy specified code requirement(s)" };
    }) satisfies DesktopUpdatesOptions["signatureTool"];

  //? The bundle id of a macOS release is read with /usr/bin/plutil, which only a Mac has.
  test("a macOS app signed by a team refuses a release signed ad hoc", async () => {
    if (process.platform !== "darwin") return;
    const asked: string[][] = [];
    const { result, state } = await download(codesign({ own: "ABCDE12345", release: null }, asked), { mac: true });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(result.error?.message).toContain("team ABCDE12345");
    expect(asked.find((cmd) => cmd.some((arg) => arg.startsWith("-R=")))).toEqual([
      "/usr/bin/codesign",
      "--verify",
      '-R=anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
      expect.stringMatching(/Sample\.app$/),
    ]);
    expect(state().failed).toEqual(["2000-abcdef12"]);
    expect(state().pending).toBeUndefined();
  });

  test("a macOS app takes a release of its own team, and an app signed ad hoc takes any", async () => {
    if (process.platform !== "darwin") return;
    for (const teams of [
      { own: "ABCDE12345", release: "ABCDE12345" },
      { own: null, release: null },
    ]) {
      const { result, state } = await download(codesign(teams), { mac: true });
      expect(result).toMatchObject({ ok: true, result: { bundle: "2000-abcdef12" } });
      expect(state().pending).toMatchObject({ bundle: "2000-abcdef12" });
    }
  });

  test("a macOS download holds off App Nap until it ends, taken or refused, and goes on without the hold", async () => {
    if (process.platform !== "darwin") return;
    for (const [teams, taken, holds] of [
      [{ own: null, release: null }, true, true],
      [{ own: "ABCDE12345", release: null }, false, true],
      [{ own: null, release: null }, true, false],
    ] as const) {
      const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
      roots.push(root);
      const release = serveRelease(root, { mac: true });
      stops.push(release.stop);
      const ops: { op: string; args?: Record<string, unknown>; archives: number }[] = [];
      const { call } = await harness({
        url: release.url,
        publicKey: release.publicKey,
        platform: "darwin",
        signatureTool: codesign(teams),
        shell: async (op, args) => {
          ops.push({ op, args, archives: release.archiveRequests() });
          if (!holds) throw new Error(`${op} is not available`);
          return op === "activity.begin" ? { id: 7 } : null;
        },
      });
      const result = await call("download");
      expect(result).toMatchObject(taken ? { ok: true } : { ok: false, error: { code: "NOT_ALLOWED" } });
      expect(ops).toEqual([
        { op: "activity.begin", args: expect.objectContaining({ reason: "Downloading an update" }), archives: 0 },
        ...(holds ? [{ op: "activity.end", args: expect.objectContaining({ id: 7 }), archives: 1 }] : []),
      ]);
    }
  });

  test("a Windows or Linux download asks the shell for nothing", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-release-"));
    roots.push(root);
    const release = serveRelease(root);
    stops.push(release.stop);
    const ops: string[] = [];
    const { call } = await harness({
      url: release.url,
      publicKey: release.publicKey,
      shell: async (op) => void ops.push(op),
    });
    expect(await call("download")).toMatchObject({ ok: true });
    expect(ops).toEqual([]);
  });
});

describe("desktop updates: protocol v2", () => {
  const feed = (options: ReleaseOptions) => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-updates-v2-"));
    roots.push(root);
    return serveRelease(root, options);
  };
  const refused = (message: string) => ({
    ok: false,
    error: { code: "INTERNAL", message: expect.stringContaining(message) },
  });

  test("a release any key of the ring signs is taken with its signer, and the v1 pair is never read", async () => {
    const [online, spare] = [newKey(), newKey()];
    const release = feed({ signer: spare });
    try {
      const { call, state } = await harness({ url: release.url, publicKeys: [rawKey(online), rawKey(spare)] });
      expect(await call("check")).toMatchObject({ ok: true, result: { available: true, bundle: "2000-abcdef12" } });
      expect(await call("download")).toMatchObject({ ok: true, result: { bundle: "2000-abcdef12" } });
      expect(state().pending).toMatchObject({ bundle: "2000-abcdef12", keyId: keyIdOf(rawKey(spare)) });
      release.publish({});
      expect(await call("check")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    } finally {
      release.stop();
    }
  });

  test("a release of another target, or of none, is refused", async () => {
    const key = newKey();
    const release = feed({ signer: key, target: "pilot" });
    try {
      const pilot = await harness({ url: release.url, publicKeys: [rawKey(key)], target: "pilot" });
      expect(await pilot.call("check")).toMatchObject({ ok: true, result: { available: true } });
      const store = await harness({ url: release.url, publicKeys: [rawKey(key)], target: "store" });
      expect(await store.call("check")).toMatchObject(refused("another app, platform, CPU, channel or target"));
      const untargeted = await harness({ url: release.url, publicKeys: [rawKey(key)] });
      expect(await untargeted.call("check")).toMatchObject(refused("target"));
      release.publish({ signer: key });
      expect(await pilot.call("check")).toMatchObject(refused("target"));
    } finally {
      release.stop();
    }
  });

  test("a small-order key in the ring trusts nothing, though node:crypto verifies a forgery under it", async () => {
    const identity = Buffer.alloc(32);
    identity[0] = 1;
    const forged = Buffer.concat([identity, Buffer.alloc(32)]);
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), identity]);
    const anyBytes = new TextEncoder().encode("any manifest");
    expect(verify(null, anyBytes, createPublicKey({ key: spki, format: "der", type: "spki" }), forged)).toBe(true);
    const release = feed({
      envelope: (manifest) => ({
        manifest: Buffer.from(manifest).toString("base64"),
        keyId: keyIdOf(identity.toString("base64")),
        signature: forged.toString("base64"),
      }),
    });
    try {
      const { call } = await harness({ url: release.url, publicKeys: [identity.toString("base64"), rawKey(newKey())] });
      expect(await call("check")).toMatchObject(refused("not a key of updates.publicKeys"));
    } finally {
      release.stop();
    }
  });

  test("a stale release's revocation binds for good, and the revoked key's releases are refused from then on", async () => {
    const [online, spare] = [newKey(), newKey()];
    const ring = [rawKey(online), rawKey(spare)];
    const revoked = keyIdOf(rawKey(online));
    const release = feed({ signer: spare, sequence: BUILD - 100, bundle: "900-aaaaaaaa", revokeKeys: [revoked] });
    try {
      const { call, state } = await harness({ url: release.url, publicKeys: ring });
      expect(await call("check")).toMatchObject({ ok: true, result: { available: false } });
      expect(state().revokedKeys).toEqual([revoked]);
      release.publish({ signer: online, sequence: 3000, bundle: "3000-aaaaaaaa" });
      expect(await call("check")).toMatchObject(refused(`signed by ${revoked}, a key a release revoked`));
      expect(await call("reset")).toMatchObject({ ok: true });
      expect(state().revokedKeys).toEqual([revoked]);
    } finally {
      release.stop();
    }
  });

  test("a key may revoke only keys listed before it", async () => {
    const [online, spare] = [newKey(), newKey()];
    const release = feed({ signer: online, revokeKeys: [keyIdOf(rawKey(spare))] });
    try {
      const { call, state } = await harness({ url: release.url, publicKeys: [rawKey(online), rawKey(spare)] });
      expect(await call("check")).toMatchObject(refused(`key ${keyIdOf(rawKey(online))} may not revoke`));
      expect(state().revokedKeys).toBeUndefined();
    } finally {
      release.stop();
    }
  });

  test("a running release a revoked key signed sets no bar, and a download it signed goes with the key", async () => {
    const [online, spare] = [newKey(), newKey()];
    const leaked = keyIdOf(rawKey(online));
    const running = { bundle: "9000-bbbbbbbb", sequence: 9000, version: "9", tar: "0".repeat(64), build: BUILD };
    const release = feed({ signer: online, sequence: 9500, bundle: "9500-cccccccc" });
    try {
      const { call, state, app } = await harness({
        url: release.url,
        publicKeys: [rawKey(online), rawKey(spare)],
        state: () => ({ failed: [], current: { ...running, keyId: leaked } }),
      });
      expect(await call("download")).toMatchObject({ ok: true, result: { bundle: "9500-cccccccc" } });
      expect(state().pending).toMatchObject({ keyId: leaked });
      release.publish({ signer: spare, revokeKeys: [leaked], resetSequence: true });
      expect(await call("check")).toMatchObject({ ok: true, result: { available: true, sequence: 2000 } });
      expect(state().pending).toBeUndefined();
      expect(existsSync(`${app}.update-9500-cccccccc`)).toBe(false);
      expect(await call("download")).toMatchObject({ ok: true, result: { bundle: "2000-abcdef12" } });
      expect(await call("apply")).toMatchObject({ ok: true });
      expect(state().trial).toMatchObject({ bundle: "2000-abcdef12", keyId: keyIdOf(rawKey(spare)) });
    } finally {
      release.stop();
    }
  });
});
