import { modelDictionary } from "akanjs/dictionary";

import type { Memo, MemoInsight } from "./memo.constant";
import type { MemoFilter } from "./memo.document";
import type { MemoEndpoint, MemoSlice } from "./memo.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Memo", "메모"]).desc(["A note with an optional image", "이미지를 붙일 수 있는 메모"]))
  .model<Memo>((t) => ({
    name: t(["Name", "이름"]).desc(["What the memo says", "메모 내용"]),
    imageUrl: t(["Image", "이미지"]).desc(["The attached image's URL", "붙인 이미지의 URL"]),
  }))
  .insight<MemoInsight>((t) => ({}))
  .query<MemoFilter>((fn) => ({}))
  .sort<MemoFilter>((t) => ({}))
  .slice<MemoSlice>((fn) => ({
    inPublic: fn(["Memo In Public", "공개 메모"])
      .desc(["Every memo", "모든 메모"])
      .arg((t) => ({})),
  }))
  .endpoint<MemoEndpoint>((fn) => ({
    attachMemoImage: fn(["Attach Memo Image", "메모 이미지 붙이기"])
      .desc(["Stores an image and attaches it to the memo", "이미지를 저장하고 메모에 붙입니다"])
      .arg((t) => ({
        files: t(["Image", "이미지"]).desc(["The image to attach", "붙일 이미지"]),
        memoId: t(["Memo Id", "메모 Id"]).desc(["The memo the image goes to", "이미지를 붙일 메모"]),
      })),
  }))
  .error({
    imageMissing: ["Attach an image file", "붙일 이미지 파일이 없습니다."],
    imageRejected: [
      "Attach a PNG, JPEG, WebP or GIF image of at most 5 MB",
      "5MB 이하의 PNG, JPEG, WebP, GIF 이미지만 붙일 수 있습니다.",
    ],
  })
  .translate({});
