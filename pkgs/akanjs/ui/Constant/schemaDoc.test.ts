import { describe, expect, test } from "bun:test";
import { enumOf, FIELD_META, Int } from "akanjs/base";
import { type ConstantCls, type ConstantField, ConstantRegistry, type FieldInfoObject, field } from "akanjs/constant";

import { databaseModelVariants, getConstantSchemaDoc } from "./schemaDoc";

const ConstantDocRole = enumOf("constantDocRole", ["admin", "user"] as const);
ConstantRegistry.enum.set("constantDocRole", ConstantDocRole);

const makeRef = (fields: FieldInfoObject | Record<string, ConstantField>): ConstantCls => {
  class TestConstant {}
  Object.assign(TestConstant, {
    [FIELD_META]: Object.fromEntries(
      Object.entries(fields).map(([key, fieldInfo]) => [key, "toField" in fieldInfo ? fieldInfo.toField() : fieldInfo]),
    ),
    children: new Set(),
    relations: new Set(),
    enums: new Set(),
    text: { search: new Set(), filter: new Set(), children: { search: new Set(), filter: new Set() } },
  });
  return TestConstant as ConstantCls;
};

const ConstantDocAddress = makeRef({
  city: field(String),
  zip: field(Int, { default: 10000, min: 10000 }),
});
ConstantRegistry.buildScalar("constantDocAddress", ConstantDocAddress, { ConstantDocAddress });

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
  displayName: field(String, { text: "search" }).toField(),
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
    expect(displayName?.constraints).toContain("text:search");
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
});
