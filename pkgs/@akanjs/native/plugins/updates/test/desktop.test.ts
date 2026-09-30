// The desktop updates plugin on an app folder in a temporary "install", with a scripted relaunch and a local
// release server; the Linux layout on every OS (macOS would check a code signature).
import { afterEach, describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
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
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import type { DesktopServerStatus, NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import { createServerStatus } from "../../../packages/desktop/src/server.ts";
import { createDesktopUpdates, MAX_STRIKES, type UpdatesConfig } from "../src/desktop.ts";

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
  /** The installed app carries a server (resources/server.json). */
  carries?: boolean;
  platform?: NodeJS.Platform;
  embeddedSequence?: number;
  dev?: boolean;
  /** The folder the app is installed in, when it is not a fresh temporary one. */
  root?: string;
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
    publicKey: options.publicKey ?? "",
    channel: "main",
    readyTimeout: options.readyTimeout ?? 50,
  };
  const relaunches: { exe: string; moves: [string, string][]; recover?: { script: string; name: string } }[] = [];
  const plugin = createDesktopUpdates({
    platform: options.platform ?? "linux",
    app,
    config,
    exeName: EXE,
    serverBootAllowance: options.serverBootAllowance ?? 150,
    serverSettle: options.serverSettle ?? 20,
    relaunch: async (exe, moves, recover) => {
      if (options.platform !== "win32") for (const [from, to] of moves) renameSync(from, to);
      relaunches.push({ exe, moves, ...(recover ? { recover } : {}) });
    },
  });
  const listeners = new Map<string, Set<(event: NativeEvent) => void>>();
  const quits: number[] = [];
  const dispatcher = createDispatcher([plugin], {
    app: { id: APP_ID, name: "Test", version: "1.0.0" },
    dev: options.dev,
    appDataDir: join(root, "roaming"),
    appLocalDataDir: join(root, "local"),
    server: options.server ?? null,
    emit: () => {},
    registerFile: () => ({ url: "", mime: "", size: 0 }),
    onNativeEvent: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      listeners.set(type, set.add(listener));
      return () => set.delete(listener);
    },
    quit: (code) => void quits.push(code),
  });
  await dispatcher.launched;
  const call = async (method: string) =>
    (await dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: "updates", method }), 1)) as {
      ok: boolean;
      result?: unknown;
      error?: { code: string; message: string };
    };
  const fire = (type: string, event: Record<string, unknown>) => {
    for (const listener of listeners.get(type) ?? []) listener({ type, ...event });
  };
  const state = () => JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8")) as Record<string, unknown>;
  return { root, install, app, stateDir, call, fire, state, relaunches, quits };
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
}

/** Serves one signed release of the app, built as "Sample" (the tar's top folder is the build's app name). */
function serveRelease(
  root: string,
  {
    carries = false,
    server,
    sequence = 2000,
    bundle = "2000-abcdef12",
    build = 1999,
    archiveGate,
  }: ReleaseOptions = {},
) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const built = join(root, "built");
  writeApp(join(built, "Sample"), "new", { server: carries });
  const tarPath = join(root, "release.tar");
  const packed = Bun.spawnSync([
    process.platform === "win32" ? "tar.exe" : "tar",
    "-cf",
    tarPath,
    "-C",
    built,
    "Sample",
  ]);
  if (packed.exitCode !== 0) throw new Error(packed.stderr.toString());
  const tar = readFileSync(tarPath);
  const gz = Bun.gzipSync(tar);
  const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      schema: 1,
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
    }),
  );
  const base = `/linux-${process.arch}`;
  const files: Record<string, Blob> = {
    [`${base}/main.json`]: new Blob([manifest]),
    [`${base}/main.json.sig`]: new Blob([sign(null, manifest, privateKey).toString("base64")]),
    [`${base}/app/release.tar.gz`]: new Blob([gz]),
  };
  let archiveRequests = 0;
  const host = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const body = files[path];
      if (path.endsWith(".tar.gz")) {
        archiveRequests++;
        await archiveGate;
      }
      return body === undefined ? new Response("", { status: 404 }) : new Response(body);
    },
  });
  return {
    url: `http://127.0.0.1:${host.port}`,
    publicKey: publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64"),
    archiveRequests: () => archiveRequests,
    stop: () => host.stop(true),
  };
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
