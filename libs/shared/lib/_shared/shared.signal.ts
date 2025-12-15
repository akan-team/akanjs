import { endpoint, internal } from "@akanjs/signal";

import * as srv from "../srv";

export class SharedInternal extends internal(srv.shared, () => ({})) {}

export class SharedEndpoint extends endpoint(srv.shared, () => ({})) {}
