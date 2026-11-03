import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
  models: string;
  sysName: string;
}
interface Options {
  sharedGuards?: boolean;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict, options: Options = {}) {
  const { Model, model } = dict;
  // Admin lives in libs/shared; without it root and cru stay None, shut until the app names a guard of its own.
  const guardImports = options.sharedGuards
    ? `import { Admin } from "@libs/shared/srvkit";\nimport { endpoint, internal, Public, slice } from "akanjs/signal";`
    : `import { endpoint, internal, None, Public, slice } from "akanjs/signal";`;
  const writeGuard = options.sharedGuards ? "Admin" : "None";
  const sliceBody = `(init) => ({
  inPublic: init({ guards: [Public] }).exec(function () {
    return this.${model}Service.queryAny();
  }),
})`;
  return `${guardImports}

import * as srv from "../srv";

${BiomeForm.call("", `export class ${Model}Internal extends internal`, [`srv.${model}`, "({ interval }) => ({})"], " {}")}

${BiomeForm.call("", `export class ${Model}Slice extends slice`, [`srv.${model}`, `{ guards: { root: ${writeGuard}, get: Public, cru: ${writeGuard} } }`, sliceBody], " {}")}

${BiomeForm.call("", `export class ${Model}Endpoint extends endpoint`, [`srv.${model}`, "({ query, mutation }) => ({})"], " {}")}
`;
}
