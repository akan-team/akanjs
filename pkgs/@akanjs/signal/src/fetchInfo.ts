/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
import { BaseInsight, BaseObject, DataList, dayjs, isGqlScalar } from "@akanjs/base";
import { capitalize, FetchPolicy, Logger, lowerlize } from "@akanjs/common";
import { constantInfo, makeCrystalize, ProtoFile, serializeArg } from "@akanjs/constant";
import type { FilterInstance } from "@akanjs/document";

import { Client } from "./client";
import { FetchInitForm, mutate, query, setGqlOnStorage } from "./gql";
import { getGqlStr, graphql } from "./graphql";
import { SerializedSignal } from "./signalInfo";

declare global {
  // Set the type of global.builtFetch to {[key: string]: unknown}
  // This allows dynamic access to any property on builtFetch with unknown type

  var builtFetch: typeof global.fetch & { client: Client } & { [key: string]: (...args: any[]) => Promise<any> };
}

export const serviceFetchOf = <Fetch = { [key: string]: any }>(signal: SerializedSignal): Fetch => {
  const fetch = {} as Fetch;
  Object.entries(signal.endpoint).forEach(([key, endpoint]) => {
    const returnRef = constantInfo.getModelRef(endpoint.returns.refName, endpoint.returns.modelType);
    const isScalar = isGqlScalar(returnRef);
    if (endpoint.type === "message") {
      const emitEvent = function (this: { client: Client }, ...args: any[]) {
        const fetchPolicy =
          (args[endpoint.args.length] as FetchPolicy | undefined) ?? ({ crystalize: true } as FetchPolicy);
        if (!this.client.io && !fetchPolicy.url) {
          Logger.warn(`${key} emit suppressed - socket is not connected`);
          return;
        }
        const message = Object.fromEntries(
          endpoint.args.map((arg, idx) => {
            const argRef = constantInfo.getModelRef(arg.refName, arg.modelType);
            return [arg.name, serializeArg(argRef, arg.arrDepth, args[idx], arg.argsOption) ?? null];
          })
        );
        if (fetchPolicy.transport === "udp") {
          if (!this.client.udp) throw new Error("UDP is not set");
          const uri = fetchPolicy.url ?? "udpout:localhost:4000";
          const [host, port] = uri.split(":").slice(1);
          this.client.udp.send(JSON.stringify(message), parseInt(port), host);
          Logger.debug(`udp emit: ${key}: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")}`);
          return;
        } else {
          const io = this.client.getIo(fetchPolicy.url);
          void this.client.waitUntilWebSocketConnected(fetchPolicy.url).then(() => {
            io.emit(key, message);
            Logger.debug(`socket emit: ${key}: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")}`);
          });
        }
      };
      const listenEvent = function (
        this: { client: Client },
        handleEvent: (data: object) => any,
        fetchPolicy: FetchPolicy = {}
      ) {
        const crystalize = (data) => {
          if (isScalar) {
            if (returnRef.prototype === Date.prototype) return dayjs(data as Date);
            else return data as object;
          } else if (Array.isArray(data)) return data.map((d) => crystalize(d) as object) as object[];
          else return makeCrystalize(returnRef)(data as object) as object;
        };
        const handle = (data) => {
          Logger.debug(`socket listened: ${key}: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")}`);
          handleEvent(crystalize(data) as object);
        };
        const io = this.client.getIo(fetchPolicy.url);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.client.waitUntilWebSocketConnected(fetchPolicy.url).then(() => {
          io.removeListener(key, handle);
          io.on(key, handle);
          Logger.debug(`socket listen start: ${key}: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")}`);
        });
        return async () => {
          await this.client.waitUntilWebSocketConnected(fetchPolicy.url);
          Logger.debug(`socket listen end: ${key}: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")}`);
          io.removeListener(key, handle);
        };
      };
      fetch[key] = emitEvent;
      fetch[`listen${capitalize(key)}`] = listenEvent;
    } else if (endpoint.type === "pubsub") {
      const makeRoomId = (gqlKey: string, argValues: any[]) => `${gqlKey}-${argValues.join("-")}`;
      const crystalize = (data) => {
        if (isScalar) {
          if (returnRef.prototype === Date.prototype) return dayjs(data as Date);
          else return data as object;
        } else if (Array.isArray(data)) return data.map((d) => crystalize(d) as object) as object[];
        else return makeCrystalize(returnRef)(data as object) as object;
      };
      const subscribeEvent = function (this: { client: Client }, ...args) {
        const onData = args[endpoint.args.length] as (data: any) => any;
        const fetchPolicy =
          (args[endpoint.args.length + 1] as FetchPolicy | undefined) ?? ({ crystalize: true } as FetchPolicy);
        const message = Object.fromEntries(
          endpoint.args.map((arg, idx) => {
            const argRef = constantInfo.getModelRef(arg.refName, arg.modelType);
            return [arg.name, serializeArg(argRef, arg.arrDepth, args[idx], arg.argsOption) ?? null];
          })
        );
        const handleEvent = (data: { __subscribe__: boolean }) => {
          if (data.__subscribe__) return; // ack
          onData(crystalize(data) as object);
        };
        const roomId = makeRoomId(
          key,
          endpoint.args.map((arg) => message[arg.name])
        );
        const io = this.client.getIo(fetchPolicy.url);
        void this.client.waitUntilWebSocketConnected(fetchPolicy.url).then(() => {
          Logger.debug(`socket subscribe start: ${key}: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")}`);
          io.subscribe({ key, roomId, message, handleEvent });
        });

        return async () => {
          //! 앱에서 다른 앱 넘어갈 때 언마운트 되버리면서 subscribe가 끊기는 일이 있음.
          await this.client.waitUntilWebSocketConnected(fetchPolicy.url);
          Logger.debug(`socket unsubscribe: ${key}: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")}`);
          io.unsubscribe(roomId, handleEvent);
        };
      };
      fetch[`subscribe${capitalize(key)}`] = subscribeEvent;
    } else if (["query", "mutation"].includes(endpoint.type)) {
      const name = endpoint.signalOption?.name ?? key;
      const makeReq = ({ resolve }: { resolve: boolean }) =>
        async function (this: { client: Client }, ...args) {
          Logger.debug(`fetch: ${key} start: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")}`);
          const now = Date.now();
          const lightenedReturnRef =
            isScalar || endpoint.returns.arrDepth === 0
              ? returnRef
              : endpoint.returns.modelType === "full"
                ? constantInfo.getDatabase(endpoint.returns.refName).light
                : returnRef;
          const fetchPolicy =
            (args[endpoint.args.length] as FetchPolicy | undefined) ?? ({ crystalize: true } as FetchPolicy);
          const partial = fetchPolicy.partial ?? endpoint.signalOption?.partial;
          const crystalize = (data) => {
            if (fetchPolicy.crystalize === false) return data as object;
            if (isScalar) {
              if (lightenedReturnRef.prototype === Date.prototype) return dayjs(data as Date);
              else return data as object;
            } else if (Array.isArray(data)) return data.map((d) => crystalize(d) as object) as object[];
            else return makeCrystalize(lightenedReturnRef, { partial })(data as object) as object;
          };
          try {
            const res = (
              (await (endpoint.type === "query" ? query : mutate)(
                this.client,
                graphql(getGqlStr(returnRef, key, endpoint, lightenedReturnRef, partial)),
                Object.fromEntries(
                  endpoint.args.map((arg, idx) => {
                    const argRef = constantInfo.getModelRef(arg.refName, arg.modelType);
                    return [arg.name, serializeArg(argRef, arg.arrDepth, args[idx], arg.argsOption) ?? null];
                  })
                ),
                fetchPolicy
              )) as unknown as { [key: string]: object }
            )[name];
            const data = resolve ? (crystalize(res) as object) : res;
            Logger.debug(`fetch: ${key} end: ${dayjs().format("YYYY-MM-DD HH:mm:ss.SSS")} ${Date.now() - now}ms`);
            return data;
          } catch (e) {
            Logger.error(`fetch: ${key} error: ${e}`);
            throw e;
          }
        };
      const reqFn = makeReq({ resolve: true }) as (...args: any[]) => Promise<object>;
      const reqFnWithoutResolve = makeReq({ resolve: false });
      fetch[name] = async function (this: { client: Client }, ...args) {
        return (await reqFn.apply(this, args)) as Promise<object>;
      };
      fetch[`_${name}`] = async function (this: { client: Client }, ...args) {
        return (await reqFnWithoutResolve.apply(this, args)) as Promise<object>;
      };
    } else throw new Error(`Invalid endpoint type: ${endpoint.type}`);
  });
  return fetch;
};

export const databaseFetchOf = <Fetch = { [key: string]: any }>(
  signal: SerializedSignal,
  option: { overwrite?: { [key: string]: any } } = {}
): Fetch => {
  type Full = BaseObject;
  interface Input {
    [key: string]: any;
  }
  type Light = BaseObject;
  interface Insight {
    count: number;
  }
  type Filter = FilterInstance;
  const cnst = constantInfo.getDatabase(signal.refName);
  const [fieldName, className] = [lowerlize(signal.refName), capitalize(signal.refName)];
  const names = {
    refName: signal.refName,
    model: fieldName,
    Model: className,
    _model: `_${fieldName}`,
    lightModel: `light${className}`,
    _lightModel: `_light${className}`,
    defaultModel: `default${className}`,
    defaultModelInsight: `default${className}Insight`,
    mergeModel: `merge${className}`,
    viewModel: `view${className}`,
    getModelView: `get${className}View`,
    modelView: `${fieldName}View`,
    modelViewAt: `${fieldName}ViewAt`,
    editModel: `edit${className}`,
    getModelEdit: `get${className}Edit`,
    modelEdit: `${fieldName}Edit`,
    listModel: `list${className}`,
    modelList: `${fieldName}List`,
    modelObjList: `${fieldName}ObjList`,
    modelInsight: `${fieldName}Insight`,
    modelObjInsight: `${fieldName}ObjInsight`,
    updateModel: `update${className}`,
    modelObj: `${fieldName}Obj`,
    _modelList: `_${fieldName}List`,
    modelInit: `${fieldName}Init`,
    pageOfModel: `pageOf${className}`,
    lastPageOfModel: `lastPageOf${className}`,
    limitOfModel: `limitOf${className}`,
    queryArgsOfModel: `queryArgsOf${className}`,
    sortOfModel: `sortOf${className}`,
    modelInitAt: `${fieldName}InitAt`,
    initModel: `init${className}`,
    getModelInit: `get${className}Init`,
    addModelFiles: `add${className}Files`,
    addFiles: `addFiles`,
    modelSortKeys: `${fieldName}SortKeys`,
  };
  const fetch = serviceFetchOf(signal);
  const fetchInstance = typeof global !== "undefined" ? global.fetch : window.fetch;
  const util = {
    // TODO: migrate file endpoint to shared
    [names.addModelFiles]: async (files: FileList, id?: string, option?: FetchPolicy) => {
      const metas = Array.from(files).map((file) => ({ lastModifiedAt: new Date(file.lastModified), size: file.size }));
      //! will not work properly
      return await (fetchInstance[names.addFiles] as (...args: any[]) => Promise<ProtoFile[]>)(
        files,
        metas,
        names.model,
        id,
        option
      );
    },
    [names.mergeModel]: async (modelOrId: Full | string, data: Partial<Full>, option?: FetchPolicy) => {
      const model =
        typeof modelOrId === "string"
          ? await (fetchInstance[names._model] as (...args: any[]) => Promise<Full>)(modelOrId)
          : modelOrId;
      const input = (cnst.purify as (m: any) => Input | null)({ ...model, ...data });
      if (!input) throw new Error("Error");
      return await (fetchInstance[names.updateModel] as (...args: any[]) => Promise<Full>)(model.id, input, option);
    },
    [names.viewModel]: async (id: string, option?: FetchPolicy) => {
      const modelObj = await (fetchInstance[names._model] as (...args: any[]) => Promise<Full>)(id, option);
      return {
        [names.model]: (cnst.crystalize as (...args: any[]) => Full)(modelObj),
        [names.modelView]: {
          refName: names.model,
          [names.modelObj]: modelObj,
          [names.modelViewAt]: new Date(),
        },
      };
    },
    [names.getModelView]: async (id: string, option?: FetchPolicy) => {
      const modelView = await (fetchInstance[names._model] as (...args: any[]) => Promise<Full>)(id, option);
      return {
        refName: names.model,
        [names.modelObj]: modelView,
        [names.modelViewAt]: new Date(),
      };
    },

    [names.editModel]: async (id: string, option?: FetchPolicy) => {
      const modelObj = await (fetchInstance[names._model] as (...args: any[]) => Promise<Full>)(id, option);
      return {
        [names.model]: (cnst.crystalize as (...args: any[]) => Full)(modelObj),
        [names.modelEdit]: {
          refName: names.model,
          [names.modelObj]: modelObj,
          [names.modelViewAt]: new Date(),
        },
      };
    },
    [names.getModelEdit]: async (id: string, option?: FetchPolicy) => {
      const modelEdit = await (fetchInstance[names.editModel] as (...args: any[]) => Promise<Full>)(id, option);
      return modelEdit[names.modelEdit] as object;
    },
    [names.modelSortKeys]: signal.filter?.sortKeys,
  };
  const sliceUtil = Object.fromEntries(
    signal.slices.reduce((acc, { sliceName, argLength, defaultArgs }) => {
      const namesOfSlice = {
        modelList: sliceName.replace(names.model, names.modelList), // modelListInSelf
        modelInsight: sliceName.replace(names.model, names.modelInsight), // modelInsightInSelf
        modelInit: sliceName.replace(names.model, names.modelInit), // modelInitInSelf
        initModel: sliceName.replace(names.model, names.initModel), // initModelInSelf
        getModelInit: sliceName.replace(names.model, names.getModelInit), // getModelInitInSelf
      };
      const getInitFn = async (...args: any[]) => {
        const queryArgLength = Math.min(args.length, argLength);
        const queryArgs = [
          ...new Array(queryArgLength).fill(null).map((_, i) => args[i] as object),
          ...(queryArgLength < argLength
            ? new Array(argLength - queryArgLength)
                .fill(null)
                .map((_, i) => (defaultArgs[i + queryArgLength] ?? null) as object)
            : []),
        ];
        const fetchInitOption = (args[argLength] ?? {}) as FetchInitForm<Input, Full, Filter> & FetchPolicy;
        const { page = 1, limit = 20, sort = "latest", insight } = fetchInitOption;
        const skip = (page - 1) * limit;
        const [modelObjList, modelObjInsight] = await Promise.all([
          (fetchInstance[`_${namesOfSlice.modelList}`] as (...args: any[]) => Promise<Light[]>)(
            ...queryArgs,
            skip,
            limit,
            sort,
            fetchInitOption
          ),
          (fetchInstance[`_${namesOfSlice.modelInsight}`] as (...args: any[]) => Promise<Insight>)(
            ...queryArgs,
            fetchInitOption
          ),
        ]);
        const count = (modelObjInsight as BaseInsight).count;
        return {
          // Client Component용
          refName: names.model,
          sliceName,
          argLength,
          [names.modelObjList]: modelObjList,
          [names.modelObjInsight]: modelObjInsight,
          [names.pageOfModel]: page,
          [names.lastPageOfModel]: Math.max(Math.floor((count - 1) / limit) + 1, 1),
          [names.limitOfModel]: limit,
          [names.queryArgsOfModel]: JSON.parse(JSON.stringify(queryArgs)) as object,
          [names.sortOfModel]: sort,
          [names.modelInitAt]: new Date(),
        };
      };
      const initFn = async function (...args: any[]) {
        const modelInit = await getInitFn(...(args as object[]));
        const modelObjList = modelInit[names.modelObjList] as Light[];
        const modelObjInsight = modelInit[names.modelObjInsight] as Insight;
        const modelList = new DataList(
          modelObjList.map((modelObj) => (cnst.lightCrystalize as (obj: any) => Light)(modelObj))
        );
        const modelInsight = (cnst.crystalizeInsight as (obj: any) => Insight)(modelObjInsight);
        return {
          [namesOfSlice.modelList]: modelList, // Server Component용
          [namesOfSlice.modelInsight]: modelInsight, // Server Component용
          [namesOfSlice.modelInit]: modelInit,
        };
      };
      return [...acc, [namesOfSlice.getModelInit, getInitFn], [namesOfSlice.initModel, initFn]];
    }, [])
  ) as object;
  const modelGql = Object.assign(fetch, { ...util, ...sliceUtil });
  setGqlOnStorage(signal.refName, modelGql);
  return modelGql as Fetch;
};
