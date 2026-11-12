import { NoDocumentError } from "akanjs/document";
import type { EndpointInfo } from "./endpointInfo";
import type { SignalContext } from "./signalContext";

//? A `<model>` or `light<Model>` read missing the id it was asked for is the caller's; a write's stays loud on purpose.
export class ByIdRead {
  static readonly #refNames = new WeakMap<EndpointInfo, string>();

  static mark<Info extends EndpointInfo>(refName: string, endpointInfo: Info): Info {
    ByIdRead.#refNames.set(endpointInfo, refName);
    return endpointInfo;
  }

  static missed(context: SignalContext, error: unknown) {
    if (!(error instanceof NoDocumentError) || !error.lookup) return false;
    const { refName, id } = error.lookup;
    return refName === ByIdRead.#refNames.get(context.endpointInfo) && id === context.args[0];
  }
}
