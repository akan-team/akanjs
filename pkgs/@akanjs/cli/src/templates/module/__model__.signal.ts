import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  models: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { Public } from "@akanjs/nest";
import { endpoint, internal, slice } from "@akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class ${dict.Model}Internal extends internal(srv.${dict.model}, () => ({})) {}

export class ${dict.Model}Slice extends slice(srv.${dict.model}, { guards: { root: Public, get: Public, cru: Public } }, (init) => ({
  inPublic: init()
    .exec(function () {
      return this.${dict.model}Service.queryAny();
    }),
})) {}

export class ${dict.Model}Endpoint extends endpoint(srv.${dict.model}, () => ({})) {}
`;
}
