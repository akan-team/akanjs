import type { AppInfo, LibInfo } from "akanjs";

const handedOver = (scanInfo: AppInfo | LibInfo): string[] => [
  ...[...scanInfo.getLibInfos().values()].flatMap(handedOver),
  ...[...scanInfo.database.entries()].filter(([, fileTypes]) => fileTypes.has("signal")).map(([model]) => model),
];

//? A CSR, MCP App or native bundle reads the root layout too and renders no handoff a server wrote: nothing registers.
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (scanInfo?.type !== "app") return null;
  const models = [...new Set(handedOver(scanInfo))].sort();
  const imports = models.map((model, index) => `import { reference as ref${index} } from "./${model}.ref";\n`);
  const entries = models.map((model, index) => `${JSON.stringify(model)}: ref${index}`);
  return `
import { FetchClient } from "akanjs/fetch";
${imports.join("")}
if (process.env.AKAN_PUBLIC_RENDER_ENV !== "csr") FetchClient.setModelRuntimes({${entries.length ? ` ${entries.join(", ")} ` : ""}});
`;
}
