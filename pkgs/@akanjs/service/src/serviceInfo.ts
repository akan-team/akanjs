import type { Type } from "@akanjs/base";

import { getServiceMeta, getServiceRefs, setServiceRefs } from "./serviceDecorators";

export const serviceInfo = {
  database: new Map<string, Set<Type>>(),
  service: new Map<string, Type>(),
  setDatabase(refName: string, service: Type) {
    const srvSet = serviceInfo.database.get(refName) ?? new Set<Type>();
    srvSet.add(service);
    serviceInfo.database.set(refName, srvSet);
  },
  getDatabase(refName: string) {
    return [...(serviceInfo.database.get(refName) ?? new Set<Type>())];
  },
  setService(refName: string, service: Type) {
    serviceInfo.service.set(refName, service);
  },
  registerServices<Srvs extends { [key: string]: Type }>(services: Srvs): Srvs {
    Object.entries(services).forEach(([serviceName, service]) => {
      const serviceMeta = getServiceMeta(service);
      if (!serviceMeta?.enabled) return;
      const services = getServiceRefs(serviceName);
      setServiceRefs(serviceName, [...services, service]);
    });
    return services;
  },
};
