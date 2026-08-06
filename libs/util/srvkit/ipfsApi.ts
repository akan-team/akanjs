import { adapt } from "akanjs/service";

export interface IpfsApiOptions {
  endpoint: string;
}

export class IpfsApi extends adapt("ipfsApi", ({ env }) => ({
  endpoint: env((option: IpfsApiOptions) => option.endpoint),
})) {
  getHttpsUri(uri: string) {
    return uri.replace("ipfs://", `${this.endpoint}/`);
  }
}
