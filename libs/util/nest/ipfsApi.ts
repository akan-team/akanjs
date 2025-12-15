// import { Logger } from "@akanjs/common";

export interface IpfsOptions {
  endpoint: string;
}

export class IpfsApi {
  // readonly #logger = new Logger("IpfsApi");
  readonly #options: IpfsOptions;
  constructor(options: IpfsOptions) {
    this.#options = options;
  }
  getHttpsUri(uri: string) {
    return uri.replace("ipfs://", `${this.#options.endpoint}/`);
  }
}
