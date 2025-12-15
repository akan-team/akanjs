import * as userSpec from "@shared/lib/user/user.signal.spec";

import * as cnst from "../cnst";

describe("User Signal", () => {
  describe("User Service", () => {
    let adminAgent: userSpec.AdminAgent;
    let userAgent: userSpec.UserAgent;
    let user: cnst.User;
    beforeAll(async () => {
      // adminAgent = await adminSpec.getAdminAgentWithInitialize();
    });
    it("can create user with password", async () => {
      userAgent = await userSpec.getUserAgentWithPassword();
    });
  });
});
