import { scalarDictionary } from "akanjs/dictionary";

import type { FileUploadTicket } from "./fileUploadTicket.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["File Upload Ticket", "파일 업로드 티켓"]).desc([
      "A one-time credential and the address a caller without a session uploads files to",
      "세션 없는 호출자가 파일을 올릴 주소와 한 번 쓰는 자격 증명",
    ]),
  )
  .model<FileUploadTicket>((t) => ({
    ticket: t(["Ticket", "티켓"]).desc([
      "Send as the `ticket` form field of the upload; it works once",
      "업로드의 `ticket` 폼 필드로 보낸다. 한 번만 쓸 수 있다",
    ]),
    uploadUrl: t(["Upload URL", "업로드 주소"]).desc([
      "Where the multipart/form-data upload is POSTed",
      "multipart/form-data 업로드를 POST할 주소",
    ]),
    expiresAt: t(["Expires At", "만료 시각"]).desc([
      "The ticket is refused after this time",
      "이 시각이 지나면 티켓을 거절한다",
    ]),
  }));
