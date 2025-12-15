import type { Type } from "@akanjs/base";
import { capitalize, lowerlize } from "@akanjs/common";
import { constantInfo, type ConstantModel, getChildClassRefs } from "@akanjs/constant";
import { Database, databaseModelOf, Mdl } from "@akanjs/document";
import { getServiceMeta, isServiceEnabled, makeProvidersForSrv, ServiceModule, serviceOf } from "@akanjs/service";
import { getGqlMetas, getSigMeta, internal, setSigMeta, signalInfo } from "@akanjs/signal";
import { BullModule } from "@nestjs/bull";
import { DynamicModule, Global, Injectable, Module } from "@nestjs/common";
import { getModelToken, MongooseModule } from "@nestjs/mongoose";
import type { NextFunction, Request, Response } from "express";
import type { default as MeiliSearch } from "meilisearch";
import type { RedisClientType } from "redis";

import { controllerOf } from "./controller";
import { applyQueueSignal, processorOf } from "./processor";
import { resolverOf } from "./resolver";
import { addSchema, hasSchema, schemaOf } from "./schema";
import { applyWebsocketSignal, websocketOf } from "./websocket";

const hasWebsocket = (signal: Type) =>
  getGqlMetas(signal).some((gqlMeta) => ["Message", "Pubsub"].includes(gqlMeta.type));
const hasProcessor = (signal: Type) => getGqlMetas(signal).some((gqlMeta) => gqlMeta.type === "Process");
const filterSrvs = (srvs: { [key: string]: Type | undefined }): { [key: string]: Type } =>
  Object.fromEntries(Object.entries(srvs).filter(([_, srv]) => !!srv)) as unknown as { [key: string]: Type };

interface DatabaseModuleCreateOptions {
  constant: ConstantModel<string, any, any, any, any, any>;
  database: Database<string, any, any, any, any, any, any, any>;
  signal: Type;
  service: Type;
}
export const databaseModuleOf = (
  { constant, database, signal, service }: DatabaseModuleCreateOptions,
  allSrvs: { [key: string]: Type | undefined }
): DynamicModule | null => {
  if (!isServiceEnabled(service)) return null;
  const [modelName, className] = [lowerlize(constant.refName), capitalize(constant.refName)];
  const mongoToken = getModelToken(className);
  const srvRef = serviceOf(service);
  @Global()
  @Module({
    imports: [
      MongooseModule.forFeature([
        {
          name: className,
          schema: hasSchema(constant.full)
            ? addSchema(database.Model, database.Doc, database.Input, database.Middleware)
            : schemaOf(database.Model, database.Doc, database.Middleware),
        },
      ]),
      ...(hasProcessor(signal)
        ? [
            BullModule.registerQueue({
              name: modelName,
              defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
            }),
          ]
        : []),
    ],
    providers: [
      ...(service === srvRef ? [srvRef] : []),
      resolverOf(signal, filterSrvs(allSrvs)),
      ...(hasWebsocket(signal) ? [websocketOf(signal, filterSrvs(allSrvs))] : []),
      ...(hasProcessor(signal) ? [processorOf(signal, filterSrvs(allSrvs))] : []),
      { provide: `${className}Signal`, useClass: makeSigForSrv(signal) },
      {
        provide: `${modelName}Model`,
        useFactory: (model: Mdl<any, any>, redis: RedisClientType, meili: MeiliSearch) => {
          return databaseModelOf(database, model, redis, meili);
        },
        inject: [mongoToken, "REDIS_CLIENT", "MEILI_CLIENT"],
      },
      ...makeProvidersForSrv(srvRef),
    ],
    controllers: [controllerOf(signal, filterSrvs(allSrvs))],
    exports: service === srvRef ? [srvRef] : [],
  })
  class DatabaseModule {}
  return DatabaseModule as unknown as DynamicModule;
};

interface ServiceModuleCreateOptions {
  signal?: Type;
  service: Type;
}
export const serviceModuleOf = (
  { signal, service }: ServiceModuleCreateOptions,
  allSrvs: { [key: string]: Type | undefined }
): DynamicModule | null => {
  if (!isServiceEnabled(service)) {
    if (signal) setSigMeta(signal, Object.assign(getSigMeta(signal), { enabled: false }));
    return null;
  }
  const serviceMeta = getServiceMeta(service);
  if (!serviceMeta) throw new Error(`Service ${service} is not a valid service`);
  const [modelName, className] = [serviceMeta.refName, capitalize(serviceMeta.refName)];
  const srvRef = serviceOf(service);
  @Global()
  @Module({
    imports: signal
      ? [
          ...(hasProcessor(signal)
            ? [
                BullModule.registerQueue({
                  name: modelName,
                  defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
                }),
              ]
            : []),
        ]
      : [],
    providers: [
      ...(service === srvRef ? [srvRef] : []),
      ...(signal
        ? [
            resolverOf(signal, filterSrvs(allSrvs)),
            ...(hasWebsocket(signal) ? [websocketOf(signal, filterSrvs(allSrvs))] : []),
            ...(hasProcessor(signal) ? [processorOf(signal, filterSrvs(allSrvs))] : []),
            { provide: `${className}Signal`, useClass: makeSigForSrv(signal) },
          ]
        : []),
      ...makeProvidersForSrv(srvRef),
    ],
    controllers: signal ? [controllerOf(signal, filterSrvs(allSrvs))] : [],
    exports: service === srvRef ? [srvRef] : [],
  })
  class ServiceModule {}
  return ServiceModule as unknown as DynamicModule;
};

interface ScalarModulesCreateOptions {
  constants: Type[];
}
export const scalarModulesOf = (
  { constants }: ScalarModulesCreateOptions,
  allSrvs: { [key: string]: Type | undefined }
): DynamicModule | null => {
  const signals = constants
    .filter((modelRef) => {
      const childRefs = getChildClassRefs(modelRef);
      return childRefs.some((childRef) => constantInfo.isFull(childRef) || constantInfo.isLight(childRef));
    })
    .map((modelRef) => {
      const refName = constantInfo.getRefName(modelRef);
      class ScalarSignal extends internal(new ServiceModule(refName, allSrvs as { [key: string]: Type }), () => ({})) {}
      signalInfo.registerSignals(ScalarSignal);
      return ScalarSignal;
    });
  @Global()
  @Module({
    imports: [],
    providers: [...signals.map((signal) => resolverOf(signal, filterSrvs(allSrvs)))],
  })
  class ScalarModule {}
  return ScalarModule as unknown as DynamicModule;
};

interface UseGlobalsCreateOptions {
  uses?: { [key: string]: any };
  useAsyncs?: { [key: string]: () => Promise<any> };
  providers?: Type[];
  injects?: { [key: string]: Type };
}
export const useGlobals = ({ uses, useAsyncs, providers = [], injects }: UseGlobalsCreateOptions): DynamicModule => {
  @Global()
  @Module({
    imports: [],
    providers: [
      ...Object.entries(uses ?? {}).map(([key, useValue]) => ({
        provide: capitalize(key),
        useValue: useValue as object,
      })),
      ...Object.entries(useAsyncs ?? {}).map(([key, useFactory]) => ({ provide: capitalize(key), useFactory })),
      ...Object.entries(injects ?? {}).map(([key, inject]) => ({ provide: capitalize(key), useClass: inject })),
      ...providers,
    ],
    exports: [
      ...Object.keys(uses ?? {}).map((key) => capitalize(key)),
      ...Object.keys(useAsyncs ?? {}).map((key) => capitalize(key)),
      ...Object.keys(injects ?? {}).map((key) => capitalize(key)),
    ],
  })
  class GlobalsModule {}
  return GlobalsModule as unknown as DynamicModule;
};

const makeSigForSrv = (sigRef: Type) => {
  @Injectable()
  class Sig {}
  if (hasWebsocket(sigRef)) applyWebsocketSignal(Sig, sigRef);
  if (hasProcessor(sigRef)) applyQueueSignal(Sig, sigRef);
  return Sig;
};

export type Middleware = (req: Request, res: Response, next: NextFunction) => void;
