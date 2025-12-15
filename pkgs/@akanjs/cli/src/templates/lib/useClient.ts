import type { AppInfo, LibInfo } from "@akanjs/devkit";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  return `
import { makePageProto } from "@akanjs/client";

import * as cnst from "./cnst";
import type { __Dict_Key__, __Error_Key__ } from "./dict";
import type * as signal from "./sig";

export const { msg, Revert, usePage, sig, fetch, registerClient } = makePageProto<
  typeof __Dict_Key__,
  typeof __Error_Key__,
  typeof signal.fetch,
  typeof signal
>(cnst);
`;
}
