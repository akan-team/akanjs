import { beforeAll, describe, expect, it } from "bun:test";
import * as fileSpec from "@libs/shared/lib/file/file.signal.spec";
import { configureSignalTest, sampleOf } from "akanjs/test";

import * as adminSpec from "../admin/admin.signal.spec";
import * as cnst from "../cnst";
import type { AdminAgent } from "../user/user.signal.spec";

configureSignalTest({ databaseMode: "tempFile" });

describe("Banner Cascade", () => {
  let adminAgent: AdminAgent;

  beforeAll(async () => {
    adminAgent = await adminSpec.getAdminAgentWithInitialize();
  });

  it("removes the file its image points at", async () => {
    const [file] = await fileSpec.getActiveFiles();
    const banner = await adminAgent.fetch.createBanner({ ...sampleOf(cnst.BannerInput), image: file.id });

    await adminAgent.fetch.removeBanner(banner.id);

    // Gone through FileService, not through the file model: that is what runs `_postRemove`, where the stored
    // object is deleted. Reaching the model directly would leave the object behind with nothing pointing at it.
    await expect(adminAgent.fetch.lightFile(file.id)).rejects.toThrow("No Document (file)");
  });

  it("leaves an unreferenced file alone", async () => {
    const [kept] = await fileSpec.getActiveFiles();
    const banner = await adminAgent.fetch.createBanner(sampleOf(cnst.BannerInput));

    await adminAgent.fetch.removeBanner(banner.id);

    expect((await adminAgent.fetch.lightFile(kept.id)).status).toBe("active");
  });
});
