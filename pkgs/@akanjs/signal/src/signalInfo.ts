import { baseClientEnv, getNonArrayModel, GqlScalarName, scalarNameMap, Type } from "@akanjs/base";
import { lowerlize } from "@akanjs/common";
import { constantInfo } from "@akanjs/constant";

// import { documentInfo } from "@akanjs/document";
import { client } from "./client";
import { databaseFetchOf, serviceFetchOf } from "./fetchInfo";
import {
  ArgsOption,
  ArgType,
  getArgMetas,
  getDefaultArg,
  getGqlMetaMapOnPrototype,
  getGqlMetas,
  getSigMeta,
  setSigMeta,
  setSignalRefOnStorage,
  SliceMeta,
} from "./signalDecorators";

export const signalInfo = {
  database: new Map<string, Type>(),
  service: new Map<string, Type>(),
  serializedSignals: [] as SerializedSignal[],
  setDatabase(refName: string, signal: Type) {
    signalInfo.database.set(refName, signal);
  },
  getDatabase(refName: string) {
    return signalInfo.database.get(refName);
  },
  setRefNameTemp(sigRef: Type, refName: string) {
    Reflect.defineMetadata("signal:refName", refName, sigRef.prototype as object);
  },
  getRefNameTemp(sigRef: Type) {
    const refName = Reflect.getMetadata("signal:refName", sigRef.prototype as object) as string | undefined;
    if (!refName) throw new Error("RefName Not Found");
    return refName;
  },
  setPrefixTemp(sigRef: Type, prefix: string) {
    Reflect.defineMetadata("signal:prefix", prefix, sigRef.prototype as object);
  },
  getPrefixTemp(sigRef: Type) {
    const prefix = Reflect.getMetadata("signal:prefix", sigRef.prototype as object) as string | undefined;
    return prefix;
  },
  setHandlerKey(execFn: (...args: any) => any, key: string) {
    Reflect.defineMetadata("signal:key", key, execFn);
  },
  getHandlerKey(execFn: (...args: any) => any) {
    const key = Reflect.getMetadata("signal:key", execFn) as string | undefined;
    if (!key) throw new Error("Handler key not found");
    return key;
  },
  setService(refName: string, signal: Type) {
    signalInfo.service.set(refName, signal);
  },
  getService(refName: string) {
    return signalInfo.service.get(refName);
  },
  registerSignals<Signals extends Type[]>(...signals: Signals): Signals {
    signals.forEach((sigRef) => {
      const refName = signalInfo.getRefNameTemp(sigRef);
      const signalType = constantInfo.database.has(refName) ? "database" : "service";
      if (signalType === "database") signalInfo.setDatabase(refName, sigRef);
      else signalInfo.setService(refName, sigRef);
    });
    signals.forEach((sigRef) => {
      const refName = signalInfo.getRefNameTemp(sigRef);
      const prefix = signalInfo.getPrefixTemp(sigRef);
      const databaseCnst = constantInfo.getDatabase(refName, { allowEmpty: true });
      const scalarCnst = constantInfo.getScalar(refName, { allowEmpty: true });

      if (databaseCnst) {
        const gqlMetas = getGqlMetas(sigRef);
        const modelName = refName;
        const listName = `${modelName}ListIn`;
        const slices = [
          { refName: modelName, sliceName: modelName, argLength: 1, defaultArgs: [{}] },
          ...gqlMetas
            .filter((gqlMeta) => {
              const name = gqlMeta.signalOption.name ?? gqlMeta.key;
              if (!name.includes(listName)) return false;
              const [retRef, arrDepth] = getNonArrayModel(gqlMeta.returns());
              return constantInfo.getRefName(retRef) === refName && arrDepth === 1;
            })
            .map((gqlMeta) => {
              const name = gqlMeta.signalOption.name ?? gqlMeta.key;
              const sliceName = name.replace(listName, `${modelName}In`);
              const [argMetas] = getArgMetas(sigRef, gqlMeta.key);
              const skipIdx = argMetas.findIndex((argMeta) => argMeta.name === "skip");
              if (skipIdx === -1) throw new Error(`Invalid Args for ${sliceName}`);
              const argLength = skipIdx;
              const queryArgRefs = argMetas.slice(0, skipIdx).map((argMeta) => argMeta.returns());
              const defaultArgs = queryArgRefs.map((queryArgRef, idx) =>
                argMetas[idx].argsOption.nullable ? null : getDefaultArg(queryArgRef as Type)
              );
              return { refName: modelName, sliceName, argLength, defaultArgs };
            }),
        ];
        setSigMeta(sigRef, { returns: () => databaseCnst.full, prefix, slices, refName: modelName, enabled: true });
        setSignalRefOnStorage(modelName, sigRef);
      } else if (scalarCnst) {
        setSigMeta(sigRef, { returns: () => scalarCnst.model, prefix, slices: [], refName, enabled: true });
        setSignalRefOnStorage(refName, sigRef);
      } else {
        setSigMeta(sigRef, { returns: undefined, prefix, slices: [], refName, enabled: true });
        setSignalRefOnStorage(refName, sigRef);
      }
    });
    return signals;
  },
  serialize(sigRef: Type) {
    const refName = signalInfo.getRefNameTemp(sigRef);
    const { slices, prefix } = getSigMeta(sigRef);

    const gqlMetaMap = getGqlMetaMapOnPrototype(sigRef.prototype as object);
    const serializedSignal: SerializedSignal = {
      refName,
      slices,
      prefix,
      endpoint: {},
      // filter: documentInfo.getSerializedFilter(refName),
    };
    gqlMetaMap.forEach((gqlMeta, key) => {
      if (!["Query", "Mutation", "Pubsub", "Message"].includes(gqlMeta.type)) return;
      const [argMetas] = getArgMetas(sigRef, key);
      const [returnRef, arrDepth] = getNonArrayModel(gqlMeta.returns());
      const isGqlScalar = scalarNameMap.has(returnRef);
      const modelType = isGqlScalar ? "scalar" : constantInfo.getModelType(returnRef);
      if (!["input", "full", "light", "insight", "scalar"].includes(modelType))
        throw new Error(`Invalid model type: ${modelType}`);
      const refName = isGqlScalar ? (scalarNameMap.get(returnRef) as string) : constantInfo.getRefName(returnRef);
      serializedSignal.endpoint[key] = {
        type: lowerlize(gqlMeta.type) as "query" | "mutation" | "pubsub" | "message",
        signalOption: {
          nullable: gqlMeta.signalOption.nullable,
          path: gqlMeta.signalOption.path,
          onlyFor: gqlMeta.signalOption.onlyFor,
          partial: gqlMeta.signalOption.partial as string[],
          guards: gqlMeta.signalOption.guards?.map((guard) => guard.name),
          name: gqlMeta.signalOption.name,
        },
        returns: { refName, modelType: modelType as "input" | "full" | "light" | "insight" | "scalar", arrDepth },
        args: argMetas.map((argMeta) => {
          const [argRef, arrDepth] = getNonArrayModel(argMeta.returns() as Type);
          const isGqlScalar = scalarNameMap.has(argRef);
          const modelType = isGqlScalar ? "scalar" : constantInfo.getModelType(argRef);
          if (!["input", "object", "insight", "scalar"].includes(modelType))
            throw new Error(`Invalid model type: ${modelType}`);
          const refName = isGqlScalar ? (scalarNameMap.get(argRef) as string) : constantInfo.getRefName(argRef);
          return {
            type: argMeta.type,
            refName,
            modelType: modelType as "input" | "object" | "insight" | "scalar",
            name: argMeta.name,
            argsOption: argMeta.argsOption,
            arrDepth,
          };
        }),
      };
    });
    return serializedSignal;
  },
  initialize() {
    const databaseSignals = [...signalInfo.database.values()].map((sigRef) => signalInfo.serialize(sigRef));
    const serviceSignals = [...signalInfo.service.values()].map((sigRef) => signalInfo.serialize(sigRef));
    signalInfo.serializedSignals = [...databaseSignals, ...serviceSignals];
    return signalInfo.buildFetch(signalInfo.serializedSignals);
  },
  buildFetch(signals: SerializedSignal[] = [], cnstInfo = constantInfo): object {
    global.signals = signals;
    const databaseSignals = signals.filter((signal) => cnstInfo.database.has(signal.refName));
    const serviceSignals = signals.filter((signal) => !cnstInfo.database.has(signal.refName));
    const fetchComponent = Object.assign(
      { client },
      ...databaseSignals.map((signal) => databaseFetchOf(signal)),
      ...serviceSignals.map((signal) => serviceFetchOf(signal))
    ) as unknown as object;
    return Object.assign(global.fetch, fetchComponent) as object;
  },
  registerClient: async (cnst: any) => {
    const [signals] = await Promise.all([
      (async () =>
        (await (await global.fetch(`${baseClientEnv.serverHttpUri}/getSignals`)).json()) as SerializedSignal[])(),
    ]);
    signalInfo.buildFetch(signals);
    return { fetch, signals };
  },
};

export interface SerializedReturns {
  refName: Exclude<GqlScalarName, "Map" | "Upload"> | (string & {});
  modelType: "input" | "full" | "light" | "insight" | "scalar";
  arrDepth: number;
}
export interface SerializedArg {
  type: ArgType;
  refName: Exclude<GqlScalarName, "Map"> | (string & {});
  modelType: "input" | "object" | "insight" | "scalar";
  name: string;
  argsOption: ArgsOption;
  arrDepth: number;
}
export interface SerializedSignalOption {
  nullable?: boolean;
  path?: string;
  onlyFor?: "restapi" | "graphql";
  partial?: string[];
  guards?: string[];
  name?: string;
}
export interface SerializedEndpoint {
  type: "query" | "mutation" | "pubsub" | "message";
  signalOption?: SerializedSignalOption;
  returns: SerializedReturns;
  args: SerializedArg[];
}
export interface SerializedFilter {
  filter: { [key: string]: SerializedArg[] };
  sortKeys: string[];
}

export interface SerializedSignal {
  refName: string;
  slices: SliceMeta[];
  prefix?: string;
  endpoint: { [key: string]: SerializedEndpoint };
  filter?: SerializedFilter;
}
