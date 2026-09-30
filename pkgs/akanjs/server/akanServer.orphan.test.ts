import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir = "";
let replica: Bun.Subprocess | null = null;

afterEach(() => {
  replica?.kill("SIGKILL");
  replica = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

const source = (file: string) => JSON.stringify(join(import.meta.dir, file));

test("a replica whose parent closed the channel before it started ends itself instead of serving on", async () => {
  dir = mkdtempSync(join(tmpdir(), "akan-orphan-"));
  const script = join(dir, "replica.ts");
  writeFileSync(
    script,
    [
      `import { AkanLib } from ${source("akanLib.ts")};`,
      `import { AkanOption } from ${source("akanOption.ts")};`,
      `import { AkanServer } from ${source("akanServer.ts")};`,
      `import { makeSqliteEnv, serverResolverTestModule } from ${source("resolver/resolver.contract.fixture.ts")};`,
      `process.on("message", () => {});`,
      `process.send?.("armed");`,
      "while (process.connected) await Bun.sleep(10);",
      `const databases = [serverResolverTestModule()];`,
      `const lib = new AkanLib("orphanTest", { databases, services: [], scalars: [], option: new AkanOption() });`,
      `await new AkanServer("orphanTest", makeSqliteEnv(${JSON.stringify(dir)}), "all", lib).start({ listen: false });`,
    ].join("\n"),
  );
  replica = Bun.spawn([process.execPath, script], {
    cwd: dir,
    env: {
      ...process.env,
      AKAN_PUBLIC_APP_NAME: "orphanTest",
      AKAN_PUBLIC_REPO_NAME: "akan",
      AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
      AKAN_PUBLIC_ENV: "local",
      AKAN_PUBLIC_OPERATION_MODE: "local",
      AKAN_RUNTIME_DIR: join(dir, "runtime"),
      SERVER_MODE: "all",
      NODE_ENV: "test",
    },
    ipc: (message, subprocess) => {
      if (message === "armed") subprocess.disconnect();
    },
    stdout: "ignore",
    stderr: "inherit",
  });
  const ended = await Promise.race([replica.exited, Bun.sleep(15_000).then(() => "still running")]);
  expect(ended).toBe(0);
}, 20_000);
