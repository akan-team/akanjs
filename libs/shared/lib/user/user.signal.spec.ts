import { DocumentModel } from "@akanjs/constant";
import { sample, sampleOf } from "@akanjs/test";
import * as adminSpec from "@shared/lib/admin/admin.signal.spec";

import * as cnst from "../cnst";
import { fetch } from "../sig";

export interface UserAgent<Fetch = typeof fetch, User = cnst.User, UserInput = cnst.UserInput> {
  user: User;
  fetch: Fetch;
  accessToken: cnst.util.AccessToken;
  userInput: DocumentModel<UserInput>;
}
export type AdminAgent<Fetch = typeof fetch> = adminSpec.AdminAgent<Fetch>;

export const getUserAgentWithPhone = async <Fetch = typeof fetch, User = cnst.User, UserInput = cnst.UserInput>(
  phoneIdx = 0
): Promise<UserAgent<Fetch, User, UserInput>> => {
  const phone = cnst.MASTER_PHONES[phoneIdx];
  const phoneCode = cnst.MASTER_PHONECODE;
  const userInput = sampleOf(cnst.UserInput);

  // 1. 중복된 폰번호가 있는지 확인
  expect(await fetch.getUserIdHasPhone(phone)).toBeFalsy();

  // 2. 폰번호로 유저 생성 및 인증코드 요청
  const prepareUser = await fetch.generatePrepareUser(null, "dummy");
  expect(prepareUser.status).toBe("prepare");
  await fetch.setPhoneInPrepareUser(prepareUser.id, phone, "dummy");

  // 3. 인증코드 인증
  await fetch.verifyPhoneInPrepareUser(prepareUser.id, phone, phoneCode);

  // 4. 유저 정보 업데이트
  await fetch.setAgreePoliciesOfPrepareUser(prepareUser.id, ["privacy", "termsofservice"]);

  // 5. 유저 활성화
  const accessToken = await fetch.activateUser(prepareUser.id);
  const userFetch = fetch.clone(accessToken);

  // 6. 로그인
  const user = await userFetch.getSelf();
  expect(user.status).toBe("active");
  expect(await fetch.getUserIdHasPhone(phone)).toBeTruthy();

  // 7. 디바이스 토큰 추가
  const deviceToken = "dummy";
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
  Fetch = typeof fetch,
  User = cnst.User,
  UserInput = cnst.UserInput,
>(): Promise<UserAgent<Fetch, User, UserInput>> => {
  const accountId = sample.email();
  const password = sample.string({ length: 10 });
  const userInput = sampleOf(cnst.UserInput);

  // 1. 중복된 아이디가 있는지 확인
  expect(await fetch.userExistsHasAccountId(accountId)).toBeFalsy();

  // 2. 유저 생성 및 아이디 설정
  const prepareUser = await fetch.generatePrepareUser(null, "dummy");
  expect(prepareUser.status).toBe("prepare");
  await fetch.setAccountIdInPrepareUser(prepareUser.id, accountId);

  // 3. 비밀번호 설정
  await fetch.setPasswordInPrepareUser(prepareUser.id, accountId, password);

  // 4. 유저 정보 업데이트
  await fetch.setAgreePoliciesOfPrepareUser(prepareUser.id, ["privacy", "termsofservice"]);

  // 5. 유저 활성화
  const accessToken = await fetch.activateUser(prepareUser.id);
  const userFetch = fetch.clone(accessToken);

  // 6. 로그인
  const user = await userFetch.getSelf();
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
