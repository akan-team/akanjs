// End-to-end check of web bundle updates (UP-2, protocol v2) on an iOS simulator or an Android emulator:
//
//   bun scripts/vm/phone-update-check.ts ios|android
//
// 1. `akan-native run` builds the sample (debug: the page console reaches the log), boots the device and installs it
//    with updates.publicKeys = [online, spare], two throwaway keys in a scratch folder
// 2. release A, signed by the online key: check → download → apply → trial → confirm
// 3. a release for another native API, at its own path: this binary never sees it (one manifest per generation)
// 4. release R, signed by the spare key, revoking the online key with resetSequence and a sequence below A's: taken,
//    and state.json records the revocation
// 5. release B, signed by the revoked online key: refused
// 6. release H, signed by the spare key, whose page never returns from a script: rolled back while the app runs
// 7. one more launch sends what is left of the reports: every step above reached updates.report.url as events
// It edits the sample's akan-native.config.ts and puts it back; run it on a checkout whose sample config is clean.

import { createPrivateKey, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { keyIdOf, type UpdateReportBody } from "../../packages/cli/src/api.ts";
import { readZip } from "../../packages/cli/src/lib/apk.ts";
import { androidTools } from "../../packages/cli/src/platforms/android.ts";

const platform = process.argv[2] as "ios" | "android";
if (platform !== "ios" && platform !== "android") throw new Error("usage: phone-update-check.ts ios|android");
const sample = resolve(import.meta.dir, "../../examples/sample");
const scratch = mkdtempSync(join(tmpdir(), "akan-native-phone-update-"));
const cli = ["bun", resolve(import.meta.dir, "../../packages/cli/src/index.ts")];
const keyPath = { online: join(scratch, "online.key"), spare: join(scratch, "spare.key") };
const out = join(scratch, "updates");
const appId = "com.akanjs.sample";
const step = (text: string) => console.info(`\n== ${text}`);
const QUICK = { timeout: 60_000 };
const onDevice = (command: string[]) => {
  const p = Bun.spawnSync(command, QUICK);
  if (p.exitCode !== 0) throw new Error(`${command.join(" ")} failed:\n${p.stdout.toString()}${p.stderr.toString()}`);
};

function run(args: string[], key: keyof typeof keyPath = "online"): string {
  const p = Bun.spawnSync([...cli, ...args], {
    cwd: sample,
    env: { ...process.env, AKAN_NATIVE_UPDATE_KEY: keyPath[key] },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 1_200_000,
  });
  const text = p.stdout.toString() + p.stderr.toString();
  if (p.exitCode !== 0)
    throw new Error(`akan-native ${args.join(" ")} ${p.exitedDueToTimeout ? "timed out" : "failed"}:\n${text}`);
  return text;
}

const keygen = (key: keyof typeof keyPath) => {
  const publicKey = /publicKeys: \["([^"]+)"\]/.exec(run(["update", "keygen"], key))?.[1];
  if (!publicKey) throw new Error("no public key from keygen");
  return publicKey;
};

const configPath = join(sample, "akan-native.config.ts");
const original = readFileSync(configPath, "utf8");
const adb = platform === "android" ? [androidTools().adb] : [];

/** Every line of the app until `until` matches one, or throws after the timeout. */
async function probe(until: RegExp, mode = "apply", timeoutMs = 90_000): Promise<string[]> {
  const lines: string[] = [];
  const all: string[] = [];
  const env = { AKAN_NATIVE_PUBLIC_UPDATE_PROBE: mode };
  const proc =
    platform === "ios"
      ? Bun.spawn(["xcrun", "simctl", "launch", "--console-pty", "--terminate-running-process", "booted", appId], {
          env: { ...process.env, SIMCTL_CHILD_AKAN_NATIVE_PUBLIC_UPDATE_PROBE: env.AKAN_NATIVE_PUBLIC_UPDATE_PROBE },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        })
      : await (async () => {
          Bun.spawnSync([...adb, "logcat", "-c"], QUICK);
          const extra = JSON.stringify({ PUBLIC_UPDATE_PROBE: mode });
          Bun.spawnSync(
            [
              ...adb,
              "shell",
              `am start -S -W -n ${appId}/com.akanjs.runtime.AkanNativeActivity --es akanNativeEnv '${extra}'`,
            ],
            QUICK,
          );
          return Bun.spawn(
            [...adb, "logcat", "-v", "brief", "AkanNative:V", "AkanNativeConsole:V", "AkanNativeUpdates:V", "*:S"],
            {
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
            },
          );
        })();
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of stream) {
      rest += decoder.decode(chunk, { stream: true });
      for (let nl = rest.indexOf("\n"); nl >= 0; nl = rest.indexOf("\n")) {
        const line = rest.slice(0, nl).trim();
        rest = rest.slice(nl + 1);
        all.push(line);
        if (all.length > 80) all.shift();
        if (/AKAN_NATIVE_UPDATE_PROBE|updates:|revoked keys|rolled back|renderer gone/.test(line)) {
          console.info(`  ${line}`);
          lines.push(line);
        }
      }
    }
  };
  void read(proc.stdout);
  void read(proc.stderr);
  const started = Date.now();
  try {
    while (!lines.some((line) => until.test(line))) {
      if (Date.now() - started > timeoutMs) {
        console.info(`--- last app output\n${all.join("\n")}`);
        throw new Error(`no ${until} within ${timeoutMs / 1000} s`);
      }
      await Bun.sleep(250);
    }
    await Bun.sleep(1500);
    return lines;
  } finally {
    proc.kill();
    if (platform === "ios") Bun.spawnSync(["xcrun", "simctl", "terminate", "booted", appId], QUICK);
    else Bun.spawnSync([...adb, "shell", "am", "force-stop", appId], QUICK);
    await Bun.sleep(1000);
  }
}

function deviceState(): { revokedKeys?: string[]; current?: { bundle: string; keyId: string } } {
  if (platform === "ios") {
    const data = Bun.spawnSync(["xcrun", "simctl", "get_app_container", "booted", appId, "data"], QUICK)
      .stdout.toString()
      .trim();
    return JSON.parse(readFileSync(join(data, "Library/Application Support/akan-native-updates/state.json"), "utf8"));
  }
  const text = Bun.spawnSync(
    [...adb, "shell", "run-as", appId, "cat", "no_backup/akan-native-updates/state.json"],
    QUICK,
  );
  return JSON.parse(text.stdout.toString());
}

/** The envelope a signer elsewhere would write for `manifest`, signed with the key at `path`. */
function writeEnvelope(manifest: object, path: string, publicKey: string, nativeApi: string) {
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const signature = sign(null, bytes, createPrivateKey(readFileSync(path, "utf8"))).toString("base64");
  const dir = join(out, platform, "production");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${nativeApi}.json`),
    JSON.stringify({ manifest: bytes.toString("base64"), keyId: keyIdOf(publicKey), signature }),
  );
}

const reports: UpdateReportBody[] = [];
const receiver = Bun.serve({
  port: 8791,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/report/pathidpathidpath")
      return new Response(null, { status: 404 });
    const body = (await request.json()) as UpdateReportBody;
    reports.push(body);
    for (const e of body.events)
      console.info(`  report #${e.id} ${e.event} ${e.bundle}${e.reason ? ` (${e.reason})` : ""}`);
    return new Response(null, { status: 204 });
  },
});

let server: ReturnType<typeof Bun.spawn> | undefined;
try {
  const online = keygen("online");
  const spare = keygen("spare");
  writeFileSync(
    configPath,
    original
      .replace(/publicKey: "[^"]*"/, `publicKeys: ["${online}", "${spare}"]`)
      .replace("readyTimeout: 5000", "readyTimeout: 15000")
      .replace(
        'url: "http://127.0.0.1:8790",',
        'url: "http://127.0.0.1:8790",\n    report: { url: "http://127.0.0.1:8791/report/pathidpathidpath" },',
      ),
  );

  step(`build, boot and install on the ${platform === "ios" ? "simulator" : "emulator"}`);
  const first = Bun.spawn([...cli, "run", platform, "--headless"], { cwd: sample, stdout: "pipe", stderr: "pipe" });
  const firstErr = new Response(first.stderr).text();
  let firstOut = "";
  const launched = await Promise.race([
    (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of first.stdout) {
        firstOut += decoder.decode(chunk, { stream: true });
        if (new RegExp(`(launched|running) ${appId.replaceAll(".", "\\.")}, logs below`).test(firstOut)) return true;
      }
      return false;
    })(),
    new Promise<boolean>((done) => setTimeout(done, 600_000, false).unref()),
  ]);
  first.kill();
  if (!launched) throw new Error(`akan-native run ${platform} launched no app:\n${firstOut}${await firstErr}`);
  const built = join(sample, ".akan", "native", "build", platform);
  const apk = platform === "android" ? join(built, readdirSync(built).find((n) => n.endsWith(".apk")) ?? "") : "";
  //? A fresh install: one over an earlier run's keeps its update state (a rollback, revoked keys, reports), and an
  //? uninstall before `run` misses the simulator or emulator `run` boots.
  if (platform === "ios") {
    Bun.spawnSync(["xcrun", "simctl", "terminate", "booted", appId], QUICK);
    onDevice(["xcrun", "simctl", "uninstall", "booted", appId]);
    onDevice(["xcrun", "simctl", "install", "booted", join(built, "sample.app")]);
  } else {
    onDevice([...adb, "uninstall", appId]);
    onDevice([...adb, "install", apk]);
  }
  reports.length = 0;
  const apkEntry = (name: string) => {
    const entry = readZip(new Uint8Array(readFileSync(apk))).find((e) => e.name === name);
    if (!entry) throw new Error(`${apk} holds no ${name}`);
    return Buffer.from(entry.method === 8 ? inflateRawSync(entry.data) : entry.data).toString();
  };
  const updatesJson =
    platform === "ios"
      ? readFileSync(join(built, "sample.app", "updates.json"), "utf8")
      : apkEntry("assets/akan-native/updates.json");
  const installed = JSON.parse(updatesJson) as { embeddedSequence: number; nativeApi: string; publicKeys: string[] };
  console.info(
    `  installed: native API ${installed.nativeApi}, embeddedSequence ${installed.embeddedSequence}, keys ${installed.publicKeys.map(keyIdOf).join(", ")}`,
  );
  if (platform === "android") {
    Bun.spawnSync([...adb, "reverse", "tcp:8790", "tcp:8790"], QUICK);
    Bun.spawnSync([...adb, "reverse", "tcp:8791", "tcp:8791"], QUICK);
  }

  await Bun.sleep(2100);
  step("release A, signed by the online key");
  run(["update", "publish", platform, "--out", out, "--debug"]);
  const envelopePath = join(out, platform, "production", `${installed.nativeApi}.json`);
  const releaseA = JSON.parse(
    Buffer.from(JSON.parse(readFileSync(envelopePath, "utf8")).manifest, "base64").toString(),
  );
  server = Bun.spawn([...cli, "update", "serve", "--out", out], { cwd: sample, stdout: "ignore", stderr: "ignore" });
  await Bun.sleep(1500);
  const a = await probe(/confirmed \S+ trial=false|rolled-back/);
  if (!a.some((line) => /start embedded/.test(line)))
    throw new Error(`the app did not start from a clean update state: ${a.join(" | ")}`);
  if (!a.some((line) => /check .*"available":true/.test(line))) throw new Error("A was not offered");
  if (!a.some((line) => /confirmed \S+ trial=false/.test(line))) throw new Error("A was not confirmed");

  step("a release for another native API is never read by this binary");
  writeEnvelope(
    {
      ...releaseA,
      nativeApi: "ffffffffffffffff",
      sequence: releaseA.sequence + 100,
      bundle: `${releaseA.sequence + 100}-other`,
    },
    keyPath.online,
    online,
    "ffffffffffffffff",
  );
  const other = await probe(/check .*"available":false/);
  if (other.some((line) => line.includes("-other"))) throw new Error("the binary saw another native API's release");

  step("release R: the spare key revokes the online key, resetSequence, a sequence below A's");
  const resetSequence = installed.embeddedSequence + 1;
  if (resetSequence >= releaseA.sequence) throw new Error("A must be newer than the binary for this step");
  const bundleR = `${resetSequence}-reset`;
  writeEnvelope(
    { ...releaseA, sequence: resetSequence, bundle: bundleR, revokeKeys: [keyIdOf(online)], resetSequence: true },
    keyPath.spare,
    spare,
    installed.nativeApi,
  );
  await probe(new RegExp(`confirmed ${bundleR} trial=false`));
  const state = deviceState();
  if (!state.revokedKeys?.includes(keyIdOf(online)))
    throw new Error(`state.json did not record the revocation: ${JSON.stringify(state)}`);
  if (state.current?.keyId !== keyIdOf(spare))
    throw new Error(`the current bundle is not the spare key's: ${JSON.stringify(state)}`);

  step("release B, signed by the revoked online key, is refused");
  //? Written here: `update publish` refuses to sign with a key its channel's releases revoke.
  const bundleB = `${releaseA.sequence + 1}-revoked`;
  writeEnvelope(
    { ...releaseA, sequence: releaseA.sequence + 1, bundle: bundleB },
    keyPath.online,
    online,
    installed.nativeApi,
  );
  const b = await probe(/check-failed .*not signed by a key/);
  if (b.some((line) => /downloaded/.test(line))) throw new Error("B was downloaded");

  step("release H, signed by the spare key, whose page never returns from a script: rolled back while the app runs");
  await Bun.sleep(1100);
  run(["update", "publish", platform, "--out", out, "--debug"], "spare");
  const releaseH = JSON.parse(
    Buffer.from(JSON.parse(readFileSync(envelopePath, "utf8")).manifest, "base64").toString(),
  );
  const hangStarted = Date.now();
  await probe(new RegExp(`rolled-back ${releaseH.bundle} running ${bundleR}`), "hang");
  console.info(`  rolled back ${Math.round((Date.now() - hangStarted) / 1000)} s after the launch`);

  step("one more launch sends the rest of the reports");
  await probe(new RegExp(`rolled-back ${releaseH.bundle}`));
  const deadline = Date.now() + 20_000;
  const expected = [
    ["downloaded", releaseA.bundle, null],
    ["applied", releaseA.bundle, null],
    ["confirmed", releaseA.bundle, null],
    ["downloaded", bundleR, null],
    ["applied", bundleR, null],
    ["confirmed", bundleR, null],
    ["failed", bundleB, "signature"],
    ["downloaded", releaseH.bundle, null],
    ["applied", releaseH.bundle, null],
    ["rolledBack", releaseH.bundle, "hang"],
  ] as const;
  const events = () => reports.flatMap((report) => report.events);
  const missing = () =>
    expected.filter(
      ([event, bundle, reason]) =>
        !events().some((e) => e.event === event && e.bundle === bundle && e.reason === reason),
    );
  while (missing().length && Date.now() < deadline) await Bun.sleep(500);
  if (missing().length) throw new Error(`reports never arrived for ${JSON.stringify(missing())}`);
  const ids = events().map((e) => e.id);
  if (ids.some((id, i) => i > 0 && id <= (ids[i - 1] ?? -1)))
    throw new Error(`event ids are not increasing: ${ids.join(", ")}`);
  const [report] = reports;
  if (!report || !/^[0-9a-f]{32}$/.test(report.installId) || reports.some((r) => r.installId !== report.installId))
    throw new Error(`installId is not one 32-digit hex value: ${reports.map((r) => r.installId).join(", ")}`);
  if (
    report.app !== appId ||
    report.platform !== platform ||
    report.channel !== "production" ||
    report.nativeApi !== installed.nativeApi
  )
    throw new Error(`the report names another app: ${JSON.stringify({ ...report, events: undefined })}`);
  if (events().some((e) => Number.isNaN(Date.parse(e.at)) || !/(Z|[+-]\d\d:\d\d)$/.test(e.at)))
    throw new Error("an event's time is not ISO 8601 with a time zone");
  console.info(`  ${events().length} events in ${reports.length} reports from ${report.os}, app ${report.appVersion}`);

  step("ok");
} finally {
  receiver.stop(true);
  server?.kill();
  writeFileSync(configPath, original);
  if (platform === "android") {
    Bun.spawnSync([...adb, "reverse", "--remove", "tcp:8790"], QUICK);
    Bun.spawnSync([...adb, "reverse", "--remove", "tcp:8791"], QUICK);
  }
  rmSync(scratch, { recursive: true, force: true });
}
