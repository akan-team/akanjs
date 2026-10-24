import { capitalize } from "akanjs/common";
import type { QueryOf } from "akanjs/constant";
import type { DatabaseModel, DataInputOf, Doc, DocumentUpdateInput } from "akanjs/document";
import { type DatabaseService, type ServiceCls, ServiceModel } from "akanjs/service";
import type { CascadeRunner } from "./CascadeRunner";
import { DatabaseResolver } from "./database.resolver";

export class ServiceResolver {
  static #getDefaultDbServiceMethods(refName: string, className: string, cascade: CascadeRunner) {
    //* the _pre*/_post* defaults stay out: assigning them onto the prototype would replace the service's own hooks
    const { _preCreate, _postCreate, _preUpdate, _postUpdate, _preRemove, _postRemove, ...methods } =
      ServiceModel.getDefaultDbServiceMethods(className);
    return {
      ...methods,
      async __create(this: DatabaseService, data: DataInputOf) {
        const input = await this.__libsPreCreate(data);
        const doc = await this.__databaseModel.__create(input);
        return await this.__libsPostCreate(doc);
      },
      async __update(this: DatabaseService, id: string, data: DataInputOf) {
        const input = await this.__libsPreUpdate(id, data);
        const doc = await this.__databaseModel.__update(id, input);
        return await this.__libsPostUpdate(doc);
      },
      async __remove(this: DatabaseService, id: string): Promise<Doc> {
        await this.__libsPreRemove(id);
        const doc = await this.__databaseModel.__remove(id);
        const removed = await this.__libsPostRemove(doc);
        await cascade.run(refName, removed as Record<string, unknown>);
        return removed;
      },
      async __removeMany(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__removeMany(query);
      },
      async __removeOne(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__removeOne(query);
      },
      async __purgeMany(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__purgeMany(query);
      },
      async __updateMany(this: DatabaseService, query: QueryOf<any>, update: DocumentUpdateInput) {
        return await this.__databaseModel.__updateMany(query, update);
      },
      async __updateOne(this: DatabaseService, query: QueryOf<any>, update: DocumentUpdateInput) {
        return await this.__databaseModel.__updateOne(query, update);
      },
    };
  }
  static resolveDatabaseService(database: DatabaseModel, srvRef: ServiceCls, cascade: CascadeRunner): ServiceCls {
    const className = capitalize(database.refName);
    Object.assign(srvRef.prototype, ServiceResolver.#getDefaultDbServiceMethods(database.refName, className, cascade));
    DatabaseResolver.applyFilterMethods(srvRef.prototype, database, className);
    return srvRef;
  }
}
