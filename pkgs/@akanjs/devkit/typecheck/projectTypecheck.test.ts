import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { ProjectTypecheck } from "./projectTypecheck";
import { TypecheckFailure } from "./typecheckFailure";

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
  test("checks a test or a script file nothing imports only when asked, and leaves .akan out", async () => {
    const { root, dir } = await project();
    await write(path.join(dir, "script/rknn/convert.ts"), 'export const port: number = "8282";\n');
    const typecheck = new ProjectTypecheck(dir, root, { ...process.env });

    await typecheck.run(["../../server.ts"]);
    const error = await typecheck.run(["../../server.ts"], { tests: true }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("lib/user/user.signal.test.ts");
    expect((error as Error).message).toContain("script/rknn/convert.ts");
    expect((error as Error).message).not.toContain("old.test.ts");
  }, 60_000);

  test("checks a package whose tsconfig names no include, caching outside it", async () => {
    const root = await makeTempRoot();
    const dir = path.join(root, "pkgs/tool");
    await write(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true, types: [], target: "esnext", module: "esnext" } }),
    );
    await write(path.join(dir, "index.ts"), 'export const port: number = "8282";\n');
    const cacheDir = path.join(root, ".akan/typecheck/pkgs/tool");

    const error = await new ProjectTypecheck(dir, root, { ...process.env })
      .checkIncremental(path.join(dir, "tsconfig.json"), cacheDir, "records")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TypecheckFailure);
    expect((error as TypecheckFailure).records.map(({ file, code }) => [file, code])).toEqual([
      ["pkgs/tool/index.ts", "TS2322"],
    ]);
    expect(await Bun.file(path.join(cacheDir, "tsconfig.tsbuildinfo")).exists()).toBe(true);
    expect(await Bun.file(path.join(dir, "tsconfig.tsbuildinfo")).exists()).toBe(false);
  }, 60_000);

  test("hands back one record per diagnostic when asked for records", async () => {
    const { root, dir } = await project();
    const error = await new ProjectTypecheck(dir, root, { ...process.env })
      .run(["../../server.ts"], { tests: true, report: "records" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypecheckFailure);
    const [record, ...rest] = (error as TypecheckFailure).records;
    expect(rest).toEqual([]);
    expect(record).toMatchObject({
      file: "libs/demo/lib/user/user.signal.test.ts",
      line: 1,
      col: 14,
      code: "TS2322",
      severity: "error",
    });
  }, 60_000);

  test.each(["pretty", "records"] as const)(
    "reports a type error in an env file by position and code alone, in the %p report",
    async (report) => {
      const root = await makeTempRoot();
      const dir = path.join(root, "apps/demo");
      const sentinel = "SENTINEL_JWT_SECRET_4f9c2a71e0b3";
      await write(
        path.join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true, types: [], target: "esnext", module: "esnext", noEmit: true },
        }),
      );
      await write(path.join(dir, "env/env.server.main.ts"), `export const jwtSecret: "other" = "${sentinel}";\n`);
      await write(path.join(dir, "server.ts"), 'export { jwtSecret } from "./env/env.server.main";\n');

      const error = await new ProjectTypecheck(dir, root, { ...process.env })
        .run(["../../server.ts"], { report })
        .catch((e: unknown) => e);

      const printed = (error as Error).message;
      expect(printed).toContain("env/env.server.main.ts");
      expect(printed).toContain("TS2322");
      expect(printed).toContain(report === "records" ? ":1:14" : "1:14");
      expect(printed).not.toContain(sentinel);
      expect(printed).not.toContain("jwtSecret:");
    },
    60_000,
  );
});
