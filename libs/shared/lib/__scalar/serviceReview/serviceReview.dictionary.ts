import { scalarDictionary } from "@akanjs/dictionary";

import type { ServiceReview } from "./serviceReview.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Service Review", "서비스 리뷰"]).desc(["Service Review", "서비스 리뷰"]))
  .model<ServiceReview>((t) => ({
    score: t(["Score", "점수"]).desc(["Score", "점수"]),
    comment: t(["Comment", "코멘트"]).desc(["Comment", "코멘트"]),
  }));
