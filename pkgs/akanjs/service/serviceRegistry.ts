import { INJECT_META } from "akanjs/base";
import { applyMixins } from "akanjs/common";
import type { AdaptorCls } from "./adapt";
import type { ServiceCls } from "./serve";

/** @deprecated Nothing in akanjs registers into it or reads it; removed in a later minor. */
export class ServiceRegistry {
  static #database = new Map<string, ServiceCls>();
  static #plain = new Map<string, ServiceCls>();
  static #adaptor = new Map<string, AdaptorCls>();
  static setDatabase(refName: string, service: ServiceCls) {
    const existingSrv = ServiceRegistry.#database.get(refName);
    if (existingSrv) {
      applyMixins(existingSrv, [service]);
      Object.assign(existingSrv[INJECT_META], service[INJECT_META]);
    } else ServiceRegistry.#database.set(refName, service);
  }
  static getDatabase(refName: string) {
    return ServiceRegistry.#database.get(refName);
  }
  static setPlain(refName: string, service: ServiceCls) {
    ServiceRegistry.#plain.set(refName, service);
  }
  static setAdaptor(refName: string, adaptor: AdaptorCls) {
    ServiceRegistry.#adaptor.set(refName, adaptor);
  }
}
