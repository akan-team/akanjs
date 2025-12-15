import { BaseSignal } from "./base.signal";
import { baseFetch } from "./baseFetch";
import { fetchOf, makeFetch } from "./gql";
import { signalInfo } from "./signalInfo";

signalInfo.registerSignals(BaseSignal);

export const fetch = makeFetch(baseFetch, {
  ...fetchOf(BaseSignal),
});
