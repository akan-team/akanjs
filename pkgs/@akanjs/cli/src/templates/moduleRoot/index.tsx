import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  [key: string]: string;
  model: string;
  Model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo, dict: Dict) {
  const moduleInfo = scanInfo.database.get(dict.model) ?? scanInfo.service.get(dict.model);
  if (!moduleInfo) return null;
  const fileTypes: string[] = [];
  if (moduleInfo.has("template")) fileTypes.push("Template");
  if (moduleInfo.has("unit")) fileTypes.push("Unit");
  if (moduleInfo.has("util")) fileTypes.push("Util");
  if (moduleInfo.has("view")) fileTypes.push("View");
  if (moduleInfo.has("zone")) fileTypes.push("Zone");
  if (fileTypes.length === 0) return null;
  return {
    filename: "index.tsx",
    content: `
${fileTypes.map((type) => `import * as ${type} from "./${dict.Model}.${type}";`).join("\n")}

export const ${dict.Model} = { ${fileTypes.join(", ")} };`,
  };
}
