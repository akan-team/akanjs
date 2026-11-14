import { describe, expect, test } from "bun:test";
import { VerifyScope } from "./verifyScope";

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

  test("an unknown requested target is a usage error", () => {
    expect(() => VerifyScope.resolve([], names, ["nope"])).toThrow("nope is not an app, library or package");
  });
});
