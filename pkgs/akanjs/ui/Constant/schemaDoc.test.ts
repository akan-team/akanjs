import { describe, expect, test } from "bun:test";
import { type EnumInstance, enumOf, FIELD_META, Int } from "akanjs/base";
import { ConstantRegistry, field } from "akanjs/constant";
import { makeRef } from "../testHelpers.fixture";
import { databaseModelVariants, getConstantOwnerOrder, getConstantSchemaDoc } from "./schemaDoc";

class ConstantDocRole extends enumOf("constantDocRole", ["admin", "user"] as const) {}
ConstantRegistry.enum.set("constantDocRole", ConstantDocRole as unknown as EnumInstance);

const ConstantDocAddress = makeRef({
  city: field(String),
  zip: field(Int, { default: 10000, min: 10000 }),
});
ConstantRegistry.buildScalar("constantDocAddress", ConstantDocAddress, { ConstantDocAddress });

class ConstantDocTier extends enumOf("constantDocTier", ["free", "paid"] as const) {}
ConstantRegistry.enum.set("constantDocTier", ConstantDocTier as unknown as EnumInstance);

const ConstantDocGeo = makeRef({ lat: field(Int, { default: 0 }) });
ConstantRegistry.buildScalar("constantDocGeo", ConstantDocGeo, { ConstantDocGeo });

const ConstantDocPlace = makeRef({
  geo: field(ConstantDocGeo),
  tier: field(String, { enum: ConstantDocTier } as never),
});
ConstantRegistry.buildScalar("constantDocPlace", ConstantDocPlace, { ConstantDocPlace });

const ConstantDocUnused = makeRef({ note: field(String) });
ConstantRegistry.buildScalar("constantDocUnused", ConstantDocUnused, { ConstantDocUnused });

const ConstantDocBadge = makeRef({ label: field(String) });
ConstantRegistry.buildScalar("constantDocBadge", ConstantDocBadge, { ConstantDocBadge }, "docLib");

const ConstantDocMemberInput = makeRef({ badge: field(ConstantDocBadge) });
ConstantRegistry.buildModel(
  "constantDocMember",
  ConstantDocMemberInput,
  ConstantDocMemberInput,
  ConstantDocMemberInput,
  ConstantDocMemberInput,
  makeRef({ count: field(Int, { default: 0 }) }),
  {},
  "docLib",
);
const ConstantDocMemberApp = makeRef({ badge: field(ConstantDocBadge), nick: field(String) });
ConstantRegistry.buildModel(
  "constantDocMember",
  ConstantDocMemberApp,
  ConstantDocMemberApp,
  ConstantDocMemberApp,
  ConstantDocMemberApp,
  makeRef({ count: field(Int, { default: 0 }) }),
  {},
  "docApp",
);

const ConstantDocShopInput = makeRef({ place: field(ConstantDocPlace) });
ConstantRegistry.buildModel(
  "constantDocShop",
  ConstantDocShopInput,
  ConstantDocShopInput,
  ConstantDocShopInput,
  ConstantDocShopInput,
  makeRef({ count: field(Int, { default: 0 }) }),
  { ConstantDocShopInput },
);

const ConstantDocUserInput = makeRef({
  name: field(String, { minlength: 2 }),
  role: field(String, { enum: ConstantDocRole } as never),
  metadata: field(Map, { of: String }),
  password: field.secret(String),
});
const ConstantDocUserObject = makeRef({
  ...ConstantDocUserInput[FIELD_META],
  organizationId: field(String, { ref: "organization", refType: "relation" }).toField(),
});
const LightConstantDocUser = makeRef({
  name: field(String, { minlength: 2 }),
  role: field(String, { enum: ConstantDocRole } as never),
});
const ConstantDocUser = makeRef({
  ...ConstantDocUserObject[FIELD_META],
  displayName: field(String, { text: "title" }).toField(),
});
const ConstantDocUserInsight = makeRef({
  ...ConstantDocUser[FIELD_META],
  total: field(Int, { default: 0, accumulate: {} }).toField(),
});

ConstantRegistry.buildModel(
  "constantDocUser",
  ConstantDocUserInput,
  ConstantDocUserObject,
  ConstantDocUser,
  LightConstantDocUser,
  ConstantDocUserInsight,
  {
    ConstantDocUserInput,
    ConstantDocUserObject,
    ConstantDocUser,
    LightConstantDocUser,
    ConstantDocUserInsight,
    ConstantDocRole,
  },
);

describe("constant schema docs", () => {
  test("builds selected database, scalar, and enum schemas", () => {
    const doc = getConstantSchemaDoc({
      models: ["constantDocUser"],
      scalars: ["constantDocAddress"],
      enums: ["constantDocRole"],
    });

    expect(doc.databases.map((database) => database.refName)).toEqual(["constantDocUser"]);
    expect(doc.scalars.map((scalar) => scalar.refName)).toEqual(["constantDocAddress"]);
    expect(doc.enums.map((enumSchema) => enumSchema.refName)).toEqual(["constantDocRole"]);
    expect(Object.keys(doc.databases[0].variants)).toEqual([...databaseModelVariants]);
  });

  test("normalizes field metadata for tables", () => {
    const doc = getConstantSchemaDoc({ models: ["constantDocUser"], scalars: ["constantDocAddress"] });
    const fullFields = doc.databases[0].variants.full.fields;
    const role = fullFields.find((field) => field.key === "role");
    const password = fullFields.find((field) => field.key === "password");
    const metadata = fullFields.find((field) => field.key === "metadata");
    const displayName = fullFields.find((field) => field.key === "displayName");

    expect(role?.enumValues).toEqual(["admin", "user"]);
    expect(password?.fieldType).toBe("secret");
    expect(password?.select).toBe(false);
    expect(metadata?.typeLabel).toBe("Map<String, String>");
    expect(displayName?.constraints).toContain("text:title");
  });

  test("collects enum usages and scalar fields", () => {
    const doc = getConstantSchemaDoc({
      models: ["constantDocUser"],
      scalars: ["constantDocAddress"],
      enums: ["constantDocRole"],
    });
    const roleEnum = doc.enums[0];
    const zipField = doc.scalars[0].fields.find((field) => field.key === "zip");

    expect(roleEnum.usedBy.some((usage) => usage.refName === "constantDocUser" && usage.fieldKey === "role")).toBe(
      true,
    );
    expect(zipField?.constraints).toContain("min 10000");
  });

  test("narrows scalars and enums to what the selected models reach", () => {
    const doc = getConstantSchemaDoc({ models: ["constantDocShop"] });

    expect(doc.databases.map((database) => database.refName)).toEqual(["constantDocShop"]);
    expect(doc.scalars.map((scalar) => scalar.refName)).toEqual(["constantDocGeo", "constantDocPlace"]);
    expect(doc.enums.map((enumSchema) => enumSchema.key)).toEqual(["constantDocTier"]);
  });

  test("reads an empty list as none and an omitted one as every registered entry", () => {
    const empty = getConstantSchemaDoc({ models: [] });
    expect(empty.databases).toEqual([]);
    expect(empty.scalars).toEqual([]);
    expect(empty.enums).toEqual([]);

    const all = getConstantSchemaDoc();
    expect(all.scalars.map((scalar) => scalar.refName)).toContain("constantDocUnused");
    expect(all.databases.map((database) => database.refName)).toContain("constantDocUser");
  });

  test("starts from include and stops at exclude", () => {
    const included = getConstantSchemaDoc({ include: ["constantDocShop", "constantDocUnused"] });
    expect(included.databases.map((database) => database.refName)).toEqual(["constantDocShop"]);
    expect(included.scalars.map((scalar) => scalar.refName)).toEqual([
      "constantDocGeo",
      "constantDocPlace",
      "constantDocUnused",
    ]);

    const excluded = getConstantSchemaDoc({ models: ["constantDocShop"], exclude: ["constantDocPlace"] });
    expect(excluded.scalars).toEqual([]);
    expect(excluded.enums).toEqual([]);
    expect(excluded.relations.find((relation) => relation.fieldKey === "place")?.external).toBe(true);
  });

  test("narrows by the owning library and stops at another library's scalars", () => {
    const doc = getConstantSchemaDoc({ libs: ["docApp"] });
    expect(doc.databases.map((database) => database.refName)).toEqual(["constantDocMember"]);
    expect(doc.databases[0].origin).toEqual(["docLib", "docApp"]);
    expect(doc.scalars).toEqual([]);
    expect(doc.relations.find((relation) => relation.fieldKey === "badge")?.external).toBe(true);

    const both = getConstantSchemaDoc({ libs: ["docApp", "docLib"] });
    expect(both.scalars.map((scalar) => scalar.refName)).toEqual(["constantDocBadge"]);
    expect(getConstantOwnerOrder().slice(0, 2)).toEqual(["docApp", "docLib"]);
  });
});
