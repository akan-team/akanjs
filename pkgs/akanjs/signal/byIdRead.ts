import { NoDocumentError } from "akanjs/document";
import type { EndpointInfo } from "./endpointInfo";

//? Only in the generated `<model>` reads is a missing document the caller's own id; in a write or a service, a bug.
export class ByIdRead {
  static readonly #endpoints = new WeakSet<EndpointInfo>();

  static mark<Info extends EndpointInfo>(endpointInfo: Info): Info {
    ByIdRead.#endpoints.add(endpointInfo);
    return endpointInfo;
  }

  static missed(endpointInfo: EndpointInfo, error: unknown) {
    return error instanceof NoDocumentError && ByIdRead.#endpoints.has(endpointInfo);
  }
}
