import { scalarDictionary } from "@akanjs/dictionary";

import type { FileMeta } from "./fileMeta.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["File Meta", "파일 메타"]).desc(["File Meta", "파일 메타"]))
  .model<FileMeta>((t) => ({
    fileId: t(["File ID", "파일 ID"]).desc(["File ID", "파일 ID"]),
    lastModifiedAt: t(["Last Modified At", "수정일"]).desc(["Last Modified At", "수정일"]),
    size: t(["Size", "크기"]).desc(["Size", "크기"]),
  }));
