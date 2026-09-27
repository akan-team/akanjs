// End-to-end check of desktop app updates (UP-1) on the OS it runs on (docs/testing-windows-linux.md):
//
//   bun scripts/vm/update-check.ts [linux|windows|macos]
//
// 1. builds the sample (a debug build: the page console reaches stdout) and copies it to a
//    scratch "install" folder
// 2. publishes release A, serves it, and starts the installed app with PUBLIC_UPDATE_PROBE=apply:
//    check → download (full archive) → apply → the new app runs on trial and confirms
// 3. publishes release B and starts the app with PUBLIC_UPDATE_PROBE=no-ready: B (a delta from A)
//    never confirms, so the app rolls back to A after updates.readyTimeout and does not take B again
// 4. checks that no staging, .previous or .failed folders are left
// It signs with a throwaway key (AKAN_NATIVE_UPDATE_KEY in the scratch folder) and puts its public key into
// a copy of the sample's akan-native.config.ts, so the real update key is never needed. Run it on a copy of
// the repository (the Linux container and the Windows VM have one): it edits the sample's config.

import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const os = (process.argv[2] ?? { darwin: "macos", win32: "windows", linux: "linux" }[process.platform as string]) as
  | "macos"
  | "windows"
  | "linux";
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
writeFileSync(configPath, original.replace(/publicKey: "[^"]*"/, `publicKey: "${publicKey}"`));

const appId = /id: "([^"]+)"/.exec(original)?.[1] ?? "com.akanjs.sample";
const dataDir =
  os === "macos"
    ? join(homedir(), "Library", "Application Support", appId)
    : os === "windows"
      ? join(process.env.APPDATA ?? "", appId)
      : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), appId);
const out = join(scratch, "updates");
let server: ReturnType<typeof Bun.spawn> | undefined;

try {
  rmSync(join(dataDir, "akan-native-updates"), { recursive: true, force: true });
  step("build and install");
  run(["build", os, "--debug"]);
  const built = join(sample, ".akan", "native", "build", os);
  const name = readdirSync(built).find((n) => n !== "gen" && !n.endsWith(".json"))!;
  const install = join(scratch, "install");
  cpSync(join(built, name), join(install, name), { recursive: true });
  const app = join(install, name);
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
    const child = Bun.spawn([exe], {
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
  const stopAll = () => {
    const exeName = exe.split(/[\\/]/).pop()!;
    if (os === "windows") Bun.spawnSync(["taskkill", "/F", "/IM", exeName]);
    else Bun.spawnSync(["pkill", "-f", exeName]);
  };

  step("A: check → download → apply → trial → confirm");
  const a = await probe("apply", /confirmed \S+ trial=false/);
  if (!a.some((l) => /check .*"available":true/.test(l))) throw new Error("A was not offered");
  stopAll();
  await Bun.sleep(1500);

  step("publish release B (delta from A)");
  run(["update", "publish", os, "--out", out, "--debug"], false);
  step("B: apply, never confirm → roll back to A");
  const b = await probe("no-ready", /rolled-back \S+ running/, 120_000);
  stopAll();
  await Bun.sleep(1500);
  if (!b.some((l) => /running \S+ trial=true/.test(l))) throw new Error("B did not run on trial");

  step("leftovers next to the app");
  const left = readdirSync(install).filter((n) => n !== name);
  if (left.length) throw new Error(`left behind: ${left.join(", ")}`);
  console.info("  none");
  console.info(`\n✓ UP-1 on ${os}: update, confirm, rollback`);
} finally {
  server?.kill();
  writeFileSync(configPath, original);
  rmSync(scratch, { recursive: true, force: true });
}
