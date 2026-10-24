import type { MergeAllKeyOfObjects, UnCls } from "akanjs/base";
import { capitalize, lowerlize } from "akanjs/common";
import type { ConstantModel, QueryOf } from "akanjs/constant";
import {
  type DatabaseModel,
  type DataInputOf,
  type Doc,
  documentQueryHelper,
  type FilterInfo,
  type FindQueryOption,
  type ListQueryOption,
  type SaveEventListener,
  type SaveEventType,
  splitFilterArgs,
  type UpdateChain,
} from "akanjs/document";
import type { ServiceCls } from "./serve";
import type { DatabaseService } from "./types";

export class ServiceModel<
  Srv extends ServiceCls = ServiceCls,
  CnstModel extends ConstantModel = any,
  DbModel extends DatabaseModel = any,
  SrvMap extends { [key: string]: any } = { [K in `${Uncapitalize<Srv["refName"]>}Service`]: UnCls<Srv> },
> {
  srv: Srv;
  cnst: CnstModel;
  db: DbModel;
  srvMap: SrvMap;
  constructor(srv: Srv, cnst?: CnstModel, db?: DbModel, srvMap?: { [key: string]: ServiceCls }) {
    this.srv = srv;
    this.cnst = cnst ?? (null as unknown as CnstModel);
    this.db = db ?? (null as unknown as DbModel);
    this.srvMap = (srvMap ?? { [`${lowerlize(srv.refName)}Service`]: srv }) as unknown as SrvMap;
  }
  static fromModel<Srv extends ServiceCls, CnstModel extends ConstantModel, DbModel extends DatabaseModel>(
    srv: Srv,
    cnst: CnstModel,
    db: DbModel,
  ): ServiceModel<Srv, CnstModel, DbModel> {
    return new ServiceModel<Srv, CnstModel, DbModel>(srv, cnst, db);
  }
  static from<Srv extends ServiceCls>(srv: Srv) {
    return new ServiceModel<Srv, never, never>(srv);
  }
  with<SrvModules extends ServiceModel[]>(...srvs: SrvModules) {
    return new ServiceModel(
      this.srv,
      this.cnst,
      this.db,
      Object.assign({}, this.srvMap, ...srvs.map((srv) => srv.srvMap)),
    ) as unknown as ServiceModel<Srv, CnstModel, DbModel, SrvMap & MergeAllKeyOfObjects<SrvModules, "srvMap">>;
  }

  static getDefaultDbServiceMethods(className: string) {
    const dbServiceMethods = {
      async __get(this: DatabaseService, id: string) {
        return await this.__databaseModel.__get(id);
      },
      async [`get${className}`](this: DatabaseService, id: string) {
        return this.__get(id);
      },
      async __load(this: DatabaseService, id?: string) {
        return await this.__databaseModel.__load(id);
      },
      async [`load${className}`](this: DatabaseService, id?: string) {
        return this.__load(id);
      },
      async __loadMany(this: DatabaseService, ids: string[]) {
        return await this.__databaseModel.__loadMany(ids);
      },
      async [`load${className}Many`](this: DatabaseService, ids: string[]) {
        return this.__loadMany(ids);
      },
      async __list(this: DatabaseService, query: QueryOf<any>, queryOption?: ListQueryOption) {
        return await this.__databaseModel.__list(query, queryOption);
      },
      async __listIds(this: DatabaseService, query: QueryOf<any>, queryOption?: ListQueryOption) {
        return await this.__databaseModel.__listIds(query, queryOption);
      },
      async __find(this: DatabaseService, query: QueryOf<any>, queryOption?: FindQueryOption) {
        return await this.__databaseModel.__find(query, queryOption);
      },
      async __findId(this: DatabaseService, query: QueryOf<any>, queryOption?: FindQueryOption) {
        return await this.__databaseModel.__findId(query, queryOption);
      },
      async __pick(this: DatabaseService, query: QueryOf<any>, queryOption?: FindQueryOption) {
        return await this.__databaseModel.__pick(query, queryOption);
      },
      async __pickId(this: DatabaseService, query: QueryOf<any>, queryOption?: FindQueryOption) {
        return await this.__databaseModel.__pickId(query, queryOption);
      },
      async __exists(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__exists(query);
      },
      async __count(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__count(query);
      },
      async __insight(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__insight(query);
      },
      async _preCreate(this: DatabaseService, data: DataInputOf) {
        return data;
      },
      async _postCreate(this: DatabaseService, doc: Doc) {
        return doc;
      },
      async _preUpdate(this: DatabaseService, id: string, data: Partial<Doc>) {
        return data;
      },
      async _postUpdate(this: DatabaseService, doc: Doc) {
        return doc;
      },
      async _preRemove(this: DatabaseService, id: string) {
        return;
      },
      async _postRemove(this: DatabaseService, doc: Doc) {
        return doc;
      },
      listenPre(this: DatabaseService, type: SaveEventType, listener: SaveEventListener<Doc>) {
        return this.__databaseModel.listenPre(type, listener);
      },
      listenPost(this: DatabaseService, type: SaveEventType, listener: SaveEventListener<Doc>) {
        return this.__databaseModel.listenPost(type, listener);
      },
      async __create(this: DatabaseService, data: DataInputOf) {
        const input = this.__libsPreCreate ? await this.__libsPreCreate(data) : await this._preCreate?.(data);
        const doc = await this.__databaseModel.__create(input ?? data);
        return (this.__libsPostCreate ? await this.__libsPostCreate(doc) : await this._postCreate?.(doc)) ?? doc;
      },
      async [`create${className}`](this: DatabaseService, data: DataInputOf) {
        return this.__create(data);
      },
      async __update(this: DatabaseService, id: string, data: DataInputOf) {
        const input = this.__libsPreUpdate ? await this.__libsPreUpdate(id, data) : await this._preUpdate?.(id, data);
        const doc = await this.__databaseModel.__update(id, input);
        return (this.__libsPostUpdate ? await this.__libsPostUpdate(doc) : await this._postUpdate?.(doc)) ?? doc;
      },
      async [`update${className}`](this: DatabaseService, id: string, data: DataInputOf) {
        return this.__update(id, data);
      },
      async __remove(this: DatabaseService, id: string): Promise<Doc> {
        if (this.__libsPreRemove) await this.__libsPreRemove(id);
        else await this._preRemove?.(id);
        const doc = await this.__databaseModel.__remove(id);
        return (this.__libsPostRemove ? await this.__libsPostRemove(doc) : await this._postRemove?.(doc)) ?? doc;
      },
      async [`remove${className}`](this: DatabaseService, id: string): Promise<Doc> {
        return this.__remove(id);
      },
    };
    return dbServiceMethods;
  }
  static getFilterServiceMethods(queryKey: string, filterInfo: FilterInfo) {
    const queryFn = filterInfo.queryFn;
    if (!queryFn) throw new Error(`No query function for key: ${queryKey}`);
    const queryOf = (args: any): QueryOf<any> =>
      queryFn(...splitFilterArgs(filterInfo, args).queryArgs, documentQueryHelper);
    const dataOf = (args: any) => {
      const { queryArgs, queryOption } = splitFilterArgs(filterInfo, args);
      return { query: queryFn(...queryArgs, documentQueryHelper), queryOption };
    };
    const key = capitalize(queryKey);
    return {
      [`list${key}`]: async function (this: DatabaseService, ...args: any) {
        const { query, queryOption } = dataOf(args);
        return this.__list(query, queryOption);
      },
      [`listIds${key}`]: async function (this: DatabaseService, ...args: any) {
        const { query, queryOption } = dataOf(args);
        return this.__listIds(query, queryOption);
      },
      [`find${key}`]: async function (this: DatabaseService, ...args: any) {
        const { query, queryOption } = dataOf(args);
        return this.__find(query, queryOption);
      },
      [`findId${key}`]: async function (this: DatabaseService, ...args: any) {
        const { query, queryOption } = dataOf(args);
        return this.__findId(query, queryOption);
      },
      [`pick${key}`]: async function (this: DatabaseService, ...args: any) {
        const { query, queryOption } = dataOf(args);
        return this.__pick(query, queryOption);
      },
      [`pickId${key}`]: async function (this: DatabaseService, ...args: any) {
        const { query, queryOption } = dataOf(args);
        return this.__pickId(query, queryOption);
      },
      [`exists${key}`]: async function (this: DatabaseService, ...args: any) {
        return this.__exists(queryOf(args));
      },
      [`count${key}`]: async function (this: DatabaseService, ...args: any) {
        return this.__count(queryOf(args));
      },
      [`insight${key}`]: async function (this: DatabaseService, ...args: any) {
        return this.__insight(queryOf(args));
      },
      [`query${key}`]: (...args: any) => queryOf(args),
      [`remove${key}`]: async function (this: DatabaseService, ...args: any) {
        return this.__removeMany(queryOf(args));
      },
      [`removeOne${key}`]: async function (this: DatabaseService, ...args: any) {
        return this.__removeOne(queryOf(args));
      },
      [`purge${key}`]: async function (this: DatabaseService, ...args: any) {
        return this.__purgeMany(queryOf(args));
      },
      [`update${key}`]: function (this: DatabaseService, ...args: any): UpdateChain {
        const query = queryOf(args);
        return { set: (update) => this.__updateMany(query, update) };
      },
      [`updateOne${key}`]: function (this: DatabaseService, ...args: any): UpdateChain {
        const query = queryOf(args);
        return { set: (update) => this.__updateOne(query, update) };
      },
    };
  }
}
