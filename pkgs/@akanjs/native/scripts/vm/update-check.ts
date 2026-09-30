// End-to-end check of desktop app updates (UP-1) on the OS it runs on (docs/testing-windows-linux.md):
//
//   bun scripts/vm/update-check.ts [linux|windows|macos] [--server]
//
// 1. builds the sample (a debug build: the page console reaches stdout) and copies it to a
//    scratch "install" folder, under another name than the build's (an installer's /D=, a renamed .app)
// 2. publishes release A, serves it, and starts the installed app with PUBLIC_UPDATE_PROBE=apply:
//    check → download (full archive) → apply → the new app runs on trial and confirms
// 3. publishes release B and starts the app with PUBLIC_UPDATE_PROBE=no-ready: B (a delta from A)
//    never confirms, so the app rolls back to A after updates.readyTimeout and does not take B again
// 4. checks that no staging, .previous or .failed folders are left
// --server builds the sample with a carried server (desktop.server, a stand-in that answers ready over IPC) instead:
// 2. A confirms only once its server answered and stayed up
// 3. B's server exits at every start: the launcher gives up and B rolls back at once, kept for another try (a strike)
// 4. a build without a server is refused by `update publish` on the same channel, and once the channel starts over,
//    the installed app refuses it from its manifest without downloading it
// It signs with a throwaway key (AKAN_NATIVE_UPDATE_KEY in the scratch folder) and puts its public key into
// a copy of the sample's akan-native.config.ts, so the real update key is never needed. Run it on a copy of
// the repository (the Linux container and the Windows VM have one): it edits the sample's config.

import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const withServer = args.includes("--server");
const os = (args.find((arg) => !arg.startsWith("--")) ??
  { darwin: "macos", win32: "windows", linux: "linux" }[process.platform as string]) as "macos" | "windows" | "linux";
const sample = resolve(import.meta.dir, "../../examples/sample");
const scratch = mkdtempSync(join(tmpdir(), "akan-native-update-check-"));
const env = { ...process.env, AKAN_NATIVE_UPDATE_KEY: join(scratch, "update.key") };
const cli = ["bun", resolve(import.meta.dir, "../../packages/cli/src/index.ts")];

function run(args: string[], quiet = true): string {
  const p = Bun.spawnSync([...cli, ...args], { cwd: sample, env, stdout: "pipe", stderr: "pipe" });
  const out = p.stdout.toString() + p.stderr.toString();
  if (p.exitCode !== 0) throw new Error(`akan-native ${args.join(" ")} failed:\n${out}`);
  if (!quiet) console.info(out.trim());
  return out;
}

const step = (text: string) => console.info(`\n== ${text}`);

// A throwaway key, and its public key in the sample's config.
const keygen = run(["update", "keygen"]);
const publicKey = /publicKey: "([^"]+)"/.exec(keygen)?.[1];
if (!publicKey) throw new Error(`no public key in:\n${keygen}`);
const configPath = join(sample, "akan-native.config.ts");
const original = readFileSync(configPath, "utf8");
const serverDir = join(scratch, "server");
/** The carried server of the next build: one that answers ready and stays, or one that exits at once. */
const writeServer = (behaviour: "up" | "exits") =>
  writeFileSync(
    join(serverDir, "main.js"),
    behaviour === "up"
      ? `process.send?.({ type: "ready", pid: process.pid });
process.on("message", (message) => message?.type === "shutdown" && process.exit(0));
process.on("disconnect", () => process.exit(0));
setInterval(() => {}, 1 << 30);
`
      : "process.exit(3);\n",
  );
const configure = (server: boolean) =>
  writeFileSync(
    configPath,
    original
      .replace(/publicKey: "[^"]*"/, `publicKey: "${publicKey}"`)
      .replace(
        "export default defineConfig({",
        server
          ? `export default defineConfig({\n  desktop: { server: { dir: ${JSON.stringify(serverDir)}, entry: "main.js" } },`
          : "export default defineConfig({",
      ),
  );
if (withServer) {
  mkdirSync(serverDir, { recursive: true });
  writeServer("up");
}
configure(withServer);

const appId = /id: "([^"]+)"/.exec(original)?.[1] ?? "com.akanjs.sample";
const dataDir =
  os === "macos"
    ? join(homedir(), "Library", "Application Support", appId)
    : os === "windows"
      ? join(process.env.LOCALAPPDATA ?? "", appId)
      : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), appId);
//? The sample is built with --debug: its updates and its server keep a debug build's folders.
const updatesDir = join(dataDir, "akan-native-updates-debug");
const out = join(scratch, "updates");
let server: ReturnType<typeof Bun.spawn> | undefined;
/** Ends the installed app: a probe that failed leaves it running from the scratch folder otherwise. */
let stopAll = () => {};

try {
  rmSync(updatesDir, { recursive: true, force: true });
  rmSync(join(dataDir, "server-debug"), { recursive: true, force: true });
  step("build and install");
  run(["build", os, "--debug"]);
  const built = join(sample, ".akan", "native", "build", os);
  const name = readdirSync(built).find((n) => n !== "gen" && !n.endsWith(".json"))!;
  const install = join(scratch, "install");
  const installed = os === "macos" ? name.replace(/\.app$/, " Installed.app") : `${name} Installed`;
  cpSync(join(built, name), join(install, installed), { recursive: true });
  const app = join(install, installed);
  const exe =
    os === "macos"
      ? join(app, "Contents", "MacOS", readdirSync(join(app, "Contents", "MacOS"))[0]!)
      : join(
          app,
          readdirSync(app).find((n) => n.endsWith(".exe") || (!n.includes(".") && n !== "lib" && n !== "resources"))!,
        );

  // Sequences are build times in seconds: a release from the same second is not newer.
  await Bun.sleep(1100);
  step("publish release A");
  run(["update", "publish", os, "--out", out, "--debug"], false);
  server = Bun.spawn([...cli, "update", "serve", "--out", out], {
    cwd: sample,
    env,
    stdout: "ignore",
    stderr: "ignore",
  });
  await Bun.sleep(1500);

  /** Starts the installed app and collects probe lines (the relaunched app writes to the same pipe). */
  async function probe(mode: string, until: RegExp, timeoutMs = 90_000): Promise<string[]> {
    const lines: string[] = [];
    const all: string[] = [];
    //? In its own folder, as Explorer starts it: Windows cannot rename a folder a process works in.
    const child = Bun.spawn([exe], {
      cwd: app,
      env: { ...env, AKAN_NATIVE_PUBLIC_UPDATE_PROBE: mode },
      stdout: "pipe",
      stderr: "pipe",
    });
    const read = async (stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder();
      let rest = "";
      for await (const chunk of stream) {
        rest += decoder.decode(chunk, { stream: true });
        for (let nl = rest.indexOf("\n"); nl >= 0; nl = rest.indexOf("\n")) {
          const line = rest.slice(0, nl).trim();
          rest = rest.slice(nl + 1);
          all.push(line);
          if (all.length > 60) all.shift();
          if (line.includes("AKAN_NATIVE_UPDATE_PROBE") || line.includes("updates:")) {
            console.info(`  ${line}`);
            lines.push(line);
          }
        }
      }
    };
    void read(child.stdout);
    void read(child.stderr);
    const started = Date.now();
    while (!lines.some((l) => until.test(l))) {
      if (Date.now() - started > timeoutMs) {
        console.info(`--- last app output\n${all.join("\n")}\n--- processes`);
        console.info(
          Bun.spawnSync(os === "windows" ? ["tasklist"] : ["ps", "-eo", "pid,ppid,stat,args"]).stdout.toString(),
        );
        console.info(`--- install folder: ${readdirSync(join(scratch, "install")).join(", ")}`);
        throw new Error(`no ${until} within ${timeoutMs / 1000} s`);
      }
      await Bun.sleep(250);
    }
    await Bun.sleep(1000);
    return lines;
  }
  stopAll = () => {
    const exeName = exe.split(/[\\/]/).pop()!;
    if (os === "windows") Bun.spawnSync(["taskkill", "/F", "/IM", exeName]);
    else {
      Bun.spawnSync(["pkill", "-f", install]);
      Bun.sleepSync(1500);
      Bun.spawnSync(["pkill", "-9", "-f", install]);
    }
  };

  step(
    withServer
      ? "A: check → download → apply → trial → its server settles → confirm"
      : "A: check → download → apply → trial → confirm",
  );
  const a = await probe("apply", /confirmed \S+ trial=false/);
  if (!a.some((l) => /check .*"available":true/.test(l))) throw new Error("A was not offered");
  stopAll();
  await Bun.sleep(1500);

  if (withServer) {
    const state = () =>
      JSON.parse(readFileSync(join(updatesDir, "state.json"), "utf8")) as {
        failed: string[];
        strikes?: Record<string, number>;
        pending?: { bundle: string };
        rolledBack?: string;
      };
    step("publish release B, whose server exits at every start");
    writeServer("exits");
    run(["update", "publish", os, "--out", out, "--debug"], false);
    step("B: apply → its server gives up → roll back to A at once, B kept for another try");
    //? B's own page, opened after its server gave up, logs the rollback too ("running embedded"): wait for A's.
    const b = await probe("apply", /rolled-back \S+ running (?!embedded)/, 120_000);
    stopAll();
    await Bun.sleep(1500);
    const rolledBack = /rolled-back (\S+) running/.exec(b.find((l) => /rolled-back/.test(l)) ?? "")?.[1] ?? "";
    const after = state();
    if (after.failed.includes(rolledBack) || after.strikes?.[rolledBack] !== 1 || after.pending?.bundle !== rolledBack)
      throw new Error(`B was not kept as a strike: ${JSON.stringify(after)}`);
    console.info(`  strike 1 of 3 for ${rolledBack}, still downloaded`);

    step("a build without a server on the same channel is refused before it is built");
    configure(false);
    try {
      run(["update", "publish", os, "--out", out, "--debug"]);
      throw new Error("update publish took a build without a server on the channel of one with a server");
    } catch (error) {
      if (!String(error).includes("carries a server and this build does not")) throw error;
      console.info("  refused");
    }
    step("the channel starts over with it: the installed app refuses it from its manifest");
    const releases = readdirSync(out).find((n) => n.startsWith(`${os}-`)) ?? "";
    rmSync(join(out, releases, "production.json"));
    rmSync(join(out, releases, "production.json.sig"));
    run(["update", "publish", os, "--out", out, "--debug"], false);
    rmSync(join(updatesDir, "state.json"));
    rmSync(join(updatesDir, "state.json.bak"), { force: true });
    const c = await probe("apply", /check .*"available":false/);
    stopAll();
    await Bun.sleep(1500);
    if (!c.some((l) => /carries no server, and this app does/.test(l)))
      throw new Error("C was not refused for its server");
  } else {
    step("publish release B (delta from A)");
    run(["update", "publish", os, "--out", out, "--debug"], false);
    step("B: apply, never confirm → roll back to A");
    const b = await probe("no-ready", /rolled-back \S+ running/, 120_000);
    stopAll();
    await Bun.sleep(1500);
    if (!b.some((l) => /running \S+ trial=true/.test(l))) throw new Error("B did not run on trial");
  }

  step("leftovers next to the app");
  const left = readdirSync(install).filter(
    (n) => n !== installed && !(withServer && n.startsWith(`${installed}.update-`)),
  );
  if (left.length) throw new Error(`left behind: ${left.join(", ")}`);
  console.info("  none");
  console.info(`\n✓ UP-1 on ${os}${withServer ? " with a carried server" : ""}: update, confirm, rollback`);
} finally {
  stopAll();
  server?.kill();
  writeFileSync(configPath, original);
  rmSync(scratch, { recursive: true, force: true });
}
