import { beforeAll, describe, expect, it } from "bun:test";
import * as fileSpec from "@libs/shared/lib/file/file.signal.spec";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { type Dayjs, dayjs } from "akanjs/base";
import { MAX_PAGE_SIZE } from "akanjs/constant";
import { configureSignalTest, getOrSetupSignalTestFetch, sampleOf } from "akanjs/test";

import * as adminSpec from "../admin/admin.signal.spec";
import * as cnst from "../cnst";
import type { AdminAgent, UserAgent } from "../user/user.signal.spec";
import type { fetch as sharedFetch } from "../useServer";

configureSignalTest({ storage: "tempFile" });

describe("banner signal test", () => {
  describe("banner service test", () => {
    let adminAgent: AdminAgent, userAgent: UserAgent, banner: cnst.Banner;

    beforeAll(async () => {
      adminAgent = await adminSpec.getAdminAgentWithInitialize();
      userAgent = await userSpec.getUserAgentWithPassword();
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

    it("lists in public only the banners whose display window is open now", async () => {
      const anonFetch = await getOrSetupSignalTestFetch<typeof sharedFetch>();
      const category = `window-${dayjs().valueOf()}`;
      const bannerIn = async (from: Dayjs, to: Dayjs | null) =>
        await adminAgent.fetch.createBanner({ ...sampleOf(cnst.BannerInput), category, from, to });
      const [open, endless, expired, scheduled] = await Promise.all([
        bannerIn(dayjs().subtract(1, "day"), dayjs().add(1, "day")),
        bannerIn(dayjs().subtract(1, "day"), null),
        bannerIn(dayjs().subtract(2, "day"), dayjs().subtract(1, "day")),
        bannerIn(dayjs().add(1, "day"), dayjs().add(2, "day")),
      ]);

      const listed = (await anonFetch.bannerListInPublic(category, 0, MAX_PAGE_SIZE, null)).map(({ id }) => id);
      expect(listed).toContain(open.id);
      expect(listed).toContain(endless.id);
      expect(listed).not.toContain(expired.id);
      expect(listed).not.toContain(scheduled.id);
    });

    it("admin can create banners with images", async () => {
      const [image] = await fileSpec.getActiveFiles(1, adminAgent.fetch);
      const bannerInput = { ...sampleOf(cnst.BannerInput), image: image.id };
      banner = await adminAgent.fetch.createBanner(bannerInput);
      expect(banner.image).toBeTruthy();
    });
  });
});
