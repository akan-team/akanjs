// akan-native test <platform|all>: builds a dev build, launches it with PUBLIC_SELFTEST=1 and waits for the
// app's self-test report line `AKAN_NATIVE_SELFTEST {json}` in the host log (NF-3). The same page-side
// test runs on every host; see examples/sample/src/selftest.ts for the contract.

import { checkFlags, parseArgs, stringFlag } from "../lib/args.ts";
import { onStopSignal } from "../lib/launch.ts";
import { bold, CliError, dim, green, log, red } from "../lib/log.ts";
import { hostTargets, PLATFORM_TARGETS, TARGETS, type TargetPlatform } from "../platforms/index.ts";
import { BOOLEAN_FLAGS, buildFromArgs } from "./build.ts";

export const TEST_USAGE = `akan-native test <${TARGETS.join("|")}|all> [--app <dir>] [--mode <mode>] [--skip-web-build] [--timeout <s>] [--device <name>] [--avd <name>]`;

const MARKER = "AKAN_NATIVE_SELFTEST ";
const DESKTOP: readonly TargetPlatform[] = ["macos", "windows", "linux"];
/** The report in base64 parts (`AKAN_NATIVE_SELFTEST_PART 1/3 …`): host logs cut long lines (Android ~4 KB). */
const PART = /AKAN_NATIVE_SELFTEST_PART (\d+)\/(\d+) ([A-Za-z0-9+/=]+)/;

interface Report {
  pass: boolean;
  platform: string;
  results: { name: string; ok: boolean; detail?: string }[];
}

export async function test(argv: string[]): Promise<number> {
  const args = parseArgs(argv, BOOLEAN_FLAGS);
  // Always a debug build: the self-test needs the runtime env override (PUBLIC_SELFTEST).
  checkFlags(args, ["app", "mode", "skip-web-build", "timeout", "device", "avd"], TEST_USAGE);
  const which = args.positional[0] ?? "all";
  // all: what this machine can build (desktop apps and iOS only on their own OS).
  const platforms: TargetPlatform[] = which === "all" ? hostTargets() : [which as TargetPlatform];
  if (platforms.some((p) => !TARGETS.includes(p)))
    throw new CliError(`expected a platform or "all": ${TARGETS.join(", ")}`, 2);
  const timeout = Number(stringFlag(args, "timeout") ?? 180) * 1000;
  // --device: a simulator, a connected device's serial or a paired iPhone; --avd: an AVD to start (Android).
  const device = stringFlag(args, "device");
  const avd = stringFlag(args, "avd");
  const target = { ...(device ? { device } : {}), ...(avd ? { avd } : {}) };

  const summary: { platform: string; ok: boolean; detail: string }[] = [];
  for (const [i, platform] of platforms.entries()) {
    // The SPA is built once; later platforms reuse web.dir.
    if (i > 0) args.flags["skip-web-build"] = true;
    const { ctx, artifact } = await buildFromArgs(args, { mode: "development", profile: "debug" }, platform);
    log.step(`self-test on ${platform}`);
    const tail: string[] = [];
    let report: Report | null = null;
    const parts = new Map<number, string>();
    let resolveReport!: () => void;
    const reported = new Promise<void>((resolve) => (resolveReport = resolve));
    const app = await PLATFORM_TARGETS[platform].launch(ctx, artifact, {
      // Desktop dev builds: dialogs, file panels and JS alerts end by themselves after 300 ms,
      // alerts with the first button and file panels with Cancel (native/desktop/src/panels.rs);
      // AKAN_NATIVE_TEST_PANELS in the environment overrides the answers. On macOS the page keeps running
      // when the test window opens behind other apps (AKAN_NATIVE_TEST_NO_THROTTLING, lib.rs).
      env: {
        AKAN_NATIVE_PUBLIC_SELFTEST: "1",
        ...(DESKTOP.includes(platform)
          ? {
              AKAN_NATIVE_TEST_PANELS: process.env.AKAN_NATIVE_TEST_PANELS ?? "auto",
              AKAN_NATIVE_TEST_NO_THROTTLING: "1",
            }
          : {}),
      },
      headless: true,
      ...target,
      onLine(line) {
        const part = PART.exec(line);
        if (part) {
          parts.set(Number(part[1]), part[3]!);
          if (parts.size === Number(part[2])) {
            try {
              const encoded = [...parts]
                .sort(([a], [b]) => a - b)
                .map(([, chunk]) => chunk)
                .join("");
              report = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Report;
            } catch {
              tail.push(line);
            }
            resolveReport();
          }
          return;
        }
        const at = line.indexOf(MARKER);
        if (at >= 0) {
          try {
            report = JSON.parse(line.slice(at + MARKER.length)) as Report;
          } catch {
            tail.push(line);
          }
          resolveReport();
          return;
        }
        tail.push(line);
        if (tail.length > 40) tail.shift();
      },
    });
    const off = onStopSignal(() => {
      app.stop();
      process.exit(130);
    });
    const timer = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeout));
    const outcome = await Promise.race([
      reported.then(() => "report" as const),
      app.exited.then(() => "exited" as const),
      timer,
    ]);
    off();
    app.stop();

    const r = report as Report | null;
    if (!r) {
      log.error(`${platform}: no self-test report (${outcome})`);
      if (tail.some((line) => line.includes("single-instance: another instance is already running"))) {
        log.info(
          `  The app is already running (single-instance handed this launch over). Quit it and run the test again.`,
        );
      }
      for (const line of tail.slice(-20)) log.info(dim(line));
      summary.push({ platform, ok: false, detail: `no report (${outcome})` });
      continue;
    }
    for (const result of r.results) {
      log.info(
        `${result.ok ? green("PASS") : red("FAIL")} ${result.name}${result.detail ? dim(` — ${result.detail}`) : ""}`,
      );
    }
    const failed = r.results.filter((x) => !x.ok).length;
    summary.push({ platform, ok: r.pass, detail: `${r.results.length - failed}/${r.results.length}` });
  }

  console.info("");
  for (const s of summary) console.info(`${s.ok ? green("✓") : red("✗")} ${bold(s.platform.padEnd(8))} ${s.detail}`);
  return summary.every((s) => s.ok) ? 0 : 1;
}
