import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

//? A container whose PID 1 reaps no orphans keeps an ended one as a zombie, which still answers signal 0.
const zombie = (pid: number) => {
  try {
    return readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.startsWith("Z") ?? false;
  } catch {
    return false;
  }
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return !zombie(pid);
  } catch {
    return false;
  }
};

const gone = async (pids: number[], timeoutMs = 3_000) => {
  const until = Date.now() + timeoutMs;
  while (pids.some(alive) && Date.now() < until) await Bun.sleep(50);
  return !pids.some(alive);
};

describe.skipIf(process.platform === "win32")("OrphanGroup", () => {
  let dir = "";
  let leftovers: number[] = [];

  afterEach(() => {
    for (const pid of leftovers) if (alive(pid)) process.kill(pid, "SIGKILL");
    leftovers = [];
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  const lead = async ({ leads, adoptedElsewhere = false }: { leads?: boolean; adoptedElsewhere?: boolean }) => {
    dir = mkdtempSync(join(tmpdir(), "orphan-group-"));
    const script = join(dir, "leader.ts");
    const mainCopy = join(dir, "selfExec.ts");
    copyFileSync(join(import.meta.dir, "../selfExec.ts"), mainCopy);
    writeFileSync(
      script,
      [
        `import { OrphanGroup } from ${JSON.stringify(join(import.meta.dir, "orphanGroup.ts"))};`,
        `import { SelfExec } from ${JSON.stringify(mainCopy)};`,
        adoptedElsewhere ? "SelfExec.adopt();" : "",
        `const quiet = Bun.spawn(["sleep", "60"]);`,
        `const stubborn = Bun.spawn(["sh", "-c", "trap '' TERM; exec sleep 60"]);`,
        `console.info(JSON.stringify([quiet.pid, stubborn.pid]));`,
        `setTimeout(() => OrphanGroup.exit(0, { ${leads === undefined ? "" : `leads: ${leads}, `}graceMs: 300 }), 200);`,
      ].join("\n"),
    );
    const leader = Bun.spawn([process.execPath, script], {
      detached: true,
      env: { ...process.env, ...(adoptedElsewhere ? { BUN_BE_BUN: "1" } : {}) },
      stdout: "pipe",
      stderr: "inherit",
    });
    const pids = JSON.parse((await new Response(leader.stdout).text()).trim()) as number[];
    leftovers = pids;
    await leader.exited;
    return pids;
  };

  test("a group leader ends what it started, a SIGTERM-deaf one too, and then itself", async () => {
    const pids = await lead({ leads: true });
    expect(await gone(pids)).toBe(true);
  });

  test("a process that is no carried server leaves what it started alone", async () => {
    const pids = await lead({ leads: false });
    expect(pids.every(alive)).toBe(true);
  });

  test("a carried server leads its group though another copy of SelfExec adopted it, as a built main.js does", async () => {
    const pids = await lead({ adoptedElsewhere: true });
    expect(await gone(pids)).toBe(true);
  });
});
