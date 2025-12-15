import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = scanInfo.getDatabaseModules();
  const scalarModules = scanInfo.getScalarModules();
  const serviceModules = scanInfo.getServiceModules();
  return `
import { makeDictionary, makeTrans, registerScalarTrans, registerServiceTrans, registerModelTrans } from "@akanjs/dictionary";

import { allLibs } from "./__lib/lib.dictionary";
${databaseModules.map((module) => `import * as ${module} from "./${module}/${module}.dictionary";`).join("\n")}
${serviceModules.map((module) => `import * as ${module} from "./_${module}/${module}.dictionary";`).join("\n")}
${scalarModules.map((module) => `import * as ${module} from "./__scalar/${module}/${module}.dictionary";`).join("\n")}

${databaseModules.map((module) => `export * as ${module} from "./${module}/${module}.dictionary";`).join("\n")}
${serviceModules.map((module) => `export * as ${module} from "./_${module}/${module}.dictionary";`).join("\n")}
${scalarModules.map((module) => `export * as ${module} from "./__scalar/${module}/${module}.dictionary";`).join("\n")}

${databaseModules.map((module) => `import type * as ${module}Cnst from "./${module}/${module}.constant";`).join("\n")}
${scalarModules.map((module) => `import type * as ${module}Cnst from "./__scalar/${module}/${module}.constant";`).join("\n")}

${databaseModules.map((module) => `import type * as ${module}Doc from "./${module}/${module}.document";`).join("\n")}

${databaseModules.map((module) => `import type * as ${module}Sig from "./${module}/${module}.signal";`).join("\n")}
${serviceModules.map((module) => `import type * as ${module}Sig from "./_${module}/${module}.signal";`).join("\n")}

export const dictionary = makeDictionary(...allLibs, {
  ${[
    ...databaseModules.map((module) => {
      const Module = capitalize(module);
      return `${module}: registerModelTrans<"${module}", ${module}Cnst.${Module}, ${module}Cnst.${Module}Insight, ${module}Doc.${Module}Filter, ${module}Sig.${Module}Slice, ${module}Sig.${Module}Endpoint, typeof ${module}.dictionary>(${module}.dictionary)`;
    }),
    ...scalarModules.map(
      (module) =>
        `${module}: registerScalarTrans<"${module}", ${module}Cnst.${capitalize(module)}, typeof ${module}.dictionary>(${module}.dictionary)`
    ),
    ...serviceModules.map(
      (module) =>
        `${module}: registerServiceTrans<"${module}", ${module}Sig.${capitalize(module)}Endpoint, typeof ${module}.dictionary>(${module}.dictionary)`
    ),
  ].join(",\n  ")}
});
 
export const { Revert, translate, msg, __Dict_Key__, __Error_Key__ } = makeTrans(dictionary);
`;
}
