import { sampleOf } from "@akanjs/test";

import * as cnst from "../cnst";
import type * as db from "../db";
import { fetch } from "../sig";

export interface AdminAgent<Fetch = typeof fetch> {
  admin: cnst.Admin;
  fetch: Fetch;
  accessToken: cnst.util.AccessToken;
  adminInput: db.AdminInput;
  password: string;
}

export const getAdminAgentWithInitialize = async <Fetch = typeof fetch>(): Promise<AdminAgent<Fetch>> => {
  // 1. Admin system 초기화 체크
  expect(await fetch.isAdminSystemInitialized()).toBeFalsy();

  // 2. 초기 Admin 생성
  const adminInput = sampleOf(cnst.AdminInput);
  const password = "password";
  let admin = await fetch.createAdminWithInitialize(adminInput);
  expect(admin.accountId).toEqual(adminInput.accountId);
  expect(admin.password).toBeFalsy();
  expect(await fetch.isAdminSystemInitialized()).toBeTruthy();
  // 3. Admin 로그인
  const accessToken = await fetch.signinAdmin(adminInput.accountId, password);
  expect(accessToken.jwt).toBeDefined();
  const adminFetch = fetch.clone(accessToken);

  // 4. Admin 정보 요청
  admin = await adminFetch.me();
  expect(admin.accountId).toEqual(adminInput.accountId);

  return { admin, fetch: adminFetch as Fetch, accessToken, adminInput, password };
};

export const getAdminAgentFromSuperAdmin = async <Fetch = typeof fetch>(
  agent: AdminAgent
): Promise<AdminAgent<Fetch>> => {
  // 1. Admin 생성
  const adminInput = sampleOf(cnst.AdminInput);
  const password = "password";
  let admin = await agent.fetch.createAdmin(adminInput);
  expect(admin).toMatchObject({ accountId: adminInput.accountId, status: "active" });

  // 2. Admin 권한 부여
  admin = await agent.fetch.addAdminRole(admin.id, "admin");
  expect(admin.roles).toContain("admin");
  admin = await agent.fetch.addAdminRole(admin.id, "superAdmin");
  expect(admin.roles).toContain("superAdmin");

  // 3. Admin 로그인
  const accessToken = await fetch.signinAdmin(adminInput.accountId, password);
  expect(accessToken.jwt).toBeDefined();
  const adminFetch = fetch.clone(accessToken);

  // 4. Admin 정보 요청
  admin = await adminFetch.me();
  expect(admin.accountId).toEqual(adminInput.accountId);

  return { admin, fetch: adminFetch as Fetch, accessToken, adminInput, password };
};
