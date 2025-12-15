import { JSON } from "@akanjs/base";
import { Req, Res } from "@akanjs/nest";
import { endpoint, internal } from "@akanjs/signal";

import * as srv from "../srv";

export class LocalFileInternal extends internal(srv.localFile, () => ({})) {}

export class LocalFileEndpoint extends endpoint(srv.localFile, ({ query }) => ({
  getBlob: query(JSON, { onlyFor: "restapi", path: "localFile/getBlob/*" })
    .with(Req)
    .with(Res)
    .exec(async function (req, res) {
      const path = req.url.split("/localFile/getBlob/").slice(1).join("/localFile/getBlob/");
      const fileStream = await this.localFileService.readLocalFile(path);
      return fileStream.pipe(res);
    }),
})) {}
