import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir, networkInterfaces } from "node:os";
import path from "node:path";

//? Builds `minimal` (its target carries the server) on this OS and drives the app it made: AKAN_DESKTOP_E2E=1 turns it on, and
//? AKAN_DESKTOP_E2E_BUILD=0 reuses the last build.
const enabled = process.env.AKAN_DESKTOP_E2E === "1";
const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const nativeDir = path.join(workspaceRoot, "apps/minimal/.akan/native/default/build");
const appId = "com.minimal.dev.app";

class DesktopApp {
  static readonly executable =
    process.platform === "darwin"
      ? path.join(nativeDir, "macos/minimal.app/Contents/MacOS/minimal")
      : process.platform === "win32"
        ? path.join(nativeDir, "windows/minimal/minimal.exe")
        : path.join(nativeDir, "linux/minimal/minimal");
  static readonly serverData =
    process.platform === "darwin"
      ? path.join(homedir(), "Library/Application Support", appId, "server")
      : process.platform === "win32"
        ? path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData/Local"), appId, "server")
        : path.join(process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local/share"), appId, "server");

  //? The shell installs its SIGTERM handler once its window exists, which trails "server ready" by up to a
  //? second or two on a binary macOS has not assessed yet; a signal before that ends it without its quit hooks.
  static readonly windowSettleMs = 3000;
  readonly lines: string[] = [];
  readonly startedAt = Date.now();
  url = "";

  constructor(readonly proc: Bun.Subprocess<"pipe", "pipe", "pipe">) {
    for (const stream of [proc.stdout, proc.stderr]) void this.#collect(stream);
  }

  static start() {
    return new DesktopApp(
      Bun.spawn([DesktopApp.executable], {
        env: {
          ...process.env,
          AKAN_NATIVE_ACTIVATION: "prohibited",
          AKAN_NATIVE_QUIT_ON_STDIN: "1",
          AKAN_NATIVE_PROBE: "1",
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      }),
    );
  }

  static async launch() {
    const app = DesktopApp.start();
    await DesktopApp.until(async () => /server ready on (\S+)/.test(app.lines.join("\n")), 30_000);
    app.url = /server ready on (\S+)/.exec(app.lines.join("\n"))?.[1] ?? "";
    return app;
  }

  static async until(check: () => Promise<boolean>, timeout = 10_000) {
    for (const started = Date.now(); Date.now() - started < timeout; await Bun.sleep(100)) if (await check()) return;
    throw new Error(`timed out after ${timeout} ms`);
  }

  //? A container whose init reaps nothing keeps an ended process as a zombie, which still answers signal 0.
  static alive(pid: number) {
    try {
      process.kill(pid, 0);
    } catch {
      return false;
    }
    if (process.platform !== "linux") return true;
    try {
      return !/^\d+ \(.*\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
    } catch {
      return false;
    }
  }

  static async answers(url: string) {
    try {
      return (await fetch(`${url}/api/benchPing`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      return false;
    }
  }

  //? Windows has no SIGTERM: the shell reads "quit" from stdin (AKAN_NATIVE_QUIT_ON_STDIN) and runs the onQuit hooks.
  async quit() {
    await Bun.sleep(Math.max(0, this.startedAt + DesktopApp.windowSettleMs - Date.now()));
    if (process.platform === "win32") {
      this.proc.stdin.write("quit\n");
      this.proc.stdin.flush();
    } else this.proc.kill("SIGTERM");
    return await this.proc.exited;
  }

  async #collect(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder();
    for await (const chunk of stream) this.lines.push(...decoder.decode(chunk).split(/\r?\n/));
  }
}

const fromApp = { origin: process.platform === "win32" ? "https://app.localhost" : "app://localhost" };
const post = (url: string, body: unknown, origin = fromApp.origin) =>
  fetch(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
const withHost = (url: string, host: string, headers: Record<string, string> = {}) =>
  new Promise<number>((resolve, reject) => {
    const { hostname, port, pathname } = new URL(url);
    request({ hostname, port, path: pathname, headers: { ...headers, host } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    })
      .on("error", reject)
      .end();
  });
const png = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe.skipIf(!enabled)("a desktop app carrying its server (build-desktop minimal)", () => {
  let app: DesktopApp;
  let memoId = "";

  beforeAll(async () => {
    await Bun.$`rm -rf ${DesktopApp.serverData}`.quiet().nothrow();
    if (process.env.AKAN_DESKTOP_E2E_BUILD !== "0") {
      const build = Bun.spawn(["bun", "run", "akan", "build-desktop", "minimal", "--target", "default"], {
        cwd: workspaceRoot,
        stdout: "inherit",
        stderr: "inherit",
      });
      expect(await build.exited).toBe(0);
    }
    app = await DesktopApp.launch();
  }, 900_000);

  afterAll(async () => {
    if (app) await app.quit();
  }, 30_000);

  test("serves the app's origin on loopback: create, list, attach an image, read it back", async () => {
    const created = await post(`${app.url}/api/memo/createMemo`, { data: { name: "from the e2e" } });
    expect(created.status).toBe(200);
    memoId = ((await created.json()) as { id: string }).id;

    const form = new FormData();
    form.append("files", new File([png], "dot.png", { type: "image/png" }));
    form.append("memoId", memoId);
    const attached = await fetch(`${app.url}/api/memo/attachMemoImage`, {
      method: "POST",
      headers: fromApp,
      body: form,
    });
    const { imageUrl } = (await attached.json()) as { imageUrl: string };
    expect(imageUrl).toStartWith("/api/localFile/getBlob/memo/");

    const image = await fetch(`${app.url}${imageUrl}`);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
    const list = (await (await fetch(`${app.url}/api/memo/memoListInPublic`, { headers: fromApp })).json()) as {
      id: string;
    }[];
    expect(list.map((memo) => memo.id)).toContain(memoId);
  });

  test("carries the server env of the build's own env (debug, the default) and no other", async () => {
    const stage = path.join(workspaceRoot, "apps/minimal/.akan/desktop/server");
    const code = (
      await Promise.all(
        [...new Bun.Glob("*.js").scanSync(stage)].map(async (file) => await Bun.file(path.join(stage, file)).text()),
      )
    ).join("\n");
    expect(code).toContain("bundles the server env of AKAN_PUBLIC_ENV=debug alone");
    for (const other of ["local", "testing", "develop", "main"])
      expect(code).toContain(`env/env.server.${other}.ts is not in this build`);
    expect(code).not.toContain("env/env.server.debug.ts is not in this build");
  });

  test("ships the app's own native plugin (apps/minimal/native/probe), which finds the app's bin first", async () => {
    await DesktopApp.until(async () =>
      app.lines.join("\n").includes("probe: apps/minimal/native/probe is loaded; probe-tool is in the app's bin"),
    );
  });

  test("refuses a rebound Host, a foreign origin, and every interface but loopback", async () => {
    const port = new URL(app.url).port;
    expect(await withHost(`${app.url}/api/memo/memoListInPublic`, `attacker.example:${port}`)).toBe(403);
    expect(
      await withHost(`${app.url}/api/memo/memoListInPublic`, `attacker.example:${port}`, {
        "x-forwarded-host": `127.0.0.1:${port}`,
      }),
    ).toBe(403);
    expect(await withHost(`${app.url}/api/benchPing`, `localhost:${port}`)).toBe(200);
    expect((await post(`${app.url}/api/memo/createMemo`, { data: { name: "x" } }, "https://evil.example")).status).toBe(
      403,
    );
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((address) => address?.family === "IPv4" && !address.internal)?.address;
    if (lan) expect(await DesktopApp.answers(`http://${lan}:${port}`)).toBe(false);
  });

  test("a second launch hands over to the first and starts no second server", async () => {
    const second = DesktopApp.start();
    expect(await second.proc.exited).toBe(0);
    expect(second.lines.join("\n")).toContain("handed over to it");
    expect(second.lines.join("\n")).not.toContain("server ready on");
    expect(await DesktopApp.answers(app.url)).toBe(true);
  }, 30_000);

  test("quitting stops the server, and the next launch finds the data it kept", async () => {
    const before = app.url;
    expect(await app.quit()).toBe(0);
    expect(await DesktopApp.answers(before)).toBe(false);
    expect(app.lines.join("\n")).toContain("Shutdown completed successfully");

    app = await DesktopApp.launch();
    const list = (await (await fetch(`${app.url}/api/memo/memoListInPublic`, { headers: fromApp })).json()) as {
      id: string;
      imageUrl: string;
    }[];
    const kept = list.find((memo) => memo.id === memoId);
    expect(kept?.imageUrl).toStartWith("/api/localFile/getBlob/memo/");
    expect((await fetch(`${app.url}${kept?.imageUrl ?? ""}`)).status).toBe(200);
  }, 60_000);

  test("a killed shell takes its server down with it, and what the server started", async () => {
    const { url } = app;
    const held = await post(`${url}/api/holdProbeTool`, {});
    expect(held.status).toBe(200);
    const tool = Number(await held.json());
    expect(DesktopApp.alive(tool)).toBe(true);
    app.proc.kill("SIGKILL");
    await app.proc.exited;
    await DesktopApp.until(async () => !(await DesktopApp.answers(url)), 10_000);
    await DesktopApp.until(async () => !DesktopApp.alive(tool), 10_000);
    app = await DesktopApp.launch();
  }, 60_000);
});
