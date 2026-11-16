import type { AppInfo, LibInfo } from "akanjs";

//? `fetch` and `sig` are declared, not re-exported: the barrel rewrite maps a re-export to `./usePage`, skipping these.
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  return `
import { FetchClient } from "akanjs/fetch";
import * as cnst from "./cnst";
import { fetch as pageFetch, sig as pageSig } from "./usePage";
import { getSerializedSignal } from "./sig" with { type: "macro" };
import type * as signal from "./sig";

Object.assign(pageSig, FetchClient.build<typeof signal>(cnst, getSerializedSignal(), { base: pageFetch }).sig);

export const fetch = pageFetch;
export const sig = pageSig;
export { Err, msg, runtime, usePage } from "./usePage";
`;
}
