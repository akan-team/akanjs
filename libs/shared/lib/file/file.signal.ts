import { Admin, Every, Self } from "@libs/shared/srvkit";
import { dayjs, ID, Upload } from "akanjs/base";
import { endpoint, internal, None, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";
import * as srv from "../srv";

export class FileInternal extends internal(srv.file, ({ interval }) => ({
  failStaleUploads: interval(5 * 60 * 1000).exec(async function () {
    await this.fileService.failStaleUploads();
  }),
})) {}

// Ids are guessable (time + process + counter) and a read checks no owner, so a read by id is for a signed-in account
// only, and a batch read is the console's: an open `inIds` let anyone sweep candidate ids for other tenants' file urls.
// A File a page shows reaches it resolved through that page's own record, which these guards never see.
export class FileSlice extends slice(srv.file, { guards: { root: Admin, get: Every, cru: None } }, (init) => ({
  inIds: init({ guards: [Admin], mcp: false })
    .search("ids", [ID])
    .exec(async function (ids) {
      return await this.fileService.queryByIds(ids ?? []);
    }),
})) {}

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  addFiles: mutation([cnst.File], {
    guards: [Every],
    fileUpload: true,
    mcp: false,
    errors: { 400: ["file.error.fileStreamsAndMetasMismatch"], 413: ["file.error.fileTooLarge"] },
  })
    .body("files", [Upload])
    .body("metas", String, { example: `[{"lastModifiedAt":"2024-01-14T15:32:47.766Z","size":0}]` })
    .body("type", String, { example: "user" })
    .body("parentId", ID, { nullable: true })
    .with(Self, { nullable: true })
    .exec(async function (files, metas, type, parentId, self) {
      // Only the two fields the upload client sends are read, so a client-sent `fileId` never names the row it writes.
      const parsedMetas = (global.JSON.parse(metas) as Partial<db.FileMeta>[]).map((meta) => ({
        lastModifiedAt: dayjs(meta.lastModifiedAt),
        size: Number.isFinite(Number(meta.size)) ? Math.max(0, Math.floor(Number(meta.size))) : 0,
      }));
      return await this.fileService.addFiles(files, parsedMetas, type, parentId, self?.id);
    }),
  requestFileUpload: mutation(cnst.FileUploadTicket, { guards: [Every] })
    .body("type", String)
    .body("parentId", ID, { nullable: true })
    .with(Self, { nullable: true })
    .exec(async function (type, parentId, self) {
      return await this.fileService.requestFileUpload(type, parentId ?? undefined, self?.id);
    }),
  // The ticket is the credential, so a caller with no session passes here and the service spends it or refuses.
  //? No `fileUpload: true`: the store's upload action binds to the one endpoint carrying it, which is addFiles.
  addFilesByTicket: mutation([cnst.File], {
    guards: [Public],
    mcp: false,
    rateLimit: { calls: 20 },
    errors: { 401: ["file.error.invalidUploadTicket"], 413: ["file.error.fileTooLarge"] },
  })
    .body("files", [Upload])
    .body("ticket", String)
    .exec(async function (files, ticket) {
      return await this.fileService.addFilesByTicket(files, ticket);
    }),
})) {}
