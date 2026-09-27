import { Any } from "akanjs/base";
import { endpoint, internal, Req } from "akanjs/signal";

import * as srv from "../srv";

export class LocalFileInternal extends internal(srv.localFile, () => ({})) {}

export class LocalFileEndpoint extends endpoint(srv.localFile, ({ query }) => ({
  getBlob: query(Any, { path: "localFile/getBlob/*" })
    .with(Req)
    .exec(async function (req) {
      const path = req.url.split("/localFile/getBlob/").slice(1).join("/localFile/getBlob/");
      const fileStream = await this.localFileService.readLocalFile(path);
      return new Response(fileStream);
    }),
})) {}
