import { serviceDictionary } from "akanjs/dictionary";

import type { SignEndpoint } from "./sign.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<SignEndpoint>((fn) => ({
    generatePrepareUserWithAccountId: fn(["Start Signup with Account ID", "아이디로 가입 시작"])
      .desc([
        "Open a new sign-up holding the account id, and mail its code when asked",
        "아이디를 담은 새 가입을 열고, 요청하면 인증 메일을 보내는 API",
      ])
      .arg((t) => ({
        accountId: t(["Account ID", "아이디"]).desc(["Account ID", "아이디"]),
        requestEmailCode: t(["Request Email Code", "메일 인증번호 요청"]).desc([
          "Mail a verification code to the account id",
          "아이디로 인증번호 메일을 보낼지 여부",
        ]),
      })),
    startPhoneSign: fn(["Start Phone Sign", "휴대폰 로그인·가입 시작"])
      .desc([
        "Text a sign-in code to a known number, or open a sign-up holding a new one and text its code",
        "가입된 번호에는 로그인 인증번호를, 새 번호에는 그 번호를 담은 가입을 열고 인증번호를 보내는 API",
      ])
      .arg((t) => ({
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        hash: t(["App Hash", "앱 해시"]).desc([
          "Android SMS Retriever app hash appended to the text",
          "문자 끝에 붙는 안드로이드 SMS Retriever 앱 해시",
        ]),
        signupToken: t(["Signup Token", "가입 진행 토큰"]).desc([
          "Proof of the sign-up to resume, or none",
          "이어서 진행할 가입의 증명, 없으면 비움",
        ]),
      })),
    signinWithPhoneCode: fn(["Sign In with Phone Code", "휴대폰 인증번호로 로그인"])
      .desc(["API to sign in with the code texted to the phone", "휴대폰으로 받은 인증번호로 로그인하는 API"])
      .arg((t) => ({
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        phoneCode: t(["Phone Code", "휴대폰 인증번호"]).desc(["Phone Code", "휴대폰 인증번호"]),
      })),
  }))
  .error({})
  .translate({});
