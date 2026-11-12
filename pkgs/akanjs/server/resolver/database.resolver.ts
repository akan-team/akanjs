import { applyMixins, capitalize } from "akanjs/common";
import type { ConstantModel } from "akanjs/constant";
import {
  assertFilterFitsCrud,
  type DatabaseInstance,
  type DatabaseModel,
  type DocumentSchema,
  getFilterMeta,
} from "akanjs/document";
import { type AdaptorCls, ServiceModel } from "akanjs/service";
import { databaseModelInstanceOf } from "./databaseModelInstance";
import { modelSchemaOf } from "./modelSchema";

export class DatabaseResolver {
  // The model adaptor and its database service expose the same filter methods over the same `__` primitives.
  static applyFilterMethods(prototype: object, database: DatabaseModel, className: string) {
    Object.entries(getFilterMeta(database.filter).query).forEach(([queryKey, filterInfo]) => {
      const filterMethods = ServiceModel.getFilterServiceMethods(queryKey, filterInfo);
      assertFilterFitsCrud(database.refName, queryKey, className);
      Object.assign(prototype, filterMethods);
    });
  }

  static resolveDatabase(
    constant: ConstantModel,
    database: DatabaseModel,
  ): { adaptor: AdaptorCls<DatabaseInstance>; schema: DocumentSchema } {
    const className = capitalize(database.refName);
    const schema = modelSchemaOf(constant, database);
    const DatabaseModelInstance = databaseModelInstanceOf(constant, database, schema);
    DatabaseResolver.applyFilterMethods(DatabaseModelInstance.prototype, database, className);
    applyMixins(DatabaseModelInstance, [database.model]);
    return { adaptor: DatabaseModelInstance, schema };
  }
}
