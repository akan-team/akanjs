import { expect } from "bun:test";
import { getOrSetupSignalTestFetch, sampleOf } from "akanjs/test";

import * as cnst from "../cnst";
import type * as db from "../db";
import type { fetch as sharedFetch } from "../useServer";

type SharedFetch = typeof sharedFetch;

const getFetch = async () => await getOrSetupSignalTestFetch<SharedFetch>();

export interface AdminAgent<Fetch = SharedFetch> {
  admin: cnst.Admin;
  fetch: Fetch;
  accessToken: cnst.util.AccessToken;
  adminInput: db.AdminInput;
  password: string;
}

export const getAdminAgentWithInitialize = async <Fetch = SharedFetch>(): Promise<AdminAgent<Fetch>> => {
  const fetch = await getFetch();
  // 1. Admin system 초기화 체크
  expect(await fetch.isAdminSystemInitialized()).toBeFalsy();

  // 2. 초기 Admin 생성
  const adminInput = sampleOf(cnst.AdminInput);
  const password = "password";
  let admin = await fetch.createAdminWithInitialize(adminInput);
  expect(admin.accountId).toEqual(adminInput.accountId);
  expect(admin.password).toBeFalsy();
  const rootAccessToken = await fetch.signinAdmin("admin@akanjs.com", "admin1234");
  const rootFetch = fetch.clone({ jwt: rootAccessToken.jwt }) as SharedFetch;
  await rootFetch.setAdminPassword(admin.id, password);
  expect(await fetch.isAdminSystemInitialized()).toBeTruthy();
  // 3. Admin 로그인
  const accessToken = await fetch.signinAdmin(adminInput.accountId, password);
  expect(accessToken.jwt).toBeDefined();
  const adminFetch = fetch.clone({ jwt: accessToken.jwt }) as SharedFetch;

  // 4. Admin 정보 요청
  admin = await adminFetch.me();
  expect(admin.accountId).toEqual(adminInput.accountId);

  return { admin, fetch: adminFetch as Fetch, accessToken, adminInput, password };
};

export const getAdminAgentFromSuperAdmin = async <Fetch = SharedFetch>(
  agent: AdminAgent,
): Promise<AdminAgent<Fetch>> => {
  const fetch = await getFetch();
  // 1. Admin 생성
  const adminInput = sampleOf(cnst.AdminInput);
  const password = "password";
  let admin = await agent.fetch.createAdmin(adminInput);
  expect(admin).toMatchObject({ accountId: adminInput.accountId });
  await agent.fetch.setAdminPassword(admin.id, password);

  // 2. Admin 권한 부여
  admin = await agent.fetch.addAdminRole(admin.id, "admin");
  expect(admin.roles).toContain("admin");
  admin = await agent.fetch.addAdminRole(admin.id, "superAdmin");
  expect(admin.roles).toContain("superAdmin");

  // 3. Admin 로그인
  const accessToken = await fetch.signinAdmin(adminInput.accountId, password);
  expect(accessToken.jwt).toBeDefined();
  const adminFetch = fetch.clone({ jwt: accessToken.jwt }) as SharedFetch;

  // 4. Admin 정보 요청
  admin = await adminFetch.me();
  expect(admin.accountId).toEqual(adminInput.accountId);

  return { admin, fetch: adminFetch as Fetch, accessToken, adminInput, password };
};
