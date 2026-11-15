import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RenderAdmissionSoak } from "./renderAdmissionSoak";

const roots: string[] = [];

const workspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-soak-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "apps", "shop", "page"), { recursive: true });
  return { root, pageDir: RenderAdmissionSoak.pageDirOf(root, "shop") };
};

const until = async (check: () => boolean, what: string) => {
  const deadline = Date.now() + 20_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(20);
  }
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("RenderAdmissionSoak page", () => {
  test("refuses a `page/soak` the app already has, and leaves it as it was", () => {
    const { pageDir } = workspace();
    fs.mkdirSync(pageDir);
    fs.writeFileSync(path.join(pageDir, "_index.tsx"), "export default null;");

    expect(() => RenderAdmissionSoak.injectPage(pageDir)).toThrow("this script did not create it");
    expect(fs.readdirSync(pageDir)).toEqual(["_index.tsx"]);
    RenderAdmissionSoak.removePage(pageDir);
    expect(fs.readdirSync(pageDir)).toEqual(["_index.tsx"]);
  });

  test("removes only what it wrote, and the directory only when nothing else is left in it", () => {
    const { pageDir } = workspace();
    RenderAdmissionSoak.injectPage(pageDir);
    expect(fs.readdirSync(pageDir).sort()).toEqual([".render-admission-soak.json", "io.tsx"]);
    fs.writeFileSync(path.join(pageDir, "notes.tsx"), "export default null;");

    RenderAdmissionSoak.removePage(pageDir);
    expect(fs.readdirSync(pageDir)).toEqual(["notes.tsx"]);

    const fresh = workspace().pageDir;
    RenderAdmissionSoak.injectPage(fresh);
    RenderAdmissionSoak.removePage(fresh);
    expect(fs.existsSync(fresh)).toBe(false);
  });

  test("takes over the page an earlier run of its own left behind", () => {
    const { pageDir } = workspace();
    RenderAdmissionSoak.injectPage(pageDir);
    fs.writeFileSync(path.join(pageDir, "io.tsx"), "stale");

    RenderAdmissionSoak.injectPage(pageDir);
    expect(fs.readFileSync(path.join(pageDir, "io.tsx"), "utf8")).toContain("akanjs/client");
  });

  test("a soak stopped while it builds removes its page and stops the build", async () => {
    const { root, pageDir } = workspace();
    const cli = path.join(root, "cli.ts");
    const started = path.join(root, "build.pid");
    fs.writeFileSync(
      cli,
      `await Bun.write(${JSON.stringify(started)}, String(process.pid));\nawait Bun.sleep(60_000);\n`,
    );
    const soak = Bun.spawn(
      [
        "bun",
        path.join(import.meta.dir, "renderAdmissionSoak.ts"),
        "shop",
        "--prepare",
        `--root=${root}`,
        `--cli=${cli}`,
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    await until(() => fs.existsSync(started), "the build to start");
    expect(fs.existsSync(path.join(pageDir, "io.tsx"))).toBe(true);
    const buildPid = Number(fs.readFileSync(started, "utf8"));

    soak.kill("SIGTERM");
    expect(await soak.exited).toBe(130);
    expect(fs.existsSync(pageDir)).toBe(false);
    await until(() => {
      try {
        process.kill(buildPid, 0);
        return false;
      } catch {
        return true;
      }
    }, "the build to stop");
  }, 30_000);
});
