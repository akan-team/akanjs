import { expect } from "bun:test";
import type * as adminSpec from "@libs/shared/lib/admin/admin.signal.spec";
import { dayjs } from "akanjs/base";
import type { DocumentModel } from "akanjs/constant";
import { getOrSetupSignalTestFetch, sample, sampleOf } from "akanjs/test";

import * as cnst from "../cnst";
import type { fetch as sharedFetch } from "../useServer";

type SharedFetch = typeof sharedFetch;

//? Read by the server when the test system boots, so it is set at import. The master code only vouches for an
//? address on a reserved test domain (RFC 2606), which is why the fixtures sign up on `signup.test`.
process.env.MASTER_EMAILCODE ??= "135790";
export const testEmailCode = process.env.MASTER_EMAILCODE;
export const testEmail = () => `${crypto.randomUUID().slice(0, 12)}@signup.test`;

const getFetch = async () => await getOrSetupSignalTestFetch<SharedFetch>();

export interface UserAgent<Fetch = SharedFetch, User = cnst.User, UserInput = cnst.UserInput> {
  user: User;
  fetch: Fetch;
  accessToken: cnst.util.AccessToken;
  userInput: DocumentModel<UserInput>;
}
export type AdminAgent<Fetch = SharedFetch> = adminSpec.AdminAgent<Fetch>;

export const getUserAgentWithPhone = async <Fetch = SharedFetch, User = cnst.User, UserInput = cnst.UserInput>(
  phoneIdx = 0,
): Promise<UserAgent<Fetch, User, UserInput>> => {
  const fetch = await getFetch();
  const phone = process.env.MASTER_PHONES?.split(",")[phoneIdx] ?? "010-0000-0000";
  const phoneCode = process.env.MASTER_PHONECODE ?? "000000";
  const userInput = sampleOf(cnst.UserInput);

  // 1. 중복된 폰번호가 있는지 확인
  expect(await fetch.userExistsHasPhone(phone)).toBeFalsy();

  // 2. 폰번호로 유저 생성 및 인증코드 요청
  const { userId, signupToken } = await fetch.generatePrepareUser(null);
  await fetch.setPhoneInPrepareUser(userId, phone, "dummy", signupToken);

  // 3. 인증코드 인증
  await fetch.verifyPhoneInPrepareUser(userId, phone, phoneCode, signupToken);

  // 4. 유저 정보 업데이트
  await fetch.setAgreePoliciesOfPrepareUser(userId, ["privacy", "termsofservice"], signupToken);

  // 5. 유저 활성화
  const accessToken = await fetch.activateUser(userId, signupToken);
  const userFetch = fetch.clone({ jwt: accessToken.jwt }) as SharedFetch;

  // 6. 로그인
  const user = (await userFetch.getSelf()) as User & cnst.User;
  expect(user.status).toBe("active");
  expect(await fetch.userExistsHasPhone(phone)).toBeTruthy();

  // 7. 디바이스 토큰 추가
  const deviceToken = {
    token: "dummy",
    provider: "fcm",
    platform: "web",
    deviceId: "dummy-device",
    updatedAt: dayjs(),
  } as const;
  expect(await userFetch.addNotiDeviceTokenOfSelf(deviceToken)).toBeTruthy();

  // 8. 유저 정보 확인
  expect(user).toMatchObject({ id: user.id, status: "active", roles: ["user"], profileStatus: "prepare" });

  return {
    user: user as User,
    fetch: userFetch as Fetch,
    accessToken,
    userInput: userInput as unknown as DocumentModel<UserInput>,
  };
};

export const getUserAgentWithPassword = async <
  Fetch = SharedFetch,
  User = cnst.User,
  UserInput = cnst.UserInput,
>(): Promise<UserAgent<Fetch, User, UserInput>> => {
  const fetch = await getFetch();
  const accountId = testEmail();
  const password = sample.string({ length: 10 });
  const userInput = sampleOf(cnst.UserInput);

  // 1. 중복된 아이디가 있는지 확인
  expect(await fetch.userExistsHasAccountId(accountId)).toBeFalsy();

  // 2. 유저 생성 및 아이디 설정
  const { userId, signupToken } = await fetch.generatePrepareUser(null);
  await fetch.setAccountIdInPrepareUser(userId, accountId, signupToken);
  await fetch.requestEmailCodeInPrepareUser(userId, signupToken);
  await fetch.verifyEmailInPrepareUser(userId, testEmailCode, signupToken);

  // 3. 비밀번호 설정
  await fetch.setPasswordInPrepareUser(userId, accountId, password, signupToken);

  // 4. 유저 정보 업데이트
  await fetch.setAgreePoliciesOfPrepareUser(userId, ["privacy", "termsofservice"], signupToken);

  // 5. 유저 활성화
  const accessToken = await fetch.activateUser(userId, signupToken);
  const userFetch = fetch.clone({ jwt: accessToken.jwt }) as SharedFetch;

  // 6. 로그인
  const user = (await userFetch.getSelf()) as User & cnst.User;
  expect(user.status).toBe("active");
  expect(await fetch.userExistsHasAccountId(accountId)).toBeTruthy();

  // 7. 유저 정보 확인
  expect(user).toMatchObject({ id: user.id, status: "active", roles: ["user"], profileStatus: "prepare" });

  return {
    user: user as User,
    fetch: userFetch as Fetch,
    accessToken,
    userInput: userInput as unknown as DocumentModel<UserInput>,
  };
};
