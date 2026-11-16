import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  const inheritedNames = libs.length === 0 ? ["base"] : libs;
  const libImports = libs.map((lib) => `import "@libs/${lib}/lib/useClient";\n`).join("");
  const serializedSignal = inheritedNames.map((name) => `...getSerializedSignalOf("${name}")`).join(", ");
  return `
${libImports}import { FetchClient } from "akanjs/fetch";
import * as cnst from "../cnst";
import { fetch, sig } from "../usePage";
import { getSerializedSignalOf } from "../sig" with { type: "macro" };
import type * as signal from "../sig";

Object.assign(sig, FetchClient.build<typeof signal>(cnst, { ${serializedSignal} }, { base: fetch }).sig);
`;
}
