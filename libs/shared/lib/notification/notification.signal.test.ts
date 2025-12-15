import * as adminSpec from "@shared/lib/admin/admin.signal.spec";
import * as notificationSpec from "@shared/lib/notification/notification.signal.spec";
import * as userSpec from "@shared/lib/user/user.signal.spec";

import * as cnst from "../cnst";

describe("Notification Signal", () => {
  describe("Notification Service", () => {
    let adminAgent: userSpec.AdminAgent;
    let userAgent: userSpec.UserAgent;
    let notification: cnst.Notification;
    beforeAll(async () => {
      adminAgent = await adminSpec.getAdminAgentWithInitialize();
    });
    it("can create notification", async () => {
      notification = await notificationSpec.createNotification(adminAgent, userAgent);
    });
  });
});
