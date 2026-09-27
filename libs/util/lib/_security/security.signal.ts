import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class SecurityInternal extends internal(srv.security, () => ({})) {}

export class SecurityEndpoint extends endpoint(srv.security, ({ mutation }) => ({
  encrypt: mutation(String)
    .body("data", String)
    .exec(async function (data) {
      return await this.securityService.encrypt(data);
    }),
})) {}
