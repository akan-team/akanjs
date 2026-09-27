import { endpoint, internal, None } from "akanjs/signal";

import * as srv from "../srv";

export class SecurityInternal extends internal(srv.security, () => ({})) {}

export class SecurityEndpoint extends endpoint(srv.security, ({ mutation }) => ({
  // None, not Admin: libs/util cannot reach libs/shared's guards, and an open call is an AES oracle over the app's key.
  encrypt: mutation(String, { guards: [None], mcp: false })
    .body("data", String)
    .exec(async function (data) {
      return await this.securityService.encrypt(data);
    }),
})) {}
