import { ID, JSON, Upload } from "@akanjs/base";
import { None, Public } from "@akanjs/nest";
import { endpoint, internal, slice } from "@akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";
import * as srv from "../srv";

export class FileInternal extends internal(srv.file, () => ({})) {}

export class FileSlice extends slice(srv.file, { guards: { root: None, get: Public, cru: None } }, () => ({})) {}

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  addFiles: mutation([cnst.File], { onlyFor: "graphql" })
    .body("files", [Upload])
    .body("metas", [cnst.FileMeta])
    .body("type", String, { example: "user" })
    .body("parentId", ID, { nullable: true })
    .exec(async function (files, metas, type, parentId) {
      return await this.fileService.addFiles(files, metas, type, parentId ?? undefined);
    }),
  addFilesRestApi: mutation([cnst.File], { onlyFor: "restapi" })
    .body("files", [Upload])
    .body("metas", String, { example: `[{"lastModifiedAt":"2024-01-14T15:32:47.766Z","size":0}]` })
    .body("type", String, { example: "user" })
    .body("parentId", ID, { nullable: true })
    .exec(async function (files, metas, type, parentId) {
      return await this.fileService.addFiles(files, global.JSON.parse(metas) as db.FileMeta[], type, parentId);
    }),
  generatePdf: mutation(JSON)
    .body("url", String)
    .exec(async function (url) {
      return await this.fileService.generatePdf(url);
    }),
})) {}
