import type { AppInfo, LibInfo } from "@akanjs/devkit";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  return {
    filename: "env.server.type.ts",
    content: `
${libs.length ? libs.map((lib) => `import { env as ${lib}Option } from "@${lib}/server";`).join("\n") : 'import { baseEnv } from "@akanjs/base";'}

export const libEnv = {
${libs.length ? libs.map((lib) => `  ...${lib}Option,`).join("\n") : "  ...baseEnv,"}
};
`,
  };
}
