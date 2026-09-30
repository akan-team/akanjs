import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  const databaseModules = [...scanInfo.database.entries()].filter(([_, files]) => files.has("service"));
  const serviceModules = [...scanInfo.service.entries()].filter(([_, files]) => files.has("service"));
  const scalarModules = [...scanInfo.scalar.entries()];
  return `import { ${scanInfo.type === "app" ? "AkanServer, " : ""}AkanLib } from "akanjs/server";
import * as cnst from "./lib/cnst";
import * as db from "./lib/db";
import * as sig from "./lib/sig";
import * as srv from "./lib/srv";
import { option } from "./lib/option";
${scanInfo.type === "app" ? libs.map((lib) => `import { lib as ${lib} } from "@libs/${lib}/server";`).join("\n") : ""}
${scanInfo.type === "app" ? `import { env } from "./env/env.server";` : ""}

export const lib = new AkanLib("${scanInfo.name}", {
  databases: [
${databaseModules.map(([model]) => `    { constant: cnst.${model}, database: db.${model}, signal: sig.${model}, service: srv.${model} },`).join("\n")}
  ],
  services: [
${serviceModules.map(([model]) => `    { service: srv.${model}, signal: sig.${model} },`).join("\n")}
  ],
  scalars: [
${scalarModules.map(([model]) => `    { constant: cnst.${model}, database: db.${model} },`).join("\n")}
  ],
  option,
});

${scanInfo.type === "app" ? `export const server = new AkanServer("${scanInfo.name}", env, undefined${libs.length ? `, ${libs.join(", ")}` : ""}, lib);` : ""}

${scanInfo.type === "lib" ? `export { env } from "./env/env.server.testing";` : ""}
export * as db from "./lib/db";
export * as srv from "./lib/srv";
export * as sig from "./lib/sig";
export * as option from "./lib/option";
export * as cnst from "./lib/cnst";
export { fetch } from "./lib/sig";
export { dictionary } from "./lib/dict";
export * as dict from "./lib/dict";
`;
}
