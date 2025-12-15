import { Account } from "@akanjs/signal";
import { sample } from "@akanjs/test";
import { decodeJwt } from "@shared/nest";

import * as adminSpec from "./admin.signal.spec";

describe("Admin Signal", () => {
  describe("Admin Service", () => {
    let rootAdminAgent: adminSpec.AdminAgent, adminAgent: adminSpec.AdminAgent;

    it("can register admin with initialize", async () => {
      rootAdminAgent = await adminSpec.getAdminAgentWithInitialize();
    });

    it("can create/update admin", async () => {
      // 1. Admin 생성
      adminAgent = await adminSpec.getAdminAgentFromSuperAdmin(rootAdminAgent);

      // 2. Admin 변경
      adminAgent.adminInput.accountId = sample.email();
      await rootAdminAgent.fetch.updateAdmin(adminAgent.admin.id, adminAgent.adminInput);
      adminAgent.admin = await rootAdminAgent.fetch.admin(adminAgent.admin.id);
      expect(adminAgent.admin.accountId).toEqual(adminAgent.adminInput.accountId);

      // 3. Admin 권한부여
      adminAgent.admin = await rootAdminAgent.fetch.subAdminRole(adminAgent.admin.id, "admin");
      expect(adminAgent.admin.roles).not.toContain("admin");
      adminAgent.admin = await rootAdminAgent.fetch.addAdminRole(adminAgent.admin.id, "admin");
      expect(adminAgent.admin.roles).toContain("admin");
    });

    it("can signout admin", async () => {
      // 1. Admin 로그인
      const decodedAdminJwt = decodeJwt((await adminAgent.fetch.client.getJwt()) ?? "") as Account | null;
      expect(decodedAdminJwt?.me).toBeTruthy();

      // 2. Admin 로그아웃
      const { jwt: updatedAdminJwt } = await adminAgent.fetch.signoutAdmin();
      const decodedUpdatedAdminJwt = decodeJwt(updatedAdminJwt) as Account | null;
      expect(decodedUpdatedAdminJwt?.me).toBeFalsy();
    });

    it("can remove admin", async () => {
      // 1. Admin 삭제
      adminAgent.admin = await rootAdminAgent.fetch.removeAdmin(adminAgent.admin.id);
      expect(adminAgent.admin.removedAt).toBeTruthy();

      // 2. Admin 로그인 불가
      await expect(
        adminAgent.fetch.signinAdmin(adminAgent.adminInput.accountId, adminAgent.password)
      ).rejects.toThrow();
    });
  });
});
