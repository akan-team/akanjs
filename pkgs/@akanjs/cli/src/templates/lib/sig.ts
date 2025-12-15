import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = [...scanInfo.database.entries()]
    .filter(([_, files]) => files.has("signal"))
    .map(([module]) => module);
  const scalarConstantModules = [...scanInfo.scalar.entries()]
    .filter(([_, files]) => files.has("constant"))
    .map(([module]) => module);
  const serviceModules = [...scanInfo.service.entries()]
    .filter(([_, files]) => files.has("signal"))
    .map(([module]) => module);
  return `
import { fetchOf, gqlOf, makeFetch, mergeSignals, serverSignalOf, signalInfo } from "@akanjs/signal";

import { root, libFetches } from "./__lib/lib.signal";
import * as cnst from "./cnst";
import * as db from "./db";

${[...scanInfo.database.entries()]
  .filter(([_, files]) => files.has("signal"))
  .map(([module]) => `import * as ${module}Sig from "./${module}/${module}.signal";`)
  .join("\n")}
${[...scanInfo.service.entries()]
  .filter(([_, files]) => files.has("signal"))
  .map(([module]) => `import * as ${module}Sig from "./_${module}/${module}.signal";`)
  .join("\n")}

${[...scanInfo.database.entries()]
  .filter(([_, files]) => files.has("signal"))
  .map(([module]) => `export * from "./${module}/${module}.signal";`)
  .join("\n")}
${[...scanInfo.service.entries()]
  .filter(([_, files]) => files.has("signal"))
  .map(([module]) => `export * from "./_${module}/${module}.signal";`)
  .join("\n")}

${[...scanInfo.database.entries()]
  .filter(([_, files]) => files.has("signal"))
  .map(
    ([module]) =>
      `export class ${capitalize(module)}Signal extends mergeSignals(${module}Sig.${capitalize(module)}Endpoint, ${module}Sig.${capitalize(module)}Internal, ${module}Sig.${capitalize(module)}Slice) {}`
  )
  .join("\n")}
${[...scanInfo.service.entries()]
  .filter(([_, files]) => files.has("signal"))
  .map(
    ([module]) =>
      `export class ${capitalize(module)}Signal extends mergeSignals(${module}Sig.${capitalize(module)}Endpoint, ${module}Sig.${capitalize(module)}Internal) {}`
  )
  .join("\n")}

${[...scanInfo.database.entries()]
  .filter(([_, files]) => files.has("signal"))
  .map(([module]) => `export class ${capitalize(module)} extends serverSignalOf(${capitalize(module)}Signal) {}`)
  .join("\n")}
${[...scanInfo.service.entries()]
  .filter(([_, files]) => files.has("signal"))
  .map(([module]) => `export class ${capitalize(module)} extends serverSignalOf(${capitalize(module)}Signal) {}`)
  .join("\n")}

const signals = signalInfo.registerSignals(
${[...databaseModules, ...serviceModules].map((module) => `  ${capitalize(module)}Signal,`).join("\n")}
);
export const serializedSignals = signals.map((signal) => signalInfo.serialize(signal));

${databaseModules.map((module) => `export const ${module} = gqlOf(cnst.${module}, db.${module}.Filter, ${capitalize(module)}Signal);`).join("\n")}

export const fetch = makeFetch(...libFetches, {
${databaseModules.map((module) => `...${module},`).join("\n")}
${serviceModules.map((module) => `...fetchOf(${capitalize(module)}Signal),`).join("\n")}
});
`;
}
