import { beforeAll, describe, expect, it } from "bun:test";
import { configureSignalTest } from "akanjs/test";
// import * as bannerSpec from "./banner.signal.spec";

import * as fileSpec from "@libs/shared/lib/file/file.signal.spec";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { sampleOf } from "akanjs/test";

import * as adminSpec from "../admin/admin.signal.spec";
import * as cnst from "../cnst";
import type { AdminAgent, UserAgent } from "../user/user.signal.spec";

configureSignalTest({ databaseMode: "tempFile" });

describe("banner signal test", () => {
  describe("banner service test", () => {
    let adminAgent: AdminAgent, userAgent: UserAgent, banner: cnst.Banner;

    beforeAll(async () => {
      adminAgent = await adminSpec.getAdminAgentWithInitialize();
      userAgent = await userSpec.getUserAgentWithPhone();
    });

    it("create banner", async () => {
      const bannerInput = sampleOf(cnst.BannerInput);
      banner = await adminAgent.fetch.createBanner(bannerInput);
      expect(banner).toMatchObject(bannerInput);
    });

    it("update banner", async () => {
      const updatedBannerInput = { ...sampleOf(cnst.BannerInput), title: "수정된타이틀" };
      banner = await adminAgent.fetch.updateBanner(banner.id, updatedBannerInput);
      expect(banner).toMatchObject(updatedBannerInput);
    });

    it("user can not create banner", async () => {
      await expect(userAgent.fetch.createBanner(sampleOf(cnst.BannerInput))).rejects.toThrow();
    });

    it("expired banner hidden", async () => {
      const bannerInput = sampleOf(cnst.BannerInput);
      banner = await adminAgent.fetch.createBanner(bannerInput);
      expect(banner).toMatchObject(bannerInput);
    });

    it("admin can create banners with images", async () => {
      const [image] = await fileSpec.getActiveFiles();
      const bannerInput = { ...sampleOf(cnst.BannerInput), image: image.id };
      banner = await adminAgent.fetch.createBanner(bannerInput);
      expect(banner.image).toBeTruthy();
    });
  });
});
