import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class AkanInternal extends internal(srv.akan, () => ({})) {}

export class AkanEndpoint extends endpoint(srv.akan, ({ query }) => ({})) {}
