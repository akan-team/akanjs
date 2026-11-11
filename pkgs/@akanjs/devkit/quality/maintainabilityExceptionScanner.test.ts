import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { MaintainabilityExceptionScanner } from "./maintainabilityExceptionScanner";

const makeTempRoot = tempDirs("akan-maintainability-exceptions-");

const makeWorkspace = async (files: Record<string, string>) => {
  const root = await makeTempRoot();
  for (const [filePath, content] of Object.entries(files)) await writeText(path.join(root, filePath), content);
  return root;
};

const baselineOf = (json: object) => `${JSON.stringify(json, null, 2)}\n`;
const reason = "The court canvas is one pointer state machine.";

describe("MaintainabilityExceptionScanner", () => {
  test("warns once per app, lib or package and rule, counting reasoned exceptions apart from adopted debt", async () => {
    const root = await makeWorkspace({
      "apps/demo/akan.baseline.json": baselineOf({
        "akan.size.file": {
          "lib/court/Court.Zone.tsx": 450,
          "ui/Board.tsx": 420,
          "webkit/useBoard.tsx": 410,
        },
        "akan.size.component": { "lib/court/Court.Zone.tsx#Canvas": 300 },
        "akan.component.store-access": { "lib/court/Court.Zone.tsx#Canvas": 30 },
        "akan.store.multi-write": { "lib/court/court.store.ts#assign": 2 },
        "akan.component.write-chain": { "lib/court/Court.Zone.tsx#Install": 2 },
        "akan.write.placement": { "ui/Board.tsx": 1 },
        "akan.service.call-in-loop": { "lib/court/court.service.ts#syncAll": 1 },
        reasons: {
          "lib/court/Court.Zone.tsx": reason,
          "ui/Board.tsx": "Generated SVG path table.",
          "webkit/useBoard.tsx": "too short",
          "lib/court/court.store.ts#assign": reason,
          "lib/court/court.service.ts#syncAll": reason,
        },
      }),
      "libs/shared/akan.baseline.json": baselineOf({ "akan.size.file": { "ui/Table.tsx": 500 } }),
      "pkgs/core/akan.baseline.json": baselineOf({ "akan.size.class": { "server/host.ts#Host": 70 } }),
      "pkgs/@demo/tool/akan.baseline.json": baselineOf({
        "akan.size.function": { "boot.ts#boot": 200 },
        reasons: { "boot.ts#boot": reason },
      }),
      "libs/util/akan.baseline.json": baselineOf({}),
      "libs/broken/akan.baseline.json": "{",
      "apps/clean/main.ts": "export {};\n",
    });

    const warnings = await new MaintainabilityExceptionScanner().scan(root);
    const byRule = (file: string, rule: string) =>
      warnings.find((warning) => warning.file === file && warning.message.includes(`for ${rule}:`));

    expect(warnings.map(({ rule }) => rule).every((rule) => rule === MaintainabilityExceptionScanner.rule)).toBe(true);
    expect(warnings).toHaveLength(10);
    expect(byRule("apps/demo/akan.baseline.json", "akan.size.file")).toMatchObject({
      scope: "file",
      severity: "warning",
      line: 3,
      message:
        `apps/demo carries 2 reasoned exceptions and 1 adopted-debt entry for akan.size.file: ` +
        `lib/court/Court.Zone.tsx (${JSON.stringify(reason)}), ui/Board.tsx ("Generated SVG path table."), webkit/useBoard.tsx.`,
      locations: [
        { file: "apps/demo/akan.baseline.json", line: 3 },
        { file: "apps/demo/akan.baseline.json", line: 4 },
        { file: "apps/demo/akan.baseline.json", line: 5 },
      ],
    });
    expect(byRule("apps/demo/akan.baseline.json", "akan.size.component")?.message).toBe(
      "apps/demo carries 0 reasoned exceptions and 1 adopted-debt entry for akan.size.component: lib/court/Court.Zone.tsx#Canvas.",
    );
    expect(byRule("apps/demo/akan.baseline.json", "akan.component.store-access")?.line).toBe(11);
    expect(byRule("apps/demo/akan.baseline.json", "akan.component.store-access")?.message).toContain(
      "0 reasoned exceptions and 1 adopted-debt entry",
    );
    expect(byRule("apps/demo/akan.baseline.json", "akan.store.multi-write")?.message).toBe(
      "apps/demo carries 0 reasoned exceptions and 1 adopted-debt entry for akan.store.multi-write: lib/court/court.store.ts#assign.",
    );
    expect(byRule("apps/demo/akan.baseline.json", "akan.component.write-chain")?.message).toContain(
      "lib/court/Court.Zone.tsx#Install",
    );
    expect(byRule("apps/demo/akan.baseline.json", "akan.write.placement")?.message).toBe(
      "apps/demo carries 0 reasoned exceptions and 1 adopted-debt entry for akan.write.placement: ui/Board.tsx.",
    );
    expect(byRule("apps/demo/akan.baseline.json", "akan.service.call-in-loop")?.message).toBe(
      `apps/demo carries 1 reasoned exception and 0 adopted-debt entries for akan.service.call-in-loop: lib/court/court.service.ts#syncAll (${JSON.stringify(reason)}).`,
    );
    expect(byRule("libs/shared/akan.baseline.json", "akan.size.file")?.message).toBe(
      "libs/shared carries 0 reasoned exceptions and 1 adopted-debt entry for akan.size.file: ui/Table.tsx.",
    );
    expect(byRule("pkgs/core/akan.baseline.json", "akan.size.class")?.message).toBe(
      "pkgs/core carries 0 reasoned exceptions and 1 adopted-debt entry for akan.size.class: server/host.ts#Host.",
    );
    expect(byRule("pkgs/@demo/tool/akan.baseline.json", "akan.size.function")?.message).toBe(
      `pkgs/@demo/tool carries 1 reasoned exception and 0 adopted-debt entries for akan.size.function: boot.ts#boot (${JSON.stringify(reason)}).`,
    );
    expect(byRule("apps/demo/akan.baseline.json", "akan.size.component")?.fix).toContain("threshold is wrong");
    expect(byRule("apps/demo/akan.baseline.json", "akan.store.multi-write")?.fix).toContain("add-mutation");
  });

  test("tells a bare Error entry to construct a coded error, since the rule takes no exception", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/akan.baseline.json": baselineOf({ "akan.error.bare-error": { "server/host.ts": 2 } }),
    });

    expect(await new MaintainabilityExceptionScanner().scan(root)).toMatchObject([
      {
        message:
          "pkgs/akanjs carries 0 reasoned exceptions and 1 adopted-debt entry for akan.error.bare-error: server/host.ts.",
        fix: expect.stringContaining("construct an `AkanError` subclass"),
      },
    ]);
  });
});
