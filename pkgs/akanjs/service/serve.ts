import { type Cls, INJECT_META } from "akanjs/base";
import { applyMixins, capitalize, Logger, lowerlize } from "akanjs/common";
import type { DatabaseModel } from "akanjs/document";

import {
  type ExtractInjectInfoObject,
  type InjectBuilder,
  InjectInfo,
  type InjectType,
  injectionBuilder,
} from "./injectInfo";
import type { DatabaseService, DatabaseServiceForModel } from "./types";

interface ServiceOptions {
  enabled?: boolean;
  serverMode?: "batch" | "federation";
}
export type ServiceType = "database" | "plain";

type DatabaseServiceData = Record<string, unknown>;
type DatabaseServiceDoc = Record<string, unknown>;
type DatabaseServicePatch = Partial<DatabaseServiceDoc>;

const avoidKeys = new Set([
  "onInit",
  "onDestroy",
  "_libsOnInit",
  "_libsOnDestroy",
  "_preCreate",
  "_postCreate",
  "_preUpdate",
  "_postUpdate",
  "_preRemove",
  "_postRemove",
  "_libsPreCreate",
  "_libsPostCreate",
  "_libsPreUpdate",
  "_libsPostUpdate",
  "_libsPreRemove",
  "_libsPostRemove",
]);

export interface Service {
  readonly logger: Logger;
  // readonly connection: Connection;
  onInit(): Promise<void>;
  _libsOnInit(): Promise<void>;
  onDestroy(): Promise<void>;
  _libsOnDestroy(): Promise<void>;
}

export type ServiceCls<
  RefName extends string = string,
  // biome-ignore lint/complexity/noBannedTypes: `{}` keeps generated service types from gaining object prototype keys.
  Methods = {},
  // biome-ignore lint/complexity/noBannedTypes: `{}` keeps services with no injections assignable.
  InjectMap extends { [key: string]: InjectInfo } = {},
> = Cls<
  Methods & ExtractInjectInfoObject<InjectMap> & Service,
  {
    readonly refName: RefName;
    readonly type: ServiceType;
    readonly [INJECT_META]: InjectMap;
    readonly enabled: boolean;
  }
>;

export function serve<RefName extends string, Injection extends InjectBuilder>(
  refName: RefName,
  injectBuilder: Injection,
  ...extendSrvs: Cls[]
  // biome-ignore lint/complexity/noBannedTypes: `{}` preserves plain service method inference.
): ServiceCls<RefName, {}, ReturnType<Injection>>;
export function serve<RefName extends string, Injection extends InjectBuilder>(
  refName: RefName,
  option: ServiceOptions,
  injectBuilder: Injection,
  ...extendSrvs: Cls[]
  // biome-ignore lint/complexity/noBannedTypes: `{}` preserves plain service method inference.
): ServiceCls<RefName, {}, ReturnType<Injection>>;
export function serve<Db extends DatabaseModel, Injection extends InjectBuilder, LibSrvs extends Cls[] = []>(
  db: Db,
  injectBuilder: Injection,
  ...extendSrvs: LibSrvs
): ServiceCls<Db["refName"], DatabaseServiceForModel<Db, LibSrvs>, ReturnType<Injection>>;
export function serve<Db extends DatabaseModel, Injection extends InjectBuilder, LibSrvs extends Cls[] = []>(
  db: Db,
  option: ServiceOptions,
  injectBuilder: Injection,
  ...extendSrvs: LibSrvs
): ServiceCls<Db["refName"], DatabaseServiceForModel<Db, LibSrvs>, ReturnType<Injection>>;

export function serve(
  refNameOrDb: string | DatabaseModel,
  optionOrInjectBuilder: ServiceOptions | InjectBuilder,
  injectBuilderOrExtendSrv?: InjectBuilder<Exclude<InjectType, "database">> | Cls,
  ...extendSrvs: Cls[]
) {
  const refName = typeof refNameOrDb === "string" ? lowerlize(refNameOrDb) : refNameOrDb.refName;
  const option = typeof optionOrInjectBuilder === "object" ? optionOrInjectBuilder : { enabled: true };
  const injectBuilder =
    typeof optionOrInjectBuilder === "function" ? optionOrInjectBuilder : (injectBuilderOrExtendSrv as InjectBuilder);
  const extSrvs = [
    ...(typeof optionOrInjectBuilder === "function" && injectBuilderOrExtendSrv ? [injectBuilderOrExtendSrv] : []),
    ...extendSrvs,
  ] as ServiceCls[];
  const isEnabled =
    option.enabled ??
    (!option.serverMode || process.env.SERVER_MODE === option.serverMode || process.env.SERVER_MODE === "all");
  const serviceType = typeof refNameOrDb === "string" ? "plain" : "database";
  const injectInfoMap = injectBuilder(injectionBuilder(refName));
  if (serviceType === "database")
    Object.assign(injectInfoMap, {
      [`${refName}Model`]: new InjectInfo("database", { parentRefName: refName }),
      __databaseModel: new InjectInfo("database", { parentRefName: refName }),
    });
  const srvRef = class Service {
    static readonly type = serviceType;
    static readonly refName = refName;
    static enabled = isEnabled;
    static get name() {
      return `${capitalize(refName)}Service`;
    }
    static [INJECT_META] = {};
    readonly logger = new Logger(this.constructor.name);
    async onInit() {
      //
    }
    async onDestroy() {
      //
    }
  };
  applyMixins(srvRef, extSrvs, avoidKeys);
  Object.assign(srvRef[INJECT_META], ...extSrvs.map((srv) => srv[INJECT_META]), injectInfoMap);
  const onInitFns = extSrvs.map((srv) => srv.prototype.onInit);
  const onDestroyFns = extSrvs.map((srv) => srv.prototype.onDestroy);
  Object.assign(srvRef.prototype, {
    async _libsOnInit(this: Service) {
      await Promise.all([...onInitFns.map((onInit) => onInit?.call(this)), this.onInit()]);
    },
    async _libsOnDestroy(this: Service) {
      await Promise.all([...onDestroyFns.map((onDestroy) => onDestroy?.call(this)), this.onDestroy()]);
    },
  });

  if (serviceType === "database") {
    const preCreateFns = extSrvs.map((srv) => srv.prototype._preCreate);
    const postCreateFns = extSrvs.map((srv) => srv.prototype._postCreate);
    const preUpdateFns = extSrvs.map((srv) => srv.prototype._preUpdate);
    const postUpdateFns = extSrvs.map((srv) => srv.prototype._postUpdate);
    const preRemoveFns = extSrvs.map((srv) => srv.prototype._preRemove);
    const postRemoveFns = extSrvs.map((srv) => srv.prototype._postRemove);
    Object.assign(srvRef.prototype, {
      async __libsPreCreate(this: DatabaseService, data: DatabaseServiceData) {
        let result = data;
        for (const preCreate of preCreateFns) if (preCreate) result = await preCreate.call(this, result);
        if (this._preCreate) result = await this._preCreate(result);
        return result;
      },
      async __libsPostCreate(this: DatabaseService, doc: DatabaseServiceDoc) {
        let result = doc;
        for (const postCreate of postCreateFns) if (postCreate) result = await postCreate.call(this, result);
        if (this._postCreate) result = await this._postCreate(result);
        return result;
      },
      async __libsPreUpdate(this: DatabaseService, id: string, data: DatabaseServicePatch) {
        let result = data;
        for (const preUpdate of preUpdateFns) if (preUpdate) result = await preUpdate.call(this, id, result);
        if (this._preUpdate) result = await this._preUpdate(id, result);
        return result;
      },
      async __libsPostUpdate(this: DatabaseService, doc: DatabaseServiceDoc) {
        let result = doc;
        for (const postUpdate of postUpdateFns) if (postUpdate) result = await postUpdate.call(this, result);
        if (this._postUpdate) result = await this._postUpdate(result);
        return result;
      },
      async __libsPreRemove(this: DatabaseService, id: string) {
        for (const preRemove of preRemoveFns) await preRemove?.call(this, id);
        if (this._preRemove) await this._preRemove(id);
      },
      async __libsPostRemove(this: DatabaseService, doc: DatabaseServiceDoc) {
        let result = doc;
        for (const postRemove of postRemoveFns) if (postRemove) result = await postRemove.call(this, result);
        if (this._postRemove) result = await this._postRemove(result);
        return result;
      },
    });
  }

  return srvRef;
}
