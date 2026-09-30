// The desktop updates plugin on an app folder in a temporary "install", with a scripted relaunch and a local
// release server; the Linux layout on every OS (macOS would check a code signature).
import { afterEach, describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
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
import { join } from "node:path";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import type { DesktopServerStatus, NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import { createDesktopUpdates, type UpdatesConfig } from "../src/desktop.ts";

const APP_ID = "dev.test.updates";
const EXE = "demo";
const BUILD = 1000;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const writeApp = (dir: string, marker: string) => {
  mkdirSync(join(dir, "resources"), { recursive: true });
  writeFileSync(join(dir, "resources", "boot.json"), JSON.stringify({ app: { id: APP_ID }, marker }));
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
  url?: string;
  publicKey?: string;
}

async function harness(options: HarnessOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), "akan-native-updates-"));
  roots.push(root);
  const install = join(root, "install");
  const app = join(install, "Renamed App");
  writeApp(app, "installed");
  const stateDir = join(root, "local", "akan-native-updates");
  if (options.state) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "state.json"), JSON.stringify(options.state(app)));
  }
  const config: UpdatesConfig = {
    app: APP_ID,
    platform: "linux",
    nativeApi: null,
    embeddedSequence: BUILD,
    url: options.url ?? "http://127.0.0.1:1",
    publicKey: options.publicKey ?? "",
    channel: "main",
    readyTimeout: options.readyTimeout ?? 50,
  };
  const relaunches: { exe: string; moves: [string, string][] }[] = [];
  const plugin = createDesktopUpdates({
    platform: "linux",
    app,
    config,
    exeName: EXE,
    serverBootAllowance: options.serverBootAllowance ?? 150,
    relaunch: async (exe, moves) => {
      for (const [from, to] of moves) renameSync(from, to);
      relaunches.push({ exe, moves });
    },
  });
  const listeners = new Map<string, Set<(event: NativeEvent) => void>>();
  const quits: number[] = [];
  const dispatcher = createDispatcher([plugin], {
    app: { id: APP_ID, name: "Test", version: "1.0.0" },
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
  return { root, install, app, call, fire, state, relaunches, quits };
}

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
  test("a server that neither answers ready nor exits still lets the release roll back", async () => {
    const server = { ready: new Promise<boolean>(() => {}) };
    const { fire, call, state, relaunches, quits, app } = await harness({
      server,
      readyTimeout: 50,
      serverBootAllowance: 150,
      state: onTrial,
    });
    fire("pageLoad", { event: "finished", window: 1 });
    const answer = await Promise.race([call("notifyReady"), Bun.sleep(2000).then(() => "hung" as const)]);
    expect(answer).toMatchObject({ ok: true });
    await until(() => quits.length > 0);
    expect(quits).toEqual([0]);
    expect(relaunches[0]?.moves).toEqual([
      [app, `${app}.failed-2000-aaaaaaaa`],
      [`${app}.previous`, app],
    ]);
    expect(markerOf(app)).toBe("previous");
    expect(state()).toMatchObject({ failed: ["2000-aaaaaaaa"], rolledBack: "2000-aaaaaaaa" });
    expect(state().current).toBeUndefined();
  });

  test("a server slower than readyTimeout but within its allowance confirms the release", async () => {
    let answer = (_ready: boolean) => {};
    const server = { ready: new Promise<boolean>((resolve) => (answer = resolve)) };
    const { fire, call, state, quits, app } = await harness({
      server,
      readyTimeout: 50,
      serverBootAllowance: 5000,
      state: onTrial,
    });
    fire("pageLoad", { event: "finished", window: 1 });
    const confirmed = call("notifyReady");
    await Bun.sleep(150);
    answer(true);
    expect(await confirmed).toMatchObject({ ok: true });
    await Bun.sleep(150);
    expect(quits).toEqual([]);
    expect(state()).toMatchObject({ current: { bundle: "2000-aaaaaaaa" }, failed: [] });
    expect(state().trial).toBeUndefined();
    expect(existsSync(`${app}.previous`)).toBe(false);
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
  test("a swap the Windows helper put back is a failed release, not one to download and apply again", async () => {
    const { state } = await harness({
      state: (app) => ({ trial: { ...onTrial(app).trial, build: 2000, from: BUILD }, failed: [] }),
    });
    expect(state()).toMatchObject({ failed: ["2000-aaaaaaaa"] });
    expect(state().trial).toBeUndefined();
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

/** Serves one signed release of the app, built as "Sample" (the tar's top folder is the build's app name). */
function serveRelease(root: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const built = join(root, "built");
  writeApp(join(built, "Sample"), "new");
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
      sequence: 2000,
      bundle: "2000-abcdef12",
      version: "2.0.0",
      build: 1999,
      arch: process.arch,
      archive: { sha256: hash(tar), url: "app/release.tar.gz", size: gz.length, gzSha256: hash(gz) },
    }),
  );
  const base = `/linux-${process.arch}`;
  const files: Record<string, Blob> = {
    [`${base}/main.json`]: new Blob([manifest]),
    [`${base}/main.json.sig`]: new Blob([sign(null, manifest, privateKey).toString("base64")]),
    [`${base}/app/release.tar.gz`]: new Blob([gz]),
  };
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const body = files[new URL(request.url).pathname];
      return body === undefined ? new Response("", { status: 404 }) : new Response(body);
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    publicKey: publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64"),
    stop: () => server.stop(true),
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
});
