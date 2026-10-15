import { scalarDictionary } from "akanjs/dictionary";

import type { SignupTicket } from "./signupTicket.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Signup Ticket", "가입 진행 티켓"]).desc([
      "The prepare user a sign-up continues, and the token that proves the draft is the caller's",
      "이어서 진행할 가입 대기 사용자와, 그 가입이 호출자의 것임을 증명하는 토큰",
    ]),
  )
  .model<SignupTicket>((t) => ({
    userId: t(["Prepare User ID", "가입 대기 사용자 ID"]).desc([
      "The user still to sign up",
      "가입을 마쳐야 하는 사용자",
    ]),
    signupToken: t(["Signup Token", "가입 진행 토큰"]).desc([
      "Proof of the sign-up, required by every later step and by the activation",
      "이후의 모든 가입 단계와 활성화에 필요한 가입 증명",
    ]),
  }));
