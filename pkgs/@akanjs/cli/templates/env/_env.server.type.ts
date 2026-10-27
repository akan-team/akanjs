import type { AppInfo, LibInfo } from "akanjs";
import { compareExportNames } from "../facetIndex";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  //? Imports in Biome's order, since `akan lint` lints this gitignored file; the spreads keep getLibs()'s dependency
  //? order, because a later spread overrides an earlier lib's keys.
  const imports = libs
    .toSorted(compareExportNames)
    .map((lib) => `import { env as ${lib}Option } from "@libs/${lib}/server";`);
  return {
    filename: "env.server.type.ts",
    content: libs.length
      ? `${imports.join("\n")}

export const libEnv = {
${libs.map((lib) => `  ...${lib}Option,`).join("\n")}
};
`
      : "export const libEnv = {};\n",
  };
}
