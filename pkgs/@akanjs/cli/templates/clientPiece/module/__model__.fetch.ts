import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  const files = scanInfo?.database.get(dict.model) ?? scanInfo?.service.get(dict.model);
  if (!files?.has("signal")) return null;
  return `
import { FetchClient } from "akanjs/fetch";
import * as cnst from "../cnst";
import { fetch, sig } from "../usePage";
import { getSerializedSignalOf } from "../sig" with { type: "macro" };
import type * as signal from "../sig";

Object.assign(sig, FetchClient.build<typeof signal>(cnst, getSerializedSignalOf("${dict.model}"), { base: fetch }).sig);
`;
}
