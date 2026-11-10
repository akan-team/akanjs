import { LocalOrEdge } from "@apps/minimal/srvkit";
import { ID, Upload } from "akanjs/base";
import { endpoint, internal, None, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class MemoInternal extends internal(srv.memo, ({ interval }) => ({})) {}

export class MemoSlice extends slice(
  srv.memo,
  { guards: { root: None, get: LocalOrEdge, cru: LocalOrEdge }, mcp: false },
  (init) => ({
    inPublic: init({ guards: [LocalOrEdge], mcp: false })
      .live()
      .exec(function () {
        return this.memoService.queryAny();
      }),
  }),
) {}

export class MemoEndpoint extends endpoint(srv.memo, ({ query, mutation }) => ({
  isMemoOpen: query(Boolean, { guards: [Public], mcp: false }).exec(() => new LocalOrEdge().canPass()),
  attachMemoImage: mutation(cnst.Memo, { guards: [LocalOrEdge], fileUpload: true, mcp: false })
    .body("files", [Upload])
    .body("memoId", ID)
    .exec(async function (files, memoId) {
      return await this.memoService.attachImage(memoId, files?.[0]);
    }),
})) {}
