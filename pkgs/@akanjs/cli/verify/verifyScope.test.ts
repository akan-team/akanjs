import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "@akanjs/devkit/test/testHelpers";
import { VerifyScope } from "./verifyScope";

const makeTempRoot = tempDirs("akan-verify-scope-");

const names = { apps: ["minimal"], libs: ["shared"], pkgs: ["@akanjs/cli", "akanjs"] };

describe("VerifyScope", () => {
  test("parses porcelain -z output, skipping the source path of a rename", () => {
    const status = [
      " M apps/minimal/lib/memo/memo.service.ts",
      "R  libs/shared/ui/New.tsx",
      "libs/shared/ui/Old.tsx",
      "?? pkgs/@akanjs/cli/verify/my file.ts",
      "",
    ].join("\0");
    expect(VerifyScope.parseStatus(status)).toEqual([
      { code: " M", file: "apps/minimal/lib/memo/memo.service.ts" },
      { code: "R ", file: "libs/shared/ui/New.tsx" },
      { code: "??", file: "pkgs/@akanjs/cli/verify/my file.ts" },
    ]);
  });

  test("keeps only paths under the workspace prefix and makes them workspace-relative", () => {
    const status = [" M repo/apps/minimal/main.ts", " M other/README.md", ""].join("\0");
    expect(VerifyScope.parseStatus(status, "repo/")).toEqual([{ code: " M", file: "apps/minimal/main.ts" }]);
  });

  test("resolves the changed targets and nothing else", () => {
    const scope = VerifyScope.resolve(
      [
        { code: " M", file: "apps/minimal/ui/Card.tsx" },
        { code: " M", file: "pkgs/@akanjs/cli/index.ts" },
        { code: " M", file: "pkgs/akanjs-extra/index.ts" },
        { code: " M", file: "README.md" },
      ],
      names,
    );
    expect(scope.targets.map((target) => [target.type, target.name, target.files])).toEqual([
      ["app", "minimal", ["apps/minimal/ui/Card.tsx"]],
      ["pkg", "@akanjs/cli", ["pkgs/@akanjs/cli/index.ts"]],
    ]);
    expect(scope.touchesTsx).toBe(true);
  });

  test("a requested target without changes covers the whole target", () => {
    const scope = VerifyScope.resolve([], names, ["shared"]);
    expect(scope.targets).toEqual([{ type: "lib", name: "shared", dir: "libs/shared", files: [] }]);
    expect(scope.touchesTsx).toBe(false);
  });

  test("adds the apps and libs that use a changed lib, through other libs too, as dependents", () => {
    const workspace = { apps: ["minimal", "akan", "solo"], libs: ["util", "shared", "other"], pkgs: [] };
    const libDeps = new Map([
      ["apps/minimal", ["shared"]],
      ["apps/akan", ["util"]],
      ["apps/solo", ["other"]],
      ["libs/shared", ["util"]],
    ]);
    const scope = VerifyScope.resolve([{ code: " M", file: "libs/util/common/value.ts" }], workspace).withDependents(
      workspace,
      libDeps,
    );
    expect(scope.targets.map((target) => [target.name, target.files, target.dependent ?? false])).toEqual([
      ["util", ["libs/util/common/value.ts"], false],
      ["minimal", [], true],
      ["akan", [], true],
      ["shared", [], true],
    ]);
  });

  test("a changed app or an unchanged requested lib pulls in no dependent", () => {
    const libDeps = new Map([["apps/minimal", ["shared"]]]);
    const changedApp = VerifyScope.resolve([{ code: " M", file: "apps/minimal/main.ts" }], names);
    expect(changedApp.withDependents(names, libDeps).targets.map((target) => target.name)).toEqual(["minimal"]);
    const requested = VerifyScope.resolve([], names, ["shared"]);
    expect(requested.withDependents(names, libDeps).targets.map((target) => target.name)).toEqual(["shared"]);
  });

  test("reads each app's and lib's lib imports from its sources, type-only ones included, and not from a manifest", async () => {
    const root = await makeTempRoot();
    const files = {
      "apps/demo/akan.app.json": JSON.stringify({ libDeps: ["other"] }),
      "apps/demo/main.ts": 'import type { Port } from "@libs/util/common";\nexport const at: Port = 1;\n',
      "apps/demo/ui/Note.tsx": 'export const Note = () => <p>{`import x from "@libs/other"`}</p>; // "@libs/other"\n',
      "apps/demo/node_modules/dep/index.ts": 'import "@libs/other";\n',
      "libs/shared/index.ts": 'export * from "@libs/util";\nexport * from "@libs/shared/common";\n',
      "libs/util/index.ts": "export type Port = number;\n",
    };
    for (const [file, content] of Object.entries(files)) await writeText(path.join(root, file), content);

    const libDeps = await VerifyScope.libDepsIn(root, { apps: ["demo"], libs: ["shared", "util"], pkgs: [] });

    expect(Object.fromEntries(libDeps)).toEqual({ "apps/demo": ["util"], "libs/shared": ["util"], "libs/util": [] });
  });

  test("an unknown requested target is a usage error", () => {
    expect(() => VerifyScope.resolve([], names, ["nope"])).toThrow("nope is not an app, library or package");
  });
});
