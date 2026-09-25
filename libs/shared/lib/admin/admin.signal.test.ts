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

    it("runs a read-only statement for a superAdmin, and refuses anyone else", async () => {
      const { rows, columns, truncated } = await rootAdminAgent.fetch.runAdminSql(
        `SELECT COUNT(*) AS total FROM "admin"`,
        null,
      );
      expect(columns).toEqual(["total"]);
      expect((rows[0] as { total: number }).total).toBeGreaterThan(0);
      expect(truncated).toBe(false);

      const plainAgent = await adminSpec.getPlainAdminAgent(rootAdminAgent);
      await expect(plainAgent.fetch.runAdminSql(`SELECT 1 AS one`, null)).rejects.toThrow();
    });

    it("cannot reach a secret field through SQL, and cannot write", async () => {
      // `password` is `field.secret` on this very model, and it lives in `_doc` like every non-base field.
      await expect(rootAdminAgent.fetch.runAdminSql(`SELECT _doc FROM "admin"`, null)).rejects.toThrow();
      await expect(
        rootAdminAgent.fetch.runAdminSql(`SELECT json_extract(_doc, '$.password') AS leaked FROM "admin"`, null),
      ).rejects.toThrow();
      // `SELECT *` names no column, so the row filter rather than the statement check is what drops it.
      const { columns } = await rootAdminAgent.fetch.runAdminSql(`SELECT * FROM "admin"`, null);
      expect(columns).not.toContain("_doc");
      expect(columns).toContain("id");

      await expect(rootAdminAgent.fetch.runAdminSql(`DELETE FROM "admin"`, null)).rejects.toThrow();
      await expect(rootAdminAgent.fetch.runAdminSql(`SELECT 1; DROP TABLE "admin"`, null)).rejects.toThrow();
      const { rows } = await rootAdminAgent.fetch.runAdminSql(`SELECT COUNT(*) AS total FROM "admin"`, null);
      expect((rows[0] as { total: number }).total).toBeGreaterThan(0);
    });

    it("caps the rows it returns and says when it did", async () => {
      const { rows, truncated } = await rootAdminAgent.fetch.runAdminSql(`SELECT "id" FROM "admin"`, 1);
      expect(rows).toHaveLength(1);
      expect(truncated).toBe(true);
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
