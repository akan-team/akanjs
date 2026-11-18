import { AkanError, ENDPOINT_META } from "akanjs/base";
import type { EndpointCls } from "../../signal/endpoint";
import type { EndpointInfo } from "../../signal/endpointInfo";
import { SignalFailure } from "../../signal/SignalFailure";
import { ModuleSelection } from "../di/moduleSelection";
import type { DiModuleCandidate } from "../di/utils";
import type { HttpRoutes } from "../types";
import { SignalResolver } from "./signal.resolver";

type MethodRoutes = Record<string, (() => Response) | undefined>;

export class UnmountedRoutes {
  //? Security: only where a failure is answered in detail (dev, test, `akan start`). A production 404 stays bare, so a
  //? caller cannot tell a module the deployment turned off from a path nothing declares.
  static answer(routes: HttpRoutes, unmounted: DiModuleCandidate[], reasons: ReadonlyMap<string, string>) {
    if (!SignalFailure.detailed) return;
    const table = routes as Record<string, MethodRoutes | undefined>;
    for (const { refName, module } of unmounted) {
      const reason = reasons.get(refName) ?? "disabled";
      for (const [key, info, defaultPrefix] of UnmountedRoutes.#endpointsOf(module)) {
        if (info.signalOption.globalPrefix !== undefined) continue;
        const method = UnmountedRoutes.#methodOf(info);
        if (!method) continue;
        const path = info.getRoutePath(key, defaultPrefix);
        if (table[path]?.[method]) continue;
        const message = `"${key}" belongs to module "${refName}", which this server did not mount: ${reason}.${
          ModuleSelection.isOwnGate(reason)
            ? ` A signal test mounts it with configureSignalTest({ enableModules: ["${refName}"] }).`
            : ""
        }`;
        table[path] = {
          ...table[path],
          [method]: () => SignalFailure.response(new AkanError("moduleNotMounted", message, { statusCode: 404 })),
        };
      }
    }
  }

  static #endpointsOf(module: DiModuleCandidate["module"]) {
    const classes: EndpointCls[] = [
      module.signal.endpoint,
      ...("constant" in module ? [SignalResolver.resolveSlice(module.signal.slice)] : []),
    ];
    return classes.flatMap((cls) =>
      Object.entries(cls[ENDPOINT_META] as { [key: string]: EndpointInfo }).map(
        ([key, info]) => [key, info, cls.srv.cnst?.refName] as const,
      ),
    );
  }

  static #methodOf(info: EndpointInfo) {
    if (info.type === "query") return "GET";
    if (info.type === "mutation") return info.signalOption.method ?? "POST";
    return null;
  }
}
