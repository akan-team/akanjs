import { Every } from "@libs/shared/srvkit";
import { Any, dayjs, ID, Upload } from "akanjs/base";
import { endpoint, internal, None, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";
import * as srv from "../srv";

export class FileInternal extends internal(srv.file, () => ({})) {}

export class FileSlice extends slice(srv.file, { guards: { root: None, get: Public, cru: None } }, () => ({})) {}

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  // 가입 전 프로필 이미지(setAppliedImagesOfPrepareUser)와 비로그인 문의 폼 첨부가 이 경로를 쓰므로
  // 공개로 유지한다. 익명 업로드 남용은 인증이 아니라 rate limit/용량 정책으로 막아야 한다
  addFiles: mutation([cnst.File], { fileUpload: true })
    .body("files", [Upload])
    .body("metas", String, { example: `[{"lastModifiedAt":"2024-01-14T15:32:47.766Z","size":0}]` })
    .body("type", String, { example: "user" })
    .body("parentId", ID, { nullable: true })
    .exec(async function (files, metas, type, parentId) {
      const parsedMetas = (global.JSON.parse(metas) as db.FileMeta[]).map((meta) => ({
        ...meta,
        lastModifiedAt: dayjs(meta.lastModifiedAt),
      }));
      return await this.fileService.addFiles(files, parsedMetas, type, parentId);
    }),
  // 서버가 헤드리스 브라우저로 임의 URL을 열기 때문에 무인증이면 내부망 SSRF·브라우저 스폰 남용이 된다.
  // 호출부(File.Util ExportPDF)는 자신의 jwt를 붙인 현재 페이지를 넘기는 로그인 사용자 기능이다
  generatePdf: mutation(Any, { guards: [Every] })
    .body("url", String)
    .exec(async function (url) {
      return await this.fileService.generatePdf(url);
    }),
})) {}
