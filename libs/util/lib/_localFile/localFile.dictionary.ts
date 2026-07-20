import { serviceDictionary } from "akanjs/dictionary";

import type { LocalFileEndpoint } from "./localFile.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<LocalFileEndpoint>((fn) => ({
    getBlob: fn(["Get Blob", "Blob 가져오기"]).desc([
      "Get blob data from local file",
      "로컬 파일에서 Blob 데이터 가져오기",
    ]),
  }))
  .error({
    privateFilesNotServed: [
      "Private files are not served through localFile",
      "비공개 파일은 localFile을 통해 제공되지 않습니다",
    ],
  });
