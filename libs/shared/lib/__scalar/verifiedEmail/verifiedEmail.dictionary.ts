import { scalarDictionary } from "akanjs/dictionary";

import type { VerifiedEmail } from "./verifiedEmail.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Verified Email", "인증한 이메일"]).desc([
      "An address this account proved it receives mail at, which invitations to that address trust",
      "이 계정이 메일을 받는다고 증명한 주소로, 그 주소로 온 초대를 이 계정이 받는다",
    ]),
  )
  .model<VerifiedEmail>((t) => ({
    email: t(["Email", "이메일"]).desc(["The proven address", "증명한 주소"]),
    isAccountId: t(["Sign-in Address", "로그인 주소"]).desc([
      "Whether this is the address the account signs in with, which cannot be removed here",
      "이 계정이 로그인하는 주소인지 여부로, 여기서는 삭제할 수 없다",
    ]),
  }));
