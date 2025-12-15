import { scalarDictionary } from "@akanjs/dictionary";

import type { EncourageInfo, Inquiry, Journey } from "./encourageInfo.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Encourage Info", "격려 정보"]).desc(["Encourage Info", "격려 정보"]))
  .model<EncourageInfo>((t) => ({
    journey: t(["Journey", "여정"]).desc(["Journey", "여정"]),
    journeyAt: t(["Journey At", "여정 일시"]).desc(["Journey At", "여정 일시"]),
    inquiry: t(["Inquiry", "획득"]).desc(["Inquiry", "획득"]),
    inquiryAt: t(["Inquiry At", "획득 일시"]).desc(["Inquiry At", "획득 일시"]),
  }))
  .enum<Journey>("journey", (t) => ({
    welcome: t(["Welcome", "환영"]).desc(["Welcome journey status", "환영 여정 상태"]),
    waiting: t(["Waiting", "대기"]).desc(["Waiting journey status", "대기 여정 상태"]),
    firstJoin: t(["First Join", "첫 가입"]).desc(["First Join journey status", "첫 가입 여정 상태"]),
    joined: t(["Joined", "가입됨"]).desc(["Joined journey status", "가입됨 여정 상태"]),
    leaving: t(["Leaving", "떠나는 중"]).desc(["Leaving journey status", "떠나는 중 여정 상태"]),
    leaved: t(["Leaved", "떠남"]).desc(["Leaved journey status", "떠남 여정 상태"]),
    returning: t(["Returning", "돌아오는중"]).desc(["Returning journey status", "돌아오는중 여정 상태"]),
    returned: t(["Returned", "돌아옴"]).desc(["Returned journey status", "돌아옴 여정 상태"]),
  }))
  .enum<Inquiry>("inquiry", (t) => ({
    welcome: t(["Welcome", "환영"]).desc(["Welcome inquiry status", "환영 획득 상태"]),
    concerned: t(["Concerned", "걱정 상태"]).desc(["Concerned inquiry status", "걱정 획득 상태"]),
    concernedPayable: t(["Concerned Payable", "걱정 지불 가능"]).desc([
      "Concerned Payable inquiry status",
      "걱정 지불 가능 획득 상태",
    ]),
    concernedWaitPay: t(["Concerned Wait Pay", "걱정 지불 대기"]).desc([
      "Concerned Wait Pay inquiry status",
      "걱정 지불 대기 획득 상태",
    ]),
    payable: t(["Payable", "지불 가능"]).desc(["Payable inquiry status", "지불 가능 획득 상태"]),
    waitPay: t(["Wait Pay", "지불 대기"]).desc(["Wait Pay inquiry status", "지불 대기 획득 상태"]),
    paid: t(["Paid", "지불됨"]).desc(["Paid inquiry status", "지불됨 획득 상태"]),
    ashed: t(["Ashed", "종료됨"]).desc(["Ashed inquiry status", "종료됨 획득 상태"]),
    morePayable: t(["More Payable", "더 지불 가능"]).desc(["More Payable inquiry status", "더 지불 가능 획득 상태"]),
    waitMorePay: t(["Wait More Pay", "더 지불 대기"]).desc(["Wait More Pay inquiry status", "더 지불 대기 획득 상태"]),
    inquired: t(["Inquired", "완전획득됨"]).desc(["Inquired inquiry status", "완전획득됨 획득 상태"]),
    vip: t(["VIP", "VIP"]).desc(["VIP inquiry status", "VIP 획득 상태"]),
    kicked: t(["Kicked", "킥됨"]).desc(["Kicked inquiry status", "킥됨 획득 상태"]),
  }));
