import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  hashPassword,
  isBcryptHash,
  isPasswordMatch,
  rotateRefreshSession,
  SignChallenge,
  setAdminSsoPolicy,
} from "@libs/shared/srvkit";
import { dayjs } from "akanjs/base";
import { CacheDatabase } from "akanjs/document";
import { ConformanceEnv } from "akanjs/test";

import type * as db from "../db";
import { AdminModel } from "./admin.document";
import { AdminService } from "./admin.service";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const admin = { id: "a1", accountId: "ops@admin.test", roles: ["admin"] } as unknown as db.Admin;
const expiresAt = () => dayjs().add(30, "day").toDate();

const serviceOn = (cache: CacheDatabase) => {
  const adminModel = new AdminModel();
  Object.defineProperty(adminModel, "adminCache", { value: cache });
  Object.defineProperty(adminModel, "getAdmin", { value: async () => admin, configurable: true });
  const service = new AdminService();
  Object.defineProperty(service, "adminModel", { value: adminModel });
  Object.defineProperty(service, "securityService", {
    configurable: true,
    value: {
      createRefreshToken: () => {
        const refreshToken = crypto.randomUUID();
        return { refreshToken, refreshTokenHash: `hash:${refreshToken}`, refreshTokenExpiresAt: expiresAt() };
      },
      hashRefreshToken: (refreshToken: string) => `hash:${refreshToken}`,
      signAccessToken: async () => ({ jwt: "jwt", expiresAt: dayjs().add(7, "day") }),
    },
  });
  return { service, adminModel };
};

for (const kind of ConformanceEnv.cacheKinds("admin refresh token")) {
  describe(`AdminService.refreshAdminToken on the ${kind} cache`, () => {
    let opened: Awaited<ReturnType<typeof ConformanceEnv.openCache>>;
    let service: AdminService;
    let adminModel: AdminModel;
    beforeEach(async () => {
      opened = await ConformanceEnv.openCache(kind);
      ({ service, adminModel } = serviceOn(new CacheDatabase("admin", opened.cache)));
    });
    afterEach(async () => {
      await opened.close();
    });

    test("an OAuth client's refresh token is refused as unknown, and still rotates for that client", async () => {
      const oauthToken = crypto.randomUUID();
      const issued = await adminModel.createRefreshSession(
        admin.id,
        `hash:${oauthToken}`,
        expiresAt(),
        "Claude Code",
        "dcr_claude",
      );
      await expect(service.refreshAdminToken(oauthToken)).rejects.toThrow("shared.error.invalidRefreshToken");
      const rotated = await rotateRefreshSession(
        adminModel.adminCache,
        `hash:${oauthToken}`,
        "hash:next",
        expiresAt(),
        {
          clientId: "dcr_claude",
        },
      );
      expect(rotated.id).toBe(issued.id);
    });

    test("a refresh re-reads the carried user, and drops one that can no longer sign in", async () => {
      const payloads: { self?: { id: string; nickname?: string } }[] = [];
      Object.defineProperty(service, "securityService", {
        value: {
          ...(service as unknown as { securityService: object }).securityService,
          signAccessToken: async (payload: { self?: { id: string } }) => {
            payloads.push(payload);
            return { jwt: "jwt", expiresAt: dayjs().add(7, "day") };
          },
        },
      });
      const account = { self: { id: "u1", nickname: "before" }, selfSid: crypto.randomUUID() } as never;
      const first = crypto.randomUUID();
      await adminModel.createRefreshSession(admin.id, `hash:${first}`, expiresAt());
      const { refreshToken } = await service.refreshAdminToken(
        first,
        account,
        async (userId) =>
          ({
            id: userId,
            nickname: "after",
          }) as never,
      );
      expect(payloads.at(-1)?.self).toMatchObject({ id: "u1", nickname: "after" });
      const second = await service.refreshAdminToken(refreshToken, account, async () => null);
      expect(payloads.at(-1)?.self).toBeUndefined();
      await service.refreshAdminToken(second.refreshToken, account);
      expect(payloads.at(-1)?.self).toBeUndefined();
    });

    test("a first-party admin refresh token still rotates", async () => {
      const browserToken = crypto.randomUUID();
      await adminModel.createRefreshSession(admin.id, `hash:${browserToken}`, expiresAt());
      expect((await service.refreshAdminToken(browserToken)).refreshToken).toBeTruthy();
    });
  });
}

interface FakeAdmin {
  id: string;
  accountId: string;
  roles: string[];
  password?: string;
  passwordSets: number;
  set: (patch: Partial<FakeAdmin>) => FakeAdmin;
  updateAccess: () => FakeAdmin;
  save: () => Promise<FakeAdmin>;
}
const fakeAdmin = (accountId: string, roles: string[], password?: string): FakeAdmin => {
  const row: FakeAdmin = {
    id: crypto.randomUUID(),
    accountId,
    roles,
    password,
    passwordSets: 0,
    set: (patch) => {
      if (patch.password) row.passwordSets++;
      return Object.assign(row, patch);
    },
    updateAccess: () => row,
    save: async () => {
      if (row.password && !isBcryptHash(row.password)) row.password = await hashPassword(row.password);
      return row;
    },
  };
  return row;
};
const withAdminRows = (adminModel: AdminModel, rows: FakeAdmin[]) => {
  const byAccountId = (accountId: string) => rows.find((row) => row.accountId === accountId) ?? null;
  Object.defineProperty(adminModel, "findByAccountId", { value: async (accountId: string) => byAccountId(accountId) });
  Object.defineProperty(adminModel, "findAdminSecret", { value: async (accountId: string) => byAccountId(accountId) });
  Object.defineProperty(adminModel, "getAdmin", {
    value: async (id: string) => rows.find((row) => row.id === id),
  });
  Object.defineProperty(adminModel, "createAdmin", {
    value: async (input: { accountId: string; password?: string }) => {
      const row = fakeAdmin(input.accountId, [], input.password);
      rows.push(row);
      return await row.save();
    },
  });
};

describe("AdminService.initializeAdmin", () => {
  const rootAdminInfo = { accountId: `${crypto.randomUUID()}@root.test`, password: crypto.randomUUID() };
  const bootOn = (rows: FakeAdmin[], resetRootAdmin: boolean) => {
    const { service, adminModel } = serviceOn({} as unknown as CacheDatabase);
    withAdminRows(adminModel, rows);
    Object.defineProperty(adminModel, "revokeRefreshSessions", { value: async () => undefined });
    Object.defineProperty(service, "rootAdminInfo", { value: rootAdminInfo });
    Object.defineProperty(service, "resetRootAdmin", { value: resetRootAdmin });
    return service;
  };

  test("a root password shorter than twelve characters is flagged outside local only", () => {
    const short = crypto.randomUUID().slice(0, AdminService.minRootPasswordLength - 1);
    const long = crypto.randomUUID().slice(0, AdminService.minRootPasswordLength);
    for (const operationMode of ["cloud", "edge", "module"])
      expect(AdminService.isRootPasswordTooShort(operationMode, short)).toBe(true);
    expect(AdminService.isRootPasswordTooShort("cloud", long)).toBe(false);
    expect(AdminService.isRootPasswordTooShort("local", short)).toBe(false);
  });

  test("creates a missing root admin as a superAdmin with the configured password", async () => {
    const rows: FakeAdmin[] = [];
    await bootOn(rows, false).initializeAdmin();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.roles).toEqual(["admin", "superAdmin"]);
    expect(await isPasswordMatch(rootAdminInfo.password, rows[0]?.password ?? "")).toBe(true);
  });

  test("a reboot keeps a password changed and a role removed since", async () => {
    const changed = crypto.randomUUID();
    const root = await fakeAdmin(rootAdminInfo.accountId, ["admin"], changed).save();
    await bootOn([root], false).initializeAdmin();
    expect(root.roles).toEqual(["admin"]);
    expect(await isPasswordMatch(changed, root.password ?? "")).toBe(true);
  });

  test("resetRootAdmin puts the configured password and the superAdmin roles back", async () => {
    const root = await fakeAdmin(rootAdminInfo.accountId, ["admin"], crypto.randomUUID()).save();
    await bootOn([root], true).initializeAdmin();
    expect(root.roles).toEqual(["admin", "superAdmin"]);
    expect(await isPasswordMatch(rootAdminInfo.password, root.password ?? "")).toBe(true);
  });
});

for (const kind of ConformanceEnv.cacheKinds("admin sign-in")) {
  describe(`AdminService.signinAdmin on the ${kind} cache`, () => {
    let opened: Awaited<ReturnType<typeof ConformanceEnv.openCache>>;
    let service: AdminService;
    let rows: FakeAdmin[];
    const password = crypto.randomUUID();
    beforeEach(async () => {
      opened = await ConformanceEnv.openCache(kind);
      let adminModel: AdminModel;
      ({ service, adminModel } = serviceOn(new CacheDatabase("admin", opened.cache)));
      rows = [await fakeAdmin(`${crypto.randomUUID()}@admin.test`, ["admin"], password).save()];
      withAdminRows(adminModel, rows);
    });
    afterEach(async () => {
      await opened.close();
    });

    test("an unknown account and a wrong password answer the same key", async () => {
      const accountId = rows[0]?.accountId ?? "";
      await expect(service.signinAdmin(`${crypto.randomUUID()}@admin.test`, password)).rejects.toThrow(
        "admin.error.invalidCredentials",
      );
      await expect(service.signinAdmin(accountId, crypto.randomUUID())).rejects.toThrow(
        "admin.error.invalidCredentials",
      );
      expect((await service.signinAdmin(accountId, password)).refreshToken).toBeTruthy();
    });

    test("after ten misses even the right password is locked out", async () => {
      const accountId = rows[0]?.accountId ?? "";
      for (let miss = 0; miss < SignChallenge.maxSigninFails; miss++)
        await expect(service.signinAdmin(accountId, crypto.randomUUID())).rejects.toThrow(
          "admin.error.invalidCredentials",
        );
      await expect(service.signinAdmin(accountId, password)).rejects.toThrow("admin.error.tooManySigninAttempts");
    });

    test("an admin without a password cannot sign in with an empty one", async () => {
      const ssoOnly = fakeAdmin(`${crypto.randomUUID()}@admin.test`, ["admin"]);
      rows.push(ssoOnly);
      await expect(service.signinAdmin(ssoOnly.accountId, "")).rejects.toThrow("admin.error.invalidCredentials");
    });

    test("a stored value that is not a bcrypt digest is hashed on the sign-in it matched", async () => {
      const legacy = crypto.randomUUID();
      const row = fakeAdmin(`${crypto.randomUUID()}@admin.test`, ["admin"], legacy);
      rows.push(row);
      await service.signinAdmin(row.accountId, legacy);
      expect(row.passwordSets).toBe(1);
      expect(isBcryptHash(row.password ?? "")).toBe(true);
      expect(await isPasswordMatch(legacy, row.password ?? "")).toBe(true);
    });

    test("SSO signs an existing admin in only when the policy allows that provider", async () => {
      const row = rows[0] as FakeAdmin;
      await expect(service.ssoSigninAdmin(row.accountId, "google")).rejects.toThrow("admin.error.adminSsoNotAllowed");
      setAdminSsoPolicy({ canSignup: () => true, canSignin: () => true });
      try {
        await expect(service.ssoSigninAdmin(row.accountId, "naver")).rejects.toThrow("admin.error.adminSsoNotAllowed");
        await expect(service.ssoSigninAdmin(row.accountId, "facebook")).rejects.toThrow(
          "admin.error.adminSsoNotAllowed",
        );
        expect((await service.ssoSigninAdmin(row.accountId, "google")).refreshToken).toBeTruthy();
      } finally {
        setAdminSsoPolicy({ canSignup: () => false });
      }
    });
  });
}
