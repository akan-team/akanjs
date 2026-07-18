import { describe, expect, test } from "bun:test";
import { dayjs, FIELD_META, ID, Int, LOADER_META, type PrimitiveScalar } from "akanjs/base";
import { ConstantRegistry, type DocumentModel, type FieldToValue, via } from "akanjs/constant";
import {
  by,
  convertAggregateMatch,
  createArrayElementLoader,
  createArrayLoader,
  createDocumentId,
  createDocumentQueryHelper,
  createLoader,
  createQueryLoader,
  type DatabaseCls,
  type DatabaseInstance,
  type DatabaseInstanceOf,
  DatabaseRegistry,
  DataLoader,
  DocumentSchema,
  documentQueryHelper,
  encodeDocumentValue,
  fillMissingFilterArgs,
  from,
  getFilterInfoByKey,
  getFilterMeta,
  getFilterSortByKey,
  getLoaderInfos,
  into,
  isDocumentId,
  type ModelCls,
  type SchemaOf,
  sanitizeJson,
} from ".";

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Expect<Type extends true> = Type;
type IsAny<Type> = 0 extends 1 & Type ? true : false;

const DocumentTestCoordinateInput = via((f) => ({
  lat: f(Int, { default: 37 }),
  lng: f(Int, { default: 127 }),
}));
ConstantRegistry.buildScalar("documentTestCoordinate", DocumentTestCoordinateInput, { DocumentTestCoordinateInput });

const DocumentTestAddressInput = via((f) => ({
  city: f(String),
  coordinate: f(DocumentTestCoordinateInput),
}));
ConstantRegistry.buildScalar("documentTestAddress", DocumentTestAddressInput, { DocumentTestAddressInput });

const DocumentTestItemInput = via((f) => ({
  ownerId: f(ID),
  title: f(String),
  score: f(Int, { default: 0 }),
  tags: f([String]),
  metadata: f(Map, { of: String }),
  scoreCube: f([[[Int]]] as never),
  addressCube: f([[[DocumentTestAddressInput]]] as never),
  primaryAddress: f(DocumentTestAddressInput),
  addressBook: f(Map, { of: DocumentTestAddressInput as unknown as typeof PrimitiveScalar }),
  archived: f(Boolean, { default: false }),
}));
const DocumentTestItemObject = via(DocumentTestItemInput, (f) => ({
  memo: f(String).optional(),
}));
const DocumentTestItemLight = via(DocumentTestItemObject, ["title", "score"] as const, (f) => ({
  searchText: f(String, { text: "search" }),
}));
const DocumentTestItemFull = via(DocumentTestItemObject, DocumentTestItemLight, (f) => ({
  ownerTitle: f(String, { text: "filter" }),
}));
const DocumentTestItemInsight = via(DocumentTestItemFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
  highScoreCount: f(Int, { default: 0, accumulate: { score: { gte: 10 } } }),
  taggedCount: f(Int, { default: 0, accumulate: { tags: { oneOf: ["featured", "urgent"] } } }),
}));
const documentTestItemModel = ConstantRegistry.buildModel(
  "documentTestItem",
  DocumentTestItemInput,
  DocumentTestItemObject,
  DocumentTestItemFull,
  DocumentTestItemLight,
  DocumentTestItemInsight,
  {
    DocumentTestItemInput,
    DocumentTestItemObject,
    DocumentTestItemFull,
    DocumentTestItemLight,
    DocumentTestItemInsight,
  },
);

class DocumentTestDocMixin {
  label() {
    const doc = this as unknown as { title: string; score: number };
    return `${doc.title}:${doc.score}`;
  }
}
const DocumentTestDocMixinRef = DocumentTestDocMixin as unknown as DatabaseCls<
  InstanceType<typeof DocumentTestDocMixin>
>;

class DocumentTestModelMixin {
  static schemaTouched = false;
  static modelKind() {
    return "document-test-model";
  }
  static _onSchema(schema: SchemaOf) {
    DocumentTestModelMixin.schemaTouched = true;
    schema.index({ ownerId: 1 });
  }
}
const DocumentTestModelMixinRef = DocumentTestModelMixin as unknown as ModelCls<{
  modelKind: () => string;
  schemaTouched: boolean;
}>;
const DocumentTestItemInputRef = DocumentTestItemInput as unknown as DatabaseCls<
  InstanceType<typeof DocumentTestItemInput>
>;

class LibFilter extends from(DocumentTestItemFull, (makeFilter) => ({
  query: {
    byOwner: makeFilter()
      .arg("ownerId", ID, { ref: "user" })
      .query((ownerId) => ({ ownerId })),
  },
  sort: {
    highScore: { score: -1 },
  },
})) {}

class DocumentTestFilter extends from(
  DocumentTestItemFull,
  (makeFilter) => ({
    query: {
      byTitle: makeFilter()
        .arg("title", String)
        .opt("archived", Boolean, { default: false })
        .query((title, archived, q) => q.all({ title }, q.when(archived !== undefined, { archived }))),
    },
    sort: {
      lowScore: { score: 1 },
    },
  }),
  LibFilter,
) {}

class DocumentTestDoc extends by(DocumentTestItemFull, DocumentTestDocMixinRef) {}
class DocumentTestParentDoc extends by(DocumentTestItemObject) {
  addRole(role: string) {
    void role;
    return this;
  }
  subRole(role: string) {
    void role;
    return this;
  }
  addBadgeCount() {
    return this;
  }
}
type DocumentTestParentDocContract = {
  id: string;
  title: string;
  addRole(role: string): unknown;
  subRole(role: string): unknown;
  addBadgeCount(): unknown;
};
const DocumentTestParentDocRef = DocumentTestParentDoc as unknown as DatabaseCls<DocumentTestParentDocContract>;
const documentTestParentDocs = [DocumentTestParentDocRef] as const;
const DocumentTestChildDocRef = by(DocumentTestItemFull, ...documentTestParentDocs);
type DocumentTestChildDocFromRef = DatabaseInstanceOf<typeof DocumentTestChildDocRef>;

class DocumentTestModel extends into(
  DocumentTestDoc,
  DocumentTestFilter,
  documentTestItemModel,
  (loader) => ({
    byOwner: loader.byField("ownerId", { archived: false }),
    byTags: loader.byArrayField("tags"),
    byOwnerTitle: loader.byQuery(["ownerId", "title"] as const),
  }),
  DocumentTestModelMixinRef,
) {}

class DocumentTestScalar extends by(DocumentTestItemInput) {}

class DocumentParentClassUserInput extends via((f) => ({
  nickname: f(String),
})) {}
class DocumentParentClassUserObject extends via(DocumentParentClassUserInput, (f) => ({
  roles: f([String]),
})) {}
class DocumentParentClassLightUser extends via(DocumentParentClassUserObject, ["nickname"] as const, (f) => ({})) {}
class DocumentParentClassUser extends via(DocumentParentClassUserObject, DocumentParentClassLightUser, (f) => ({})) {}

class DocumentSocialClassUserInput extends via(
  (f) => ({
    interests: f([String]),
  }),
  DocumentParentClassUserInput,
) {}
class DocumentSocialClassUserObject extends via(
  DocumentSocialClassUserInput,
  (f) => ({
    gender: f(String),
  }),
  DocumentParentClassUserObject,
) {}
class DocumentSocialClassLightUser extends via(
  DocumentSocialClassUserObject,
  ["nickname"] as const,
  (f) => ({}),
  DocumentParentClassLightUser,
) {}
class DocumentSocialClassUser extends via(
  DocumentSocialClassUserObject,
  DocumentSocialClassLightUser,
  (f) => ({}),
  DocumentParentClassUser,
) {}

class DocumentAppClassUserInput extends via(
  (f) => ({
    height: f(Int),
    languages: f([String]),
  }),
  DocumentSocialClassUserInput,
) {}
class DocumentAppClassUserObject extends via(
  DocumentAppClassUserInput,
  (f) => ({
    bloodType: f(String),
    education: f(String).optional(),
    location: f(String),
    lastLoginAt: f.hidden(Date, { default: () => dayjs(), example: dayjs() }),
  }),
  DocumentSocialClassUserObject,
) {}
class DocumentAppClassLightUser extends via(
  DocumentAppClassUserObject,
  ["nickname"] as const,
  (f) => ({}),
  DocumentSocialClassLightUser,
) {}
class DocumentAppClassUser extends via(
  DocumentAppClassUserObject,
  DocumentAppClassLightUser,
  (f) => ({}),
  DocumentSocialClassUser,
) {}
class DocumentAppClassUserInsight extends via(DocumentAppClassUser, (f) => ({})) {}
const documentAppClassUserModelInfo = ConstantRegistry.buildModel(
  "documentAppClassUser",
  DocumentAppClassUserInput,
  DocumentAppClassUserObject,
  DocumentAppClassUser,
  DocumentAppClassLightUser,
  DocumentAppClassUserInsight,
  {
    DocumentAppClassUserInput,
    DocumentAppClassUserObject,
    DocumentAppClassUser,
    DocumentAppClassLightUser,
    DocumentAppClassUserInsight,
  },
);
class DocumentAppClassUserDoc extends by(DocumentAppClassUser) {
  setEducation(education: string | undefined) {
    this.set({ education });
    return this;
  }
}
class DocumentAppClassUserFilter extends from(DocumentAppClassUser, () => ({ query: {}, sort: {} })) {}
class DocumentAppClassUserModel extends into(
  DocumentAppClassUserDoc,
  DocumentAppClassUserFilter,
  documentAppClassUserModelInfo,
  () => ({}),
) {}
const documentAppClassUserDatabase = DatabaseRegistry.buildModel(
  "documentAppClassUser",
  DocumentAppClassUserInput as unknown as DatabaseCls<InstanceType<typeof DocumentAppClassUserInput>>,
  DocumentAppClassUserDoc,
  DocumentAppClassUserModel,
  DocumentAppClassUserObject,
  DocumentAppClassUserInsight,
  DocumentAppClassUserFilter,
);
const DocumentNoActionDocRef = class DocumentNoActionDoc {} as unknown as DatabaseCls<Record<string, never>>;
class DocumentAppClassUserDocWithNoActionParent extends by(DocumentAppClassUser, DocumentNoActionDocRef) {
  setEducation(education: string | undefined) {
    this.set({ education });
    return this;
  }
}

type DocumentTestModelGetReturn = Awaited<ReturnType<DocumentTestModel["getDocumentTestItem"]>>;
type _DocumentModelActionTypeAssertions = [
  Expect<Equal<IsAny<DocumentTestModelGetReturn>, false>>,
  Expect<Equal<DocumentTestModelGetReturn, DocumentTestDoc>>,
];
type _DocumentMethodInheritanceAssertions = [
  Expect<Equal<IsAny<DocumentTestChildDocFromRef["addRole"]>, false>>,
  Expect<Equal<"addRole" extends keyof DocumentTestChildDocFromRef ? true : false, true>>,
  Expect<Equal<"subRole" extends keyof DocumentTestChildDocFromRef ? true : false, true>>,
  Expect<Equal<"addBadgeCount" extends keyof DocumentTestChildDocFromRef ? true : false, true>>,
  Expect<DocumentTestChildDocFromRef extends DocumentTestParentDocContract ? true : false>,
];
type DocumentAppClassUserEndpointReturn = DocumentModel<FieldToValue<typeof DocumentAppClassUser>>;
type DocumentAppClassUserRegisteredDoc = (typeof documentAppClassUserDatabase)["_Doc"];
type _ExtendedViaClassDocumentSchemaAssertions = [
  Expect<Equal<IsAny<DocumentAppClassUserDoc>, false>>,
  Expect<Equal<IsAny<DocumentAppClassUserDocWithNoActionParent>, false>>,
  Expect<Equal<"height" extends keyof DocumentAppClassUserDoc ? true : false, true>>,
  Expect<Equal<"bloodType" extends keyof DocumentAppClassUserDoc ? true : false, true>>,
  Expect<Equal<"location" extends keyof DocumentAppClassUserDoc ? true : false, true>>,
  Expect<Equal<"languages" extends keyof DocumentAppClassUserDoc ? true : false, true>>,
  Expect<Equal<undefined extends DocumentAppClassUserDoc["lastLoginAt"] ? true : false, false>>,
  Expect<Equal<null extends DocumentAppClassUserDoc["lastLoginAt"] ? true : false, false>>,
  Expect<Equal<"setEducation" extends keyof DocumentAppClassUserDocWithNoActionParent ? true : false, true>>,
  Expect<Equal<"height" extends keyof DocumentAppClassUserRegisteredDoc ? true : false, true>>,
  Expect<Equal<"bloodType" extends keyof DocumentAppClassUserRegisteredDoc ? true : false, true>>,
  Expect<
    { height: number; bloodType: string; location: string; languages: string[] } extends Parameters<
      DocumentAppClassUserDoc["set"]
    >[0]
      ? true
      : false
  >,
  Expect<
    {
      height: number;
      bloodType: string;
      location: string;
      languages: string[];
    } extends Partial<DocumentAppClassUserRegisteredDoc>
      ? true
      : false
  >,
  Expect<DocumentAppClassUserDoc extends DocumentAppClassUserEndpointReturn ? true : false>,
];

describe("by, from, into, and DatabaseRegistry", () => {
  test("builds document classes with constant metadata and mixed methods", () => {
    const doc = Object.assign(new DocumentTestDoc(), { title: "Alpha", score: 7 });
    const metadataField = DocumentTestDoc[FIELD_META].metadata;
    const scoreCubeField = DocumentTestDoc[FIELD_META].scoreCube;
    const addressCubeField = DocumentTestDoc[FIELD_META].addressCube;
    const primaryAddressField = DocumentTestDoc[FIELD_META].primaryAddress;
    const addressBookField = DocumentTestDoc[FIELD_META].addressBook;

    expect(DocumentTestDoc.refName).toBe("documentTestItem");
    expect(DocumentTestDoc[FIELD_META].title.modelRef).toBe(String);
    expect(metadataField.isMap).toBe(true);
    expect(metadataField.of).toBe(String);
    expect(scoreCubeField.arrDepth).toBe(3);
    expect(scoreCubeField.modelRef).toBe(Int as unknown as typeof scoreCubeField.modelRef);
    expect(addressCubeField.arrDepth).toBe(3);
    expect(addressCubeField.modelRef).toBe(DocumentTestAddressInput as unknown as typeof addressCubeField.modelRef);
    expect(addressCubeField.isScalar).toBe(true);
    expect(primaryAddressField.isClass).toBe(true);
    expect(primaryAddressField.isScalar).toBe(true);
    expect(addressBookField.isMap).toBe(true);
    expect(addressBookField.of).toBe(DocumentTestAddressInput as unknown as typeof addressBookField.of);
    expect(doc.label()).toBe("Alpha:7");
  });

  test("validates deep nested document fixture values", () => {
    const doc = new DocumentTestItemFull({
      ownerId: "1234567890abcdef12345678",
      title: "Complex",
      score: 9,
      tags: ["deep"],
      metadata: { locale: "ko", mode: "dark" } as never,
      scoreCube: [
        [
          [1, 2],
          [3, 4],
        ],
      ] as never,
      addressCube: [
        [
          [
            { city: "Seoul", coordinate: { lat: 37, lng: 127 } },
            { city: "Busan", coordinate: { lat: 35, lng: 129 } },
          ],
        ],
      ] as never,
      primaryAddress: { city: "Jeju", coordinate: { lat: 33, lng: 126 } } as never,
      addressBook: {
        home: { city: "Seoul", coordinate: { lat: 37, lng: 127 } },
        office: { city: "Pangyo", coordinate: { lat: 37, lng: 127 } },
      } as never,
    } as never) as InstanceType<typeof DocumentTestItemFull> & {
      metadata: Map<string, string>;
      scoreCube: number[][][];
      addressCube: InstanceType<typeof DocumentTestAddressInput>[][][];
      primaryAddress: InstanceType<typeof DocumentTestAddressInput>;
      addressBook: Map<string, InstanceType<typeof DocumentTestAddressInput>>;
    };
    const scoreCube = doc.scoreCube as number[][][];
    const addressCube = doc.addressCube as InstanceType<typeof DocumentTestAddressInput>[][][];

    expect(doc.metadata).toBeInstanceOf(Map);
    expect(doc.metadata.get("mode")).toBe("dark");
    expect(scoreCube[0][1][1]).toBe(4);
    expect(doc.primaryAddress).toBeInstanceOf(DocumentTestAddressInput);
    expect(doc.primaryAddress.coordinate).toBeInstanceOf(DocumentTestCoordinateInput);
    expect(addressCube[0][0][1]).toBeInstanceOf(DocumentTestAddressInput);
    expect(addressCube[0][0][1].coordinate.lat).toBe(35);
    expect(doc.addressBook).toBeInstanceOf(Map);
    expect(
      (doc.addressBook.get("office") as InstanceType<typeof DocumentTestAddressInput> | undefined)?.coordinate.lng,
    ).toBe(127);
  });

  test("builds and merges filter metadata", () => {
    const filterMeta = getFilterMeta(DocumentTestFilter);

    expect(Object.keys(filterMeta.query).sort()).toEqual(["any", "byOwner", "byTitle"]);
    expect(filterMeta.query.byTitle.argNames).toEqual(["title", "archived"]);
    expect(filterMeta.query.byTitle.args).toEqual([
      { name: "title", argRef: String, option: undefined },
      { name: "archived", argRef: Boolean, option: { default: false, nullable: true } },
    ]);
    expect(filterMeta.query.byOwner.args).toEqual([{ name: "ownerId", argRef: ID, option: { ref: "user" } }]);
    expect(filterMeta.sort).toEqual({
      latest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      highScore: { score: -1 },
      lowScore: { score: 1 },
    });
    expect([...DocumentTestFilter.sortField].sort()).toEqual(["createdAt", "score"]);
    expect(getFilterInfoByKey(DocumentTestFilter, "byTitle")).toBe(filterMeta.query.byTitle);
    expect(getFilterSortByKey(DocumentTestFilter, "highScore")).toEqual({ score: -1 });
    expect(() => getFilterInfoByKey(DocumentTestFilter, "missing")).toThrow("queryMeta is not defined");
  });

  test("fills omitted optional filter args before the query helper", () => {
    const byTitle = getFilterInfoByKey(DocumentTestFilter, "byTitle");

    expect(fillMissingFilterArgs(byTitle, ["Alpha"])).toEqual(["Alpha", undefined]);
    expect(byTitle.queryFn?.(...fillMissingFilterArgs(byTitle, ["Alpha"]), documentQueryHelper)).toEqual({
      kind: "all",
      queries: [{ title: "Alpha" }, {}],
    });
  });

  test("executes filter query functions with document query helpers", () => {
    const byTitle = getFilterInfoByKey(DocumentTestFilter, "byTitle");
    const byOwner = getFilterInfoByKey(DocumentTestFilter, "byOwner");

    expect(byTitle.queryFn?.("Alpha", false, documentQueryHelper)).toEqual({
      kind: "all",
      queries: [{ title: "Alpha" }, { archived: false }],
    });
    expect(byOwner.queryFn?.("1234567890abcdef12345678", documentQueryHelper)).toEqual({
      ownerId: "1234567890abcdef12345678",
    });
  });

  test("defines insight accumulates as document query filters", () => {
    const insightFields = DocumentTestItemInsight[FIELD_META];

    expect(insightFields.count.getProps().accumulate).toEqual({});
    expect(insightFields.highScoreCount.getProps().accumulate).toEqual({ score: { gte: 10 } });
    expect(insightFields.taggedCount.getProps().accumulate).toEqual({ tags: { oneOf: ["featured", "urgent"] } });
  });

  test("exposes typed database query methods for filter keys", () => {
    type DocumentTestDatabase = DatabaseInstance<
      "documentTestItem",
      InstanceType<typeof DocumentTestItemInput>,
      InstanceType<typeof DocumentTestDoc>,
      InstanceType<typeof DocumentTestItemObject>,
      InstanceType<typeof DocumentTestItemInsight>,
      InstanceType<typeof DocumentTestFilter>
    >;
    const assertQueryMethods = (database: DocumentTestDatabase) => {
      const listByTitle: Promise<InstanceType<typeof DocumentTestDoc>[]> = database.listByTitle("Alpha", false, {
        limit: 10,
        sort: "lowScore",
        select: { title: true },
      });
      const listIdsByTitle: Promise<string[]> = database.listIdsByTitle("Alpha", false, { skip: 1 });
      const findByTitle: Promise<InstanceType<typeof DocumentTestDoc> | null> = database.findByTitle("Alpha", false, {
        sort: "highScore",
        select: { title: true },
      });
      const findIdByTitle: Promise<string | null> = database.findIdByTitle("Alpha", false);
      const pickByTitle: Promise<InstanceType<typeof DocumentTestDoc>> = database.pickByTitle("Alpha", false);
      const pickIdByTitle: Promise<string> = database.pickIdByTitle("Alpha", false);
      const existsByTitle: Promise<string | null> = database.existsByTitle("Alpha", false);
      const countByTitle: Promise<number> = database.countByTitle("Alpha", false);
      const insightByTitle: Promise<InstanceType<typeof DocumentTestItemInsight>> = database.insightByTitle(
        "Alpha",
        false,
      );
      const queryByTitle = database.queryByTitle("Alpha", false);
      const listByOwner: Promise<InstanceType<typeof DocumentTestDoc>[]> = database.listByOwner(
        "1234567890abcdef12345678",
        { sort: "oldest" },
      );
      return {
        listByTitle,
        listIdsByTitle,
        findByTitle,
        findIdByTitle,
        pickByTitle,
        pickIdByTitle,
        existsByTitle,
        countByTitle,
        insightByTitle,
        queryByTitle,
        listByOwner,
      };
    };

    expect(assertQueryMethods).toBeFunction();
  });

  test("combines loader metadata and model mixins with into", () => {
    const schema = new DocumentSchema();

    expect((DocumentTestModel as typeof DocumentTestModel & { modelKind: () => string }).modelKind()).toBe(
      "document-test-model",
    );
    expect(Object.keys(getLoaderInfos(DocumentTestModel)).sort()).toEqual(["byOwner", "byOwnerTitle", "byTags"]);
    expect(DocumentTestModel[LOADER_META].byOwner).toMatchObject({
      type: "field",
      field: "ownerId",
      defaultQuery: { archived: false },
    });
    expect(DocumentTestModel[LOADER_META].byTags).toMatchObject({ type: "arrayField", field: "tags" });
    expect(DocumentTestModel[LOADER_META].byOwnerTitle).toMatchObject({
      type: "query",
      field: ["ownerId", "title"],
    });

    DocumentTestModel._libsOnSchema(schema);

    expect(DocumentTestModelMixin.schemaTouched).toBe(true);
    expect(schema.indexes).toEqual([{ fields: { ownerId: 1 } }]);
  });

  test("registers document models and scalars", () => {
    const dbModel = DatabaseRegistry.buildModel(
      "documentTestItem",
      DocumentTestItemInputRef,
      DocumentTestDoc,
      DocumentTestModel,
      DocumentTestItemObject,
      DocumentTestItemInsight,
      DocumentTestFilter,
    );
    const scalar = DatabaseRegistry.buildScalar("documentTestScalar", DocumentTestScalar);

    expect(DatabaseRegistry.getDatabase("documentTestItem")).toBe(dbModel);
    expect(DatabaseRegistry.getDatabase("missingDocument", { allowEmpty: true })).toBeUndefined();
    expect(() => DatabaseRegistry.getDatabase("missingDocument")).toThrow("No database document model info");
    expect(DatabaseRegistry.getScalar("documentTestScalar")).toBe(scalar);
    expect(DatabaseRegistry.getScalar("missingScalar", { allowEmpty: true })).toBeUndefined();
    expect(() => DatabaseRegistry.getScalar("missingScalar")).toThrow("No scalar model");
  });
});

describe("document query helpers and schemas", () => {
  test("builds document query helper nodes", () => {
    const q = createDocumentQueryHelper();

    expect(q.all({ title: "Alpha" }, null, undefined, false, { score: q.gte(10) })).toEqual({
      kind: "all",
      queries: [{ title: "Alpha" }, { score: { kind: "op", op: "gte", value: 10 } }],
    });
    expect(q.any({ title: "Alpha" }, { title: "Beta" })).toEqual({
      kind: "any",
      queries: [{ title: "Alpha" }, { title: "Beta" }],
    });
    expect(q.not({ archived: true })).toEqual({ kind: "not", query: { archived: true } });
    expect(q.oneOf(["a", "b"])).toEqual({ kind: "op", op: "oneOf", value: ["a", "b"] });
    expect(q.notOneOf(["c"])).toEqual({ kind: "op", op: "notOneOf", value: ["c"] });
    expect(q.between(1, 3)).toEqual({ kind: "op", op: "between", value: [1, 3] });
    expect(q.exists("title")).toEqual({ title: { kind: "op", op: "exists" } });
    expect(q.missing("memo")).toEqual({ memo: { kind: "op", op: "missing" } });
    expect(q.empty("removedAt")).toEqual({ removedAt: { kind: "op", op: "empty" } });
    expect(q.has("tag-a")).toEqual({ kind: "op", op: "has", value: "tag-a" });
    expect(q.contains("Alpha")).toEqual({ kind: "op", op: "contains", value: "Alpha" });
    expect(q.raw("score > ?", [10])).toEqual({ kind: "raw", sql: "score > ?", params: [10] });
    expect(q.when(true, { title: "Alpha" })).toEqual({ title: "Alpha" });
    expect(q.when(false, { title: "Alpha" })).toEqual({});
  });

  test("creates and validates document ids", () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const id = createDocumentId(now);
    const timestampHex = Math.floor(now / 1000)
      .toString(16)
      .padStart(8, "0");

    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(id.startsWith(timestampHex)).toBe(true);
    expect(isDocumentId(id)).toBe(true);
    expect(isDocumentId("not-an-id")).toBe(false);
  });

  test("sanitizes and encodes document values", () => {
    const date = new Date("2026-01-02T03:04:05.000Z");
    const dateValue = date.getTime();
    const day = dayjs("2026-01-03T00:00:00.000Z");
    const nested = {
      map: new Map([
        [
          "home",
          {
            city: "Seoul",
            visitedAt: date,
            matrix: [[day, undefined], [new Date("2026-01-04T00:00:00.000Z")]],
          },
        ],
      ]),
      cube: [
        [
          [date, day],
          [undefined, null],
        ],
      ],
    };
    const nestedSanitized = {
      map: {
        home: {
          city: "Seoul",
          visitedAt: dateValue,
          matrix: [[day.valueOf()], [new Date("2026-01-04T00:00:00.000Z").getTime()]],
        },
      },
      cube: [[[dateValue, day.valueOf()], [null]]],
    };

    expect(sanitizeJson({ date, day, skip: undefined, nested: { ok: true }, list: [1, undefined, date] })).toEqual({
      date: dateValue,
      day: day.valueOf(),
      nested: { ok: true },
      list: [1, dateValue],
    });
    expect(sanitizeJson(new Map([["date", date]]))).toEqual({ date: dateValue });
    expect(sanitizeJson(nested)).toEqual(nestedSanitized);
    expect(() => sanitizeJson(JSON.parse('{"__proto__":"unsafe"}'))).toThrow("Unsafe JSON key");
    expect(() => sanitizeJson({ constructor: "unsafe" })).toThrow("Unsafe JSON key");

    expect(encodeDocumentValue(undefined)).toBeUndefined();
    expect(encodeDocumentValue(null)).toBeNull();
    expect(encodeDocumentValue(date)).toBe(dateValue);
    expect(encodeDocumentValue(day)).toBe(day.valueOf());
    expect(encodeDocumentValue([date, { keep: true }])).toEqual([dateValue, JSON.stringify({ keep: true })]);
    expect(encodeDocumentValue({ date, nested: { ok: true } })).toBe(
      JSON.stringify({ date: dateValue, nested: { ok: true } }),
    );
    expect(encodeDocumentValue(nested)).toBe(JSON.stringify(nestedSanitized));
  });

  test("stores schema hooks and index descriptors", () => {
    const schema = new DocumentSchema<DocumentTestDoc>();
    const preSave = () => undefined;
    const afterUpdate = () => undefined;

    schema
      .pre("save", preSave)
      .post("remove", () => undefined)
      .hook("afterUpdate", afterUpdate)
      .index({ ownerId: 1, score: -1 }, { name: "owner_score", unique: true })
      .text("title", "memo")
      .createIndex("active_title")
      .path("archived", 1)
      .text("title")
      .where((q) => ({ archived: q.eq(false) }))
      .done();

    expect(schema.preHooks.get("save")).toEqual([preSave]);
    expect(schema.postHooks.get("remove")).toHaveLength(1);
    expect(schema.postHooks.get("update")).toEqual([afterUpdate]);
    expect(() => schema.hook("duringSave" as never, () => undefined)).toThrow("Invalid document hook");
    expect(schema.indexes).toEqual([
      { name: "owner_score", unique: true, fields: { ownerId: 1, score: -1 } },
      { text: true, fields: { title: "text", memo: "text" } },
      {
        name: "active_title",
        fields: { archived: 1, title: "text" },
        text: true,
        where: { archived: { kind: "op", op: "eq", value: false } },
      },
    ]);
  });

  test("contextually types schema hook documents", () => {
    const schema: SchemaOf<DocumentTestModel, DocumentTestDoc> = new DocumentSchema<DocumentTestDoc>();

    schema.pre<DocumentTestDoc>("save", function (next) {
      const score: number = this.score;
      this.title = `${this.title}:${score}`;
      next?.();
    });

    expect(schema.preHooks.get("save")).toHaveLength(1);
  });

  test("converts aggregate match date values recursively", () => {
    const date = new Date("2026-01-02T00:00:00.000Z");
    const day = dayjs("2026-01-03T00:00:00.000Z");
    const nestedDate = new Date("2026-01-04T00:00:00.000Z");

    expect(
      convertAggregateMatch({
        createdAt: date,
        nested: {
          day,
          list: [date, { from: day }],
          cube: [[[nestedDate], [day]]],
          mapLike: { home: { visitedAt: nestedDate } },
        },
        plain: "value",
      }),
    ).toEqual({
      createdAt: date.getTime(),
      nested: {
        day: day.valueOf(),
        list: [date.getTime(), { from: day.valueOf() }],
        cube: [[[nestedDate.getTime()], [day.valueOf()]]],
        mapLike: { home: { visitedAt: nestedDate.getTime() } },
      },
      plain: "value",
    });
  });
});

describe("data loaders", () => {
  const items = [
    { id: "1", ownerId: "owner-a", title: "Alpha", tags: ["red", "blue"], archived: false },
    { id: "2", ownerId: "owner-b", title: "Beta", tags: ["red"], archived: false },
    { id: "3", ownerId: "owner-a", title: "Gamma", tags: ["green"], archived: true },
  ];
  type TestLoaderItem = (typeof items)[number];
  type TestLoaderItemWithKey = TestLoaderItem & { key: string };

  const createFakeModel = (result = items) => {
    const queries: unknown[] = [];
    return {
      queries,
      model: {
        async find(query: unknown) {
          queries.push(query);
          return result;
        },
      },
    };
  };

  test("createLoader batches field lookup and preserves requested order", async () => {
    const fake = createFakeModel();
    const loader = createLoader<string, TestLoaderItem | null>(fake.model, "id", { archived: false });

    const result = await loader.loadMany(["2", "1", "missing"]);

    expect(fake.queries).toEqual([
      {
        archived: false,
        id: { kind: "op", op: "oneOf", value: ["2", "1", "missing"] },
      },
    ]);
    expect(result).toEqual([items[1], items[0], null]);
  });

  test("createArrayLoader returns matching lists for each requested field", async () => {
    const fake = createFakeModel();
    const loader = createArrayLoader<string, TestLoaderItem[]>(fake.model, "ownerId");

    const result = await loader.loadMany(["owner-a", "owner-b", "missing"]);

    expect(fake.queries).toEqual([
      {
        ownerId: { kind: "op", op: "has", value: ["owner-a", "owner-b", "missing"] },
      },
    ]);
    expect(result).toEqual([[items[0], items[2]], [items[1]], []]);
  });

  test("createArrayElementLoader groups documents by array elements", async () => {
    const fake = createFakeModel();
    const loader = createArrayElementLoader<string, TestLoaderItemWithKey[] | null>(fake.model, "tags");

    const result = await loader.loadMany(["red", "green", "missing"]);

    expect(fake.queries).toEqual([
      {
        tags: { kind: "op", op: "oneOf", value: ["red", "green", "missing"] },
      },
    ]);
    expect(result).toEqual([
      [
        { ...items[0], key: "red" },
        { ...items[1], key: "red" },
      ],
      [{ ...items[2], key: "green" }],
      null,
    ]);
  });

  test("createQueryLoader batches composite query keys", async () => {
    const fake = createFakeModel();
    const loader = createQueryLoader<{ ownerId: string; title: string }, TestLoaderItem | null>(
      fake.model,
      ["ownerId", "title"],
      { archived: false },
    );

    const result = await loader.loadMany([
      { ownerId: "owner-a", title: "Alpha" },
      { ownerId: "owner-b", title: "Beta" },
      { ownerId: "missing", title: "Missing" },
    ]);

    expect(fake.queries).toEqual([
      {
        kind: "all",
        queries: [
          {
            kind: "any",
            queries: [
              { ownerId: "owner-a", title: "Alpha" },
              { ownerId: "owner-b", title: "Beta" },
              { ownerId: "missing", title: "Missing" },
            ],
          },
          { archived: false },
        ],
      },
    ]);
    expect(result).toEqual([items[0], items[1], null]);
  });

  test("DataLoader batches loads in a microtask", async () => {
    const batches: string[][] = [];
    const loader = new DataLoader<string, string>(async (keys) => {
      batches.push([...keys]);
      return keys.map((key) => `value:${key}`);
    });

    const values = await Promise.all([loader.load("a"), loader.load("b")]);

    expect(values).toEqual(["value:a", "value:b"]);
    expect(batches).toEqual([["a", "b"]]);
  });

  test("DataLoader cache can be cleared and primed", async () => {
    let calls = 0;
    const loader = new DataLoader<string, string>(async (keys) => {
      calls++;
      return keys.map((key) => `loaded:${key}`);
    });

    await expect(loader.load("a")).resolves.toBe("loaded:a");
    await expect(loader.load("a")).resolves.toBe("loaded:a");
    expect(calls).toBe(1);

    loader.clear("a").prime("a", "primed:a");
    await expect(loader.load("a")).resolves.toBe("primed:a");
    expect(calls).toBe(1);

    loader.clearAll();
    await expect(loader.load("a")).resolves.toBe("loaded:a");
    expect(calls).toBe(2);
  });

  test("DataLoader loadMany resolves per-key errors", async () => {
    const loader = new DataLoader<string, string>(async (keys) =>
      keys.map((key) => (key === "bad" ? new Error("bad key") : `value:${key}`)),
    );

    const result = await loader.loadMany(["ok", "bad"]);

    expect(result[0]).toBe("value:ok");
    expect(result[1]).toBeInstanceOf(Error);
  });
});
