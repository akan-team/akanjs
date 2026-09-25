import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  const isApp = (scanInfo?.type ?? "lib") === "app";
  return `
import { makePageProto, registerClientRuntime } from "akanjs/client";
import { FetchClient } from "akanjs/fetch";
import * as cnst from "./cnst";
${isApp ? `import { getAllDictionary } from "./dict" with { type: "macro" };\n` : ""}import type * as dict from "./dict";
import { getSerializedSignal } from "./sig" with { type: "macro" };
import type * as signal from "./sig";

${
  isApp
    ? `const dictionary = process.env.AKAN_PUBLIC_RENDER_ENV === "csr" ? getAllDictionary() : {};`
    : `// dict.ts is cumulative, so a lib dictionary is a subset of the mounting app's. Translator state is global,
// so the app's seed already resolves l() here — seeding again would ship the same payload a second time.
const dictionary = {};`
}
const pageProto = makePageProto<typeof dict>(dictionary);
const fetchProto = FetchClient.build<typeof signal>(cnst, getSerializedSignal(), { Err: pageProto.Err });
export const runtime = registerClientRuntime({ ...pageProto, ...fetchProto }, { scope: ${JSON.stringify(scanInfo?.type ?? "lib")} });

export const { msg, Err, usePage, sig, fetch } = runtime;
`;
}
