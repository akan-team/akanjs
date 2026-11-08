import { afterAll, describe, expect, it } from "bun:test";
import { Logger } from "akanjs/common";

import { PlatformAdminList } from "./platformAdminList";
import { listPlatformAdmin, setPlatformAdminIds } from "./platformAdminList.spec";

describe("PlatformAdminList", () => {
  const previous = process.env[PlatformAdminList.env];
  afterAll(() => setPlatformAdminIds(previous));

  it("warns once that an empty list refuses every admin, however often and however it is empty", () => {
    const warnings: string[] = [];
    const removeSink = Logger.addSink(
      (entry) => {
        if (entry.record.level === "warn" && entry.record.message.includes(PlatformAdminList.env))
          warnings.push(entry.record.message);
      },
      { minLevel: "warn" },
    );
    try {
      setPlatformAdminIds(undefined);
      expect(PlatformAdminList.includes("m-1")).toBe(false);
      expect(PlatformAdminList.ids().size).toBe(0);
      setPlatformAdminIds(" , ");
      expect(PlatformAdminList.includes("m-1")).toBe(false);
    } finally {
      removeSink();
    }
    expect(warnings).toHaveLength(1);
  });

  it("lets overlapping listings unwind in any order, each taking back only the ids it added", () => {
    setPlatformAdminIds("m-0");
    const unlistA = listPlatformAdmin("m-a");
    const unlistB = listPlatformAdmin("m-b", "m-0");
    unlistA();
    expect([...PlatformAdminList.ids()]).toEqual(["m-0", "m-b"]);
    unlistB();
    expect([...PlatformAdminList.ids()]).toEqual(["m-0"]);
    setPlatformAdminIds(undefined);
    listPlatformAdmin("m-c")();
    expect(process.env[PlatformAdminList.env]).toBeUndefined();
  });
});
