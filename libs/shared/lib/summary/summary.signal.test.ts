import { beforeAll, describe, expect, it } from "bun:test";
import * as adminSpec from "@libs/shared/lib/admin/admin.signal.spec";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { dayjs } from "akanjs/base";
import { MAX_PAGE_SIZE } from "akanjs/constant";
import { getOrSetupSignalTestFetch } from "akanjs/test";

import * as cnst from "../cnst";
import "../db";
import type { AdminAgent, UserAgent } from "../user/user.signal.spec";
import type { fetch as sharedFetch } from "../useServer";
import { SummaryModel } from "./summary.document";

describe("Summary Signal", () => {
  describe("Summary Model", () => {
    it("declares a counted field for every user metric on the dashboard", () => {
      const keys = SummaryModel.countedFields().map(([key]) => key);

      expect(keys).toContain("activeUser");
      expect(keys).toContain("hau");
      expect(keys).toContain("dau");
      expect(keys).toContain("wau");
      expect(keys).toContain("mau");
    });
    it("builds a real query for every counted field", () => {
      for (const [key, queryMeta] of SummaryModel.countedFields()) {
        const query = SummaryModel.queryOf(key, queryMeta);

        expect(query, key).toBeObject();
        expect(Object.keys(query as object).length, key).toBeGreaterThan(0);
      }
    });
    it("narrows a status count to the status the field asked for", () => {
      const [, activeUser] = SummaryModel.countedFields().find(([key]) => key === "activeUser") ?? [];
      if (!activeUser) throw new Error("activeUser is not a counted field");

      expect(SummaryModel.queryOf("activeUser", activeUser)).toHaveProperty("status");
    });
    it("narrows an active-user window to a login cutoff", () => {
      const [, dau] = SummaryModel.countedFields().find(([key]) => key === "dau") ?? [];
      if (!dau) throw new Error("dau is not a counted field");

      expect(SummaryModel.queryOf("dau", dau)).toHaveProperty("lastLoginAt");
    });
    it("cuts the period to the hour without touching the date it was handed", () => {
      const now = new Date(2026, 9, 6, 13, 45, 30);
      const [type, at] = cnst.Summary.getPeriodicType(now);

      expect(type).toBe("hourly");
      expect([at.getHours(), at.getMinutes(), at.getSeconds()]).toEqual([13, 0, 0]);
      expect(now.getMinutes()).toBe(45);
    });
    it("names the coarsest period a midnight closes", () => {
      expect(cnst.Summary.getPeriodicType(new Date(2026, 10, 1, 0, 10))[0]).toBe("monthly");
      expect(cnst.Summary.getPeriodicType(new Date(2026, 9, 4, 0, 10))[0]).toBe("weekly");
      expect(cnst.Summary.getPeriodicType(new Date(2026, 9, 6, 0, 10))[0]).toBe("daily");
    });
    it("gives every archived hour and type an id of its own", () => {
      const at = dayjs(new Date(2026, 9, 6, 13));
      const id = SummaryModel.archivedIdOf("hourly", at);

      expect(id).toMatch(/^[0-9a-f]{24}$/);
      expect(SummaryModel.archivedIdOf("hourly", dayjs(new Date(2026, 9, 6, 13)))).toBe(id);
      expect(SummaryModel.archivedIdOf("daily", at)).not.toBe(id);
      expect(SummaryModel.archivedIdOf("hourly", at.add(1, "hour"))).not.toBe(id);
    });
  });

  describe("Summary Access", () => {
    let anonFetch: typeof sharedFetch;
    let adminAgent: AdminAgent;
    const from = dayjs().subtract(1, "day");
    const to = dayjs().add(1, "day");
    beforeAll(async () => {
      anonFetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
      adminAgent = await adminSpec.getAdminAgentWithInitialize();
    });

    it("refuses the summary and its history to a caller with no account", async () => {
      await expect(anonFetch.getActiveSummary()).rejects.toThrow();
      await expect(anonFetch.summaryListInPeriod(from, to, ["hourly"], 0, MAX_PAGE_SIZE, null)).rejects.toThrow();
      await expect(anonFetch.recountSummary()).rejects.toThrow();
    });

    it("refuses them to a signed-in user who is not an admin", async () => {
      const userAgent: UserAgent = await userSpec.getUserAgentWithPassword();

      await expect(userAgent.fetch.getActiveSummary()).rejects.toThrow();
      await expect(userAgent.fetch.summaryListInPeriod(from, to, ["hourly"], 0, MAX_PAGE_SIZE, null)).rejects.toThrow();
      await expect(userAgent.fetch.recountSummary()).rejects.toThrow();
    });

    it("answers an admin one active row, kept one across a recount", async () => {
      expect((await adminAgent.fetch.getActiveSummary()).type).toBe("active");
      await adminAgent.fetch.recountSummary();

      const actives = await adminAgent.fetch.summaryListInPeriod(from, to, ["active"], 0, MAX_PAGE_SIZE, null);
      expect(actives).toHaveLength(1);
    });
  });
});
