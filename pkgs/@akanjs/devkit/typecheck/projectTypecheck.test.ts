import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { ProjectTypecheck } from "./projectTypecheck";

const makeTempRoot = tempDirs("akan-devkit-project-typecheck-");

const project = async () => {
  const root = await makeTempRoot();
  const dir = path.join(root, "libs/demo");
  await write(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, types: [], target: "esnext", module: "esnext", noEmit: true } }),
  );
  await write(path.join(dir, "server.ts"), "export const port: number = 8282;\n");
  await write(path.join(dir, "lib/user/user.signal.test.ts"), 'export const port: number = "8282";\n');
  await write(path.join(dir, ".akan/stale/old.test.ts"), 'export const port: number = "8282";\n');
  return { root, dir };
};

describe("ProjectTypecheck", () => {
  test("checks a test nothing imports only when asked, and leaves .akan out", async () => {
    const { root, dir } = await project();
    const typecheck = new ProjectTypecheck(dir, root, { ...process.env });

    await typecheck.run(["../../server.ts"]);
    const error = await typecheck.run(["../../server.ts"], { tests: true }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("lib/user/user.signal.test.ts");
    expect((error as Error).message).not.toContain("old.test.ts");
  }, 60_000);
});
