import type { AppInfo, LibInfo } from "akanjs";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = [...scanInfo.database.entries()]
    .filter(([_, files]) => files.has("signal"))
    .map(([module]) => module);
  const serviceModules = [...scanInfo.service.entries()]
    .filter(([_, files]) => files.has("signal"))
    .map(([module]) => module);
  const libs = scanInfo.getLibs();

  const signalNames = [...(libs.length === 0 ? ["base"] : libs), ...databaseModules, ...serviceModules];
  const serverSignalClass = (module: string) =>
    `export class ${capitalize(module)} extends serverSignal(${module}Sig.${capitalize(module)}Endpoint, ${module}Sig.${capitalize(module)}Internal) {}`;

  return `
import { FetchClient, type FetchClientType } from "akanjs/fetch";
import { SignalRegistry, serverSignal${libs.length === 0 ? ", fetch as base" : ""} } from "akanjs/signal";
import { Err } from "./dict";
${libs.map((lib) => `import { fetch as ${lib} } from "@libs/${lib}/lib/sig";`).join("\n")}

${databaseModules.map((module) => `import * as ${module}Sig from "./${module}/${module}.signal";`).join("\n")}
${serviceModules.map((module) => `import * as ${module}Sig from "./_${module}/${module}.signal";`).join("\n")}

${databaseModules.map((module) => `export * from "./${module}/${module}.signal";`).join("\n")}
${serviceModules.map((module) => `export * from "./_${module}/${module}.signal";`).join("\n")}

${databaseModules.map(serverSignalClass).join("\n")}
${serviceModules.map(serverSignalClass).join("\n")}

${databaseModules.map((module) => `export const ${module} = SignalRegistry.registerDatabase("${module}" as const, ${module}Sig.${capitalize(module)}Internal, ${module}Sig.${capitalize(module)}Endpoint, ${module}Sig.${capitalize(module)}Slice, ${capitalize(module)}, "${scanInfo.name}");`).join("\n")}
${serviceModules.map((module) => `export const ${module} = SignalRegistry.registerService("${module}" as const, ${module}Sig.${capitalize(module)}Internal, ${module}Sig.${capitalize(module)}Endpoint, ${capitalize(module)}, "${scanInfo.name}");`).join("\n")}

export const fetchSignals = [${signalNames.join(", ")}] as const;
export type Fetch = FetchClientType<typeof fetchSignals>;
export const fetch = FetchClient.from(...fetchSignals) as unknown as Fetch;
// A failure restored from another process is this scope's own Err, so a server hop that rethrows one keeps its
// dictionary key and data instead of answering the original caller with Internal Server Error.
fetch.setErrorConstructor(Err);

export const getSerializedSignal = () => fetch.serializedSignal
`;
}
