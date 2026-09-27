import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// akanjs readiness O2-3: page code imports akan-native's packages from modules that also run on the server
// (SSR in Bun, React Server Components). Importing must not touch a browser global (a ReferenceError
// would end the process); the bridge connects on the first call. Each import runs in a fresh process with no DOM, once
// plainly and once with the react-server condition (where react has no hooks).

const repo = join(import.meta.dir, "../../..");
const entries = [
  "@akanjs/native/core",
  "@akanjs/native/react",
  ...readdirSync(join(repo, "plugins"))
    .filter((name) => !name.startsWith("."))
    .map((name) => `@akanjs/native/plugins/${name}`),
];

function importIn(conditions: string[]): { code: number; stderr: string } {
  const script = `for (const spec of ${JSON.stringify(entries)}) { await import(spec); }
if (typeof window !== "undefined" || typeof document !== "undefined") throw new Error("a browser global appeared");`;
  const proc = Bun.spawnSync(["bun", ...conditions.flatMap((c) => ["--conditions", c]), "-e", script], {
    cwd: join(repo, "examples/sample"),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { code: proc.exitCode ?? -1, stderr: proc.stderr.toString() };
}

describe("server-side import (O2-3)", () => {
  test("every package imports without a DOM", () => {
    const { code, stderr } = importIn([]);
    expect({ code, stderr: stderr.trim().split("\n").slice(-5).join("\n") }).toEqual({ code: 0, stderr: "" });
  });

  test("every package imports under the react-server condition (RSC)", () => {
    const { code, stderr } = importIn(["react-server"]);
    expect({ code, stderr: stderr.trim().split("\n").slice(-5).join("\n") }).toEqual({ code: 0, stderr: "" });
  });

  test("the list covers every plugin", () => {
    expect(entries.length).toBeGreaterThan(35);
  });
});
