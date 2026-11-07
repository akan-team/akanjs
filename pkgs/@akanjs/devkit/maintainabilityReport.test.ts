import { describe, expect, test } from "bun:test";
import type { SizeViolation } from "./maintainabilityContract";
import { MaintainabilityReport } from "./maintainabilityReport";

const fileOf = (file: string, lineCount = 450): SizeViolation => ({
  kind: "size",
  rule: "akan.size.file",
  key: file,
  file,
  line: 1,
  lineCount,
  maxLines: 400,
});

const fixLinesOf = (message: string) => message.split("How to fix:\n")[1]?.split("\n") ?? [];

describe("MaintainabilityReport", () => {
  test("gives a client file, a ui/ or webkit/ file, a long component and a busy one the same ordered paths", () => {
    const message = MaintainabilityReport.describe("apps/demo", [
      fileOf("lib/court/Court.Zone.tsx"),
      fileOf("ui/Board.tsx"),
      fileOf("webkit/useBoard.tsx"),
      {
        ...fileOf("lib/court/Court.Zone.tsx", 300),
        rule: "akan.size.component",
        key: "lib/court/Court.Zone.tsx#Canvas",
        line: 4,
        maxLines: 250,
        component: "Canvas",
      },
      {
        kind: "storeAccess",
        rule: "akan.component.store-access",
        key: "lib/court/Court.Zone.tsx#Canvas",
        file: "lib/court/Court.Zone.tsx",
        line: 4,
        component: "Canvas",
        accessCount: 20,
        maxAccesses: 16,
      },
    ]);
    const [fix = "", ...rest] = fixLinesOf(message);
    const order = ["mode/kind table", "webkit/use<X>.tsx", "`common/`", "add-mutation", "`lib/<sub>`"].map((path) =>
      fix.indexOf(path),
    );

    expect(rest).toEqual([]);
    expect(fix).toStartWith(
      "  *.Zone.tsx, ui/**, webkit/**, component or hook, component or hook reaching the store often: ",
    );
    expect(order.every((idx) => idx > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(fix).toContain('`{ [kind in cnst.X["value"]]: … }`');
    expect(fix).toContain("akan workflow plan create-interaction");
    expect(fix).toContain("never model-bound code moved into `ui/`");
  });

  test("names a write sent from the wrong place, a call per item and a raised entry with their own fixes", () => {
    const message = MaintainabilityReport.describe("apps/demo", [
      {
        kind: "baselineGrowth",
        rule: "akan.baseline.growth",
        key: "lib/court/court.store.ts#assign",
        file: "akan.baseline.json",
        line: 5,
        debtRule: "akan.store.multi-write",
        count: 3,
        committed: 2,
        reference: "3f2a9c1d0b7e",
      },
      {
        kind: "writePlacement",
        rule: "akan.write.placement",
        key: "webkit/useBoard.tsx",
        file: "webkit/useBoard.tsx",
        line: 7,
        writes: ["st.do.removeBoard", "fetch.placeBoard"],
      },
      {
        kind: "loopCall",
        rule: "akan.service.call-in-loop",
        key: "lib/court/court.service.ts#syncAll",
        file: "lib/court/court.service.ts",
        line: 12,
        owner: "syncAll",
        calls: ["this.pcService.getPc"],
        recorded: 0,
      },
      {
        kind: "multiWrite",
        rule: "akan.component.write-chain",
        key: "webkit/useBoard.tsx#useBoard",
        file: "webkit/useBoard.tsx",
        line: 9,
        owner: "useBoard",
        writes: ["st.do.removeBoard (per item)"],
        writeCount: 2,
      },
    ]);

    expect(message).toContain(
      'akan.baseline.growth  entry "lib/court/court.store.ts#assign" under akan.store.multi-write allows 3 writes, above the 2 at 3f2a9c1d0b7e',
    );
    expect(message).toContain(
      "akan.write.placement  sends 2 server write(s) from outside a store action or a module component: st.do.removeBoard, fetch.placeBoard",
    );
    expect(message).toContain(
      "akan.service.call-in-loop  service method syncAll calls once per item: this.pcService.getPc, more than the 0 recorded",
    );
    expect(message).toContain("hook useBoard sends a write per item from one handler: st.do.removeBoard (per item)");
    expect(fixLinesOf(message).map((line) => line.split(":")[0])).toEqual([
      "  baseline entry",
      "  write sent outside a store action or module component",
      "  service call per item",
      "  handler with several writes",
    ]);
  });

  test("keeps the server files' own fixes", () => {
    const message = MaintainabilityReport.describe("apps/demo", [
      fileOf("lib/court/Court.View.tsx"),
      fileOf("lib/court/court.service.ts", 520),
    ]);

    expect(fixLinesOf(message)).toEqual([
      "  *.View.tsx: Move model-independent pieces into ui/ components and display logic onto Light<Model>.",
      "  *.service.ts: Move state transitions into document chain methods, and split an unrelated responsibility into its own module.",
    ]);
  });
});
