import { beforeAll, describe, expect, it } from "bun:test";
import * as adminSpec from "@libs/shared/lib/admin/admin.signal.spec";
import * as notificationSpec from "@libs/shared/lib/notification/notification.signal.spec";
import * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { dayjs } from "akanjs/base";
import { getOrSetupSignalTestFetch } from "akanjs/test";

import type * as cnst from "../cnst";
import { NotificationService } from "./notification.service";

describe("Notification Signal", () => {
  describe("Notification Service", () => {
    let adminAgent: userSpec.AdminAgent;
    let userAgent: userSpec.UserAgent;
    let notification: cnst.Notification;
    beforeAll(async () => {
      adminAgent = await adminSpec.getAdminAgentWithInitialize();
      userAgent = await userSpec.getUserAgentWithPhone();
    });

    it("can create notification", async () => {
      notification = await notificationSpec.createNotification(adminAgent, userAgent);
      expect(notification.id).toBeTruthy();
    });

    // The record names the user it was addressed to, and that field is not secret.
    it("does not answer a notification record to a signed-in non-admin", async () => {
      await expect(userAgent.fetch.notification(notification.id)).rejects.toThrow();
    });

    it("records a notification an admin sends to one user", async () => {
      const sent = await adminAgent.fetch.sendPushNotification({
        title: "Maintenance tonight",
        content: "The service pauses at 2am.",
        level: "notice",
        type: "user",
        userId: userAgent.user.id,
      });
      expect(sent).toMatchObject({ type: "user", userId: userAgent.user.id });
    });
  });

  describe("Device Registration", () => {
    const dummyDevice = {
      token: "dummy",
      provider: "fcm",
      platform: "web",
      deviceId: "dummy-device",
      updatedAt: dayjs(),
    } as const;
    let userAgent: userSpec.UserAgent;
    beforeAll(async () => {
      userAgent = await userSpec.getUserAgentWithPhone(1);
    });

    // `notiInfo` is secret, so the settings screen has no way to read its own state off `self`.
    it("tells whether this device's token is registered", async () => {
      expect(await userAgent.fetch.hasNotiDeviceTokenOfSelf("dummy")).toBe(true);
      expect(await userAgent.fetch.hasNotiDeviceTokenOfSelf("never-registered")).toBe(false);
    });

    it("stops telling once the token is removed", async () => {
      expect(await userAgent.fetch.subNotiDeviceTokenOfSelf("dummy")).toBeTruthy();
      expect(await userAgent.fetch.hasNotiDeviceTokenOfSelf("dummy")).toBe(false);
      expect(await userAgent.fetch.addNotiDeviceTokenOfSelf(dummyDevice)).toBeTruthy();
    });

    // A rotated token comes from the same installation; keeping both would push twice to one phone.
    it("replaces the token an installation had when it registers a new one", async () => {
      expect(await userAgent.fetch.addNotiDeviceTokenOfSelf({ ...dummyDevice, token: "rotated" })).toBeTruthy();
      expect(await userAgent.fetch.hasNotiDeviceTokenOfSelf("rotated")).toBe(true);
      expect(await userAgent.fetch.hasNotiDeviceTokenOfSelf("dummy")).toBe(false);
    });

    it("answers the caller's own noti setting, and reflects a change to it", async () => {
      expect(await userAgent.fetch.notiSettingOfSelf()).toBe("normal");
      expect(await userAgent.fetch.setNotiSettingOfUser(userAgent.user.id, "fewer")).toBeTruthy();
      expect(await userAgent.fetch.notiSettingOfSelf()).toBe("fewer");
    });

    it("refuses an anonymous caller on every device endpoint", async () => {
      const anonFetch = await getOrSetupSignalTestFetch<typeof userAgent.fetch>();
      await expect(anonFetch.hasNotiDeviceTokenOfSelf("dummy")).rejects.toThrow();
      await expect(anonFetch.notiSettingOfSelf()).rejects.toThrow();
      await expect(anonFetch.addNotiDeviceTokenOfSelf(dummyDevice)).rejects.toThrow();
    });
  });

  /**
   * The recipient gate, read without a push adaptor: with no APNs or firebase credentials a send is a no-op,
   * which would prove nothing about who it would have reached.
   */
  describe("Recipient Gate", () => {
    const { notiInfoOf } = notificationSpec;

    it("accepts a normal recipient who has a device", () => {
      expect(NotificationService.accepts(notiInfoOf("normal", ["t"]), "notice")).toBe(true);
    });

    it("refuses a recipient with no device, and one with no notiInfo at all", () => {
      expect(NotificationService.accepts(notiInfoOf("normal", []), "notice")).toBe(false);
      expect(NotificationService.accepts(undefined, "notice")).toBe(false);
    });

    it("refuses block and disagree at every level", () => {
      expect(NotificationService.accepts(notiInfoOf("block", ["t"]), "actionRequired")).toBe(false);
      expect(NotificationService.accepts(notiInfoOf("disagree", ["t"]), "actionRequired")).toBe(false);
    });

    it("lets only what has to be acted on through `fewer`", () => {
      expect(NotificationService.accepts(notiInfoOf("fewer", ["t"]), "actionRequired")).toBe(true);
      expect(NotificationService.accepts(notiInfoOf("fewer", ["t"]), "essential")).toBe(true);
      expect(NotificationService.accepts(notiInfoOf("fewer", ["t"]), "notice")).toBe(false);
      expect(NotificationService.accepts(notiInfoOf("fewer", ["t"]), "advertise")).toBe(false);
    });

    it("holds a recipient whose pause has not run out, and releases one whose has", () => {
      const paused = notiInfoOf("normal", ["t"], dayjs().add(1, "hour"));
      const released = notiInfoOf("normal", ["t"], dayjs().subtract(1, "hour"));
      expect(NotificationService.accepts(paused, "actionRequired")).toBe(false);
      expect(NotificationService.accepts(released, "actionRequired")).toBe(true);
    });
  });
});
