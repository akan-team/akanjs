import { beforeAll, describe, expect, it } from "bun:test";
import type { Account } from "akanjs/fetch";
import { sample } from "akanjs/test";
import * as adminSpec from "./admin.signal.spec";

const decodeJwtPayload = <Payload>(jwt: string): Payload => {
  return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as Payload;
};

describe("Admin Signal", () => {
  describe("Admin Service", () => {
    let rootAdminAgent: adminSpec.AdminAgent, adminAgent: adminSpec.AdminAgent;
    beforeAll(async () => {});

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
      const decodedAdminJwt = decodeJwtPayload<(Account & { exp?: number; tokenType?: string }) | null>(
        adminAgent.accessToken.jwt,
      );
      expect(decodedAdminJwt?.me).toBeTruthy();
      expect(decodedAdminJwt?.exp).toBeTruthy();
      expect(decodedAdminJwt?.tokenType).toBe("access");
      expect(adminAgent.accessToken.refreshToken).toBeTruthy();

      // 2. Admin JWT 갱신
      const refreshedToken = await adminAgent.fetch.refreshAdminJwt(adminAgent.accessToken.refreshToken);
      expect(refreshedToken.jwt).toBeTruthy();
      expect(refreshedToken.refreshToken).toBeTruthy();
      expect(refreshedToken.refreshToken).not.toBe(adminAgent.accessToken.refreshToken);
      await expect(adminAgent.fetch.refreshAdminJwt(adminAgent.accessToken.refreshToken)).rejects.toThrow();

      // 3. Admin 로그아웃
      const { jwt: updatedAdminJwt } = await adminAgent.fetch.signoutAdmin();
      expect(updatedAdminJwt).toBe("");
      await expect(adminAgent.fetch.refreshAdminJwt(refreshedToken.refreshToken)).rejects.toThrow();
    });

    it("can remove admin", async () => {
      // 1. Admin 삭제
      adminAgent.admin = await rootAdminAgent.fetch.removeAdmin(adminAgent.admin.id);
      expect(adminAgent.admin.removedAt).toBeTruthy();

      // 2. Admin 로그인 불가
      await expect(
        adminAgent.fetch.signinAdmin(adminAgent.adminInput.accountId, adminAgent.password),
      ).rejects.toThrow();
    });
  });
});
