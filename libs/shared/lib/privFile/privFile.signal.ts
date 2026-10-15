import { endpoint, internal, None, slice } from "akanjs/signal";

import * as srv from "../srv";

export class PrivFileInternal extends internal(srv.privFile, ({ interval }) => ({
  removeStaleUploads: interval(60 * 60 * 1000).exec(async function () {
    await this.privFileService.removeStaleUploads();
  }),
})) {}

export class PrivFileSlice extends slice(srv.privFile, { guards: { root: None, get: None, cru: None } }, () => ({})) {}

export class PrivFileEndpoint extends endpoint(srv.privFile, () => ({})) {}
