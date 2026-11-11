import { describe, expect, test } from "bun:test";
import { readFile, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { CodegenLock } from "./codegenLock";

const makeRoot = tempDirs("akan-codegen-lock-");
const seedHolder = async (root: string, holder: unknown) => {
  const lockPath = CodegenLock.pathIn(root);
  await Bun.write(lockPath, typeof holder === "string" ? holder : JSON.stringify(holder));
  return lockPath;
};
/** A pid that cannot be alive: `kill(0)` on it is ESRCH on every platform this runs on. */
const deadPid = 0x7ffffff;

describe("CodegenLock", () => {
  test("serializes concurrent callers in the same process", async () => {
    const root = await makeRoot();
    const order: string[] = [];
    const body = async (name: string) => {
      order.push(`${name}:in`);
      await Bun.sleep(20);
      order.push(`${name}:out`);
    };
    await Promise.all([
      CodegenLock.run(root, "a", () => body("a")),
      CodegenLock.run(root, "b", () => body("b")),
      CodegenLock.run(root, "c", () => body("c")),
    ]);
    for (const name of ["a", "b", "c"]) {
      const enter = order.indexOf(`${name}:in`);
      const leave = order.indexOf(`${name}:out`);
      expect(leave).toBe(enter + 1);
    }
  });

  test("releases the lock file even when the body throws", async () => {
    const root = await makeRoot();
    const lockPath = CodegenLock.pathIn(root);
    await expect(
      CodegenLock.run(root, "boom", async () => {
        expect(await Bun.file(lockPath).exists()).toBe(true);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await Bun.file(lockPath).exists()).toBe(false);
  });

  test("writes a holder naming this process", async () => {
    const root = await makeRoot();
    const lockPath = CodegenLock.pathIn(root);
    const holder = await CodegenLock.run(root, "scan:minimal", async () => await readFile(lockPath, "utf8"));
    expect(JSON.parse(holder)).toMatchObject({ pid: process.pid, label: "scan:minimal" });
  });

  test("reclaims a lock whose holder is gone", async () => {
    const root = await makeRoot();
    const lockPath = await seedHolder(root, { pid: deadPid, at: Date.now(), label: "crashed" });
    const started = Date.now();
    const holder = await CodegenLock.run(root, "next", async () => await readFile(lockPath, "utf8"));
    expect(JSON.parse(holder).pid).toBe(process.pid);
    expect(Date.now() - started).toBeLessThan(CodegenLock.waitTimeoutMs);
  });

  test("respects a live holder until the wait expires, then proceeds without the lock", async () => {
    const root = await makeRoot();
    const lockPath = await seedHolder(root, { pid: process.pid, at: Date.now(), label: "other-session" });
    const waitTimeoutMs = CodegenLock.waitTimeoutMs;
    Object.defineProperty(CodegenLock, "waitTimeoutMs", { value: 150, configurable: true });
    try {
      let ran = false;
      await CodegenLock.run(root, "blocked", async () => {
        ran = true;
        // The foreign holder is left in place: nothing may delete a lock it does not hold.
        expect(JSON.parse(await readFile(lockPath, "utf8")).label).toBe("other-session");
      });
      expect(ran).toBe(true);
      expect(await Bun.file(lockPath).exists()).toBe(true);
    } finally {
      Object.defineProperty(CodegenLock, "waitTimeoutMs", { value: waitTimeoutMs, configurable: true });
    }
  });

  test("keeps a young unreadable lock but reclaims a stale one", async () => {
    const young = await makeRoot();
    await seedHolder(young, "");
    const waitTimeoutMs = CodegenLock.waitTimeoutMs;
    Object.defineProperty(CodegenLock, "waitTimeoutMs", { value: 150, configurable: true });
    try {
      await CodegenLock.run(young, "young", async () => undefined);
      expect(await Bun.file(CodegenLock.pathIn(young)).exists()).toBe(true);
    } finally {
      Object.defineProperty(CodegenLock, "waitTimeoutMs", { value: waitTimeoutMs, configurable: true });
    }

    const stale = await makeRoot();
    const stalePath = await seedHolder(stale, "");
    const aged = new Date(Date.now() - CodegenLock.unknownHolderStaleMs - 1_000);
    await utimes(stalePath, aged, aged);
    const holder = await CodegenLock.run(stale, "stale", async () => await readFile(stalePath, "utf8"));
    expect(JSON.parse(holder).pid).toBe(process.pid);
  });

  test("blocks a second process for as long as it holds the lock", async () => {
    const root = await makeRoot();
    const lockPath = CodegenLock.pathIn(root);
    const script = path.join(root, "holder.ts");
    await writeFile(
      script,
      `import { CodegenLock } from ${JSON.stringify(path.resolve(import.meta.dir, "codegenLock.ts"))};
await CodegenLock.run(${JSON.stringify(root)}, "child", async () => {
  process.stdout.write("held\\n");
  await Bun.sleep(400);
});
`,
    );
    const child = Bun.spawn(["bun", script], { stdio: ["ignore", "pipe", "inherit"] });
    const reader = child.stdout.getReader();
    await reader.read();
    reader.releaseLock();

    const started = Date.now();
    await CodegenLock.run(root, "parent", async () => undefined);
    expect(Date.now() - started).toBeGreaterThan(100);
    await child.exited;
    expect(await stat(lockPath).catch(() => null)).toBeNull();
  });
});
