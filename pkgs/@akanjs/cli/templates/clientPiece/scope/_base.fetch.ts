import type { AppInfo, LibInfo } from "akanjs";

//? The descriptors every scope's signal carries from `akanjs/signal` itself (`base`, `agent`), which no module owns.
//? No `../cnst`: a page under `clientRuntime: "route"` loads this piece on every route, and neither signal has a slice.
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  return `
import { FetchClient } from "akanjs/fetch";
import { fetch, sig } from "../usePage";
import { getSerializedSignalOf } from "../sig" with { type: "macro" };
import type * as signal from "../sig";

Object.assign(sig, FetchClient.build<typeof signal>({}, getSerializedSignalOf("base"), { base: fetch }).sig);
`;
}
