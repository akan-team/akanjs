import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, DocumentSchema, from, into } from "akanjs/document";
import type { DocumentStore } from "akanjs/service";
import type { SqlDocumentStore } from "../../service/predefinedAdaptor/sql/SqlDocumentStore";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../test/conformance";
import { modelFacadeOf } from "../resolver/modelFacade";

class StatInput extends via((f) => ({
  title: f(String, { default: "" }),
  ownerId: f(String, { default: "" }),
  score: f(Int, { default: 0 }),
})) {}
class StatObject extends via(StatInput, () => ({})) {}
class StatLight extends via(StatObject, ["title"] as const, () => ({})) {}
class StatFull extends via(StatObject, StatLight, () => ({})) {}
class StatInsight extends via(StatFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
const statConstant = ConstantRegistry.buildModel("statMemo", StatInput, StatObject, StatFull, StatLight, StatInsight, {
  StatInput,
  StatObject,
  StatFull,
  StatLight,
  StatInsight,
});
class StatFilter extends from(StatFull, () => ({ query: {}, sort: {} })) {}
class StatDoc extends by(StatFull) {}
class StatModel extends into(StatDoc, StatFilter, statConstant, () => ({})) {}
const statDatabase = DatabaseRegistry.buildModel(
  "statMemo",
  StatInput as unknown as DatabaseCls<InstanceType<typeof StatInput>>,
  StatDoc,
  StatModel,
  StatObject,
  StatInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  StatFilter,
);

export interface StatementModel {
  driver: SqlDriver;
  store: SqlDocumentStore;
  Memo: ReturnType<typeof modelFacadeOf>;
  ids: string[];
}

export const openStatementModel = async (kind: SqlDriverKind, rows: number): Promise<StatementModel> => {
  const driver = await ConformanceEnv.openSqlDriver(kind);
  const database = driver.database as unknown as {
    getStore: (...args: unknown[]) => SqlDocumentStore;
  };
  const store = database.getStore(statConstant, statDatabase, new DocumentSchema().index({ title: 1 }));
  await store.ensure();
  const created = rows
    ? await store.createMany(
        Array.from({ length: rows }, (_, idx) => ({ title: `memo ${idx}`, ownerId: `u${idx % 40}`, score: idx })),
      )
    : [];
  const noHook = (() => () => undefined) as never;
  const Memo = modelFacadeOf(store as unknown as DocumentStore, "statMemo", noHook, noHook);
  return { driver, store, Memo, ids: created.map((doc) => String((doc as { id: string }).id)) };
};
