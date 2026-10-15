import { beforeAll, describe, expect, it } from "bun:test";
import * as adminSpec from "@libs/shared/lib/admin/admin.signal.spec";
import { getOrSetupSignalTestFetch } from "akanjs/test";

import type { AdminAgent } from "../user/user.signal.spec";
import type { fetch as sharedFetch } from "../useServer";

describe("Setting Signal", () => {
  let anonFetch: typeof sharedFetch;
  let adminAgent: AdminAgent;
  beforeAll(async () => {
    anonFetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
    adminAgent = await adminSpec.getAdminAgentWithInitialize();
  });

  it("answers one setting, made at boot, to concurrent readers with no account", async () => {
    const [first, second] = await Promise.all([anonFetch.getActiveSetting(), anonFetch.getActiveSetting()]);

    expect(first.id).toBeTruthy();
    expect(second.id).toBe(first.id);
    expect(first.resignupDays).toBe(0);
  });

  it("lets an admin change the setting and nobody else", async () => {
    const setting = await anonFetch.getActiveSetting();
    await expect(anonFetch.updateSetting(setting.id, { resignupDays: 7 })).rejects.toThrow();

    expect((await adminAgent.fetch.updateSetting(setting.id, { resignupDays: 7 })).resignupDays).toBe(7);
    expect((await anonFetch.getActiveSetting()).resignupDays).toBe(7);
  });
});
