// The checks to pass before this package moves into (or is updated in) the akanjs repository, where
// it is built and tested under akanjs's rules: `bun test --isolate` (akan test), declarations with
// akanjs's TypeScript 6, and the generated files that must match their sources. The five platforms'
// self-tests need simulators, emulators, Docker and a VM, so they are listed, not run.
//
//   bun scripts/move-check.ts --typescript <folder of a TypeScript 6 package>
//   (AKAN_TYPESCRIPT works too; akanjs's is <akanjs>/node_modules/typescript)

import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const i = process.argv.indexOf("--typescript");
const typescript = i > 0 ? process.argv[i + 1] : process.env.AKAN_TYPESCRIPT;

const steps: { name: string; cmd: string[]; cwd?: string; env?: Record<string, string> }[] = [
  { name: "typecheck (TypeScript 7)", cmd: ["bun", "run", "typecheck"] },
  { name: "bun test --isolate", cmd: ["bun", "test", "--isolate"] },
  ...(typescript
    ? [{ name: "declarations (TypeScript 6)", cmd: ["bun", "scripts/declarations.ts", "--typescript", typescript] }]
    : []),
  { name: "contract tables", cmd: ["bun", "scripts/contract.ts", "--check"] },
  { name: "native vectors (Swift, Kotlin)", cmd: ["bun", "scripts/native-vectors.ts"] },
  { name: "Maven POM licenses", cmd: ["bun", "scripts/maven-licenses.ts", "--check"] },
  { name: "third-party notices", cmd: ["bun", "scripts/third-party-notices.ts", "--check"] },
  {
    name: "cargo test",
    cmd: [join(homedir(), ".cargo", "bin", "cargo"), "test", "--locked", "--quiet"],
    cwd: join(ROOT, "native", "desktop"),
    env: {
      CARGO_TARGET_DIR:
        process.env.CARGO_TARGET_DIR ?? join(homedir(), ".akan", "native", "cache", "desktop-target", "move-check"),
    },
  },
];

let failed = 0;
for (const step of steps) {
  const started = performance.now();
  const p = Bun.spawnSync(step.cmd, {
    cwd: step.cwd ?? ROOT,
    env: { ...process.env, ...step.env, NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const ok = p.exitCode === 0;
  if (!ok) failed++;
  console.info(`${ok ? "✓" : "✗"} ${step.name} (${Math.round((performance.now() - started) / 1000)} s)`);
  if (!ok) console.info(`${p.stdout}${p.stderr}`.trim().split("\n").slice(-30).join("\n"));
}
if (!typescript)
  console.info("! declarations (TypeScript 6) skipped: pass --typescript <folder of a TypeScript 6 package>");
console.info(`
Also run the self-tests (docs/move-checklist.md):
  bun run akan-native test macos --app examples/sample
  bun run akan-native test ios --app examples/sample
  bun run akan-native test android --app examples/sample --avd <name>
  bun run akan-native test web --app examples/sample
  bun scripts/vm/linux.ts bun run akan-native test linux --app examples/sample
  bun scripts/vm/windows.ts test`);
process.exit(failed ? 1 : 0);
