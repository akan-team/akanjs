import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class GroupedrootInternal extends internal(srv.groupedroot, () => ({})) {}

export class GroupedrootEndpoint extends endpoint(srv.groupedroot, () => ({})) {}
