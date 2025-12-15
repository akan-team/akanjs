import type { __Dict_Key__, __Error_Key__ } from "@akanjs/dictionary";
import type * as signal from "@akanjs/signal";

import { makePageProto } from "./makePageProto";

export const { msg, Revert, usePage, fetch, sig, registerClient } = makePageProto<
  typeof __Dict_Key__,
  typeof __Error_Key__,
  typeof signal.fetch,
  { BaseSignal: typeof signal.BaseSignal }
>({});
