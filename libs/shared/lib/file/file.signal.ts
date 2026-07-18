import { Any, dayjs, ID, Upload } from "akanjs/base";
import { endpoint, internal, None, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";
import * as srv from "../srv";

export class FileInternal extends internal(srv.file, () => ({})) {}

export class FileSlice extends slice(srv.file, { guards: { root: None, get: Public, cru: None } }, () => ({})) {}

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
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
  generatePdf: mutation(Any)
    .body("url", String)
    .exec(async function (url) {
      return await this.fileService.generatePdf(url);
    }),
})) {}
