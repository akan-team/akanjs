import { serviceDictionary } from "@akanjs/dictionary";

import type { LocalFileEndpoint } from "./localFile.signal";

export const dictionary = serviceDictionary(["en", "ko"]).endpoint<LocalFileEndpoint>((fn) => ({
  getBlob: fn(["Get Blob", "Blob 가져오기"]).desc([
    "Get blob data from local file",
    "로컬 파일에서 Blob 데이터 가져오기",
  ]),
}));
