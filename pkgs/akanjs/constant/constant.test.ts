import { describe, expect, test } from "bun:test";
import { dayjs, enumOf, FIELD_META, Float, ID, Int, type PrimitiveScalar } from "akanjs/base";
import { immerable } from "immer";
import {
  type ConstantCls,
  ConstantField,
  ConstantRegistry,
  type DocumentModel,
  deserialize,
  type ExtractFieldInfoObject,
  type FieldBuilder,
  type FieldInfoObjectToFieldObject,
  immerify,
  type NonFunctionalKeys,
  type PurifiedModel,
  serialize,
  via,
} from ".";

const Role = enumOf("ConstantTestRole", ["admin", "user"] as const);

const CoordinateInput = via((f) => ({
  lat: f(Int, { default: 37 }),
  lng: f(Int, { default: 127 }),
}));
ConstantRegistry.buildScalar("constantTestCoordinate", CoordinateInput, { CoordinateInput });

const AddressInput = via((f) => ({
  city: f(String),
  zip: f(Int, { default: 10000 }),
  coordinate: f(CoordinateInput),
}));
ConstantRegistry.buildScalar("constantTestAddress", AddressInput, { AddressInput });

const ComplexInput = via((f) => ({
  settings: f(Map, { of: String }),
  cube: f([[[[Int]]]] as never),
  addressCube: f([[[AddressInput]]] as never),
  primaryAddress: f(AddressInput),
  addressBook: f(Map, { of: AddressInput as unknown as typeof PrimitiveScalar }),
}));
ConstantRegistry.buildScalar("constantTestComplex", ComplexInput, { ComplexInput });

const BooleanState = via((f) => ({
  enabled: f(Boolean),
}));
ConstantRegistry.buildScalar("constantTestBooleanState", BooleanState, { BooleanState });

const UserInput = via((f) => ({
  name: f(String),
  age: f(Int, { default: 20 }),
  role: f(String, { default: "user" }),
  tags: f([String]),
  metadata: f(Map, { of: String }),
  password: f.secret(String),
}));
const UserObject = via(UserInput, (f) => ({
  note: f(String).optional(),
}));
const UserLight = via(UserObject, ["name", "role"] as const, (r) => ({
  profileText: r(String, { text: "search" }),
}));
class MethodUserLight extends via(UserObject, ["name", "role"] as const, (r) => ({
  profileText: r(String, { text: "search" }),
})) {
  hello() {
    return "hello" as const;
  }
}
const UserFull = via(UserObject, UserLight, (r) => ({
  addressLabel: r(String, { text: "filter" }),
}));
const UserInsight = via(UserFull, (f) => ({
  activeCount: f(Int, { default: 0, accumulate: { role: "admin" } }),
}));
const userModel = ConstantRegistry.buildModel(
  "constantTestUser",
  UserInput,
  UserObject,
  UserFull,
  UserLight,
  UserInsight,
  { UserInput, UserObject, UserFull, UserLight, UserInsight, Role, statusLabel: "active" },
);

const TeamInput = via((f) => ({
  owner: f(UserLight),
  members: f([UserLight]),
}));
const TeamObject = via(TeamInput, (f) => ({
  title: f(String),
}));
const TeamLight = via(TeamObject, ["owner", "members", "title"] as const, (r) => ({}));
const TeamFull = via(TeamObject, TeamLight, (r) => ({}));
const TeamInsight = via(TeamFull, (f) => ({}));
ConstantRegistry.buildModel("constantTestTeam", TeamInput, TeamObject, TeamFull, TeamLight, TeamInsight, {
  TeamInput,
  TeamObject,
  TeamFull,
  TeamLight,
  TeamInsight,
});

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const buildTypeOptimizedFields = (f: FieldBuilder) => ({
  status: f(Role),
  related: f(UserLight),
  relatedList: f([UserLight]),
  metadataMap: f(Map, { of: String }),
  hiddenValue: f.hidden(String),
  secretValue: f.secret(String),
});
const buildRelationMethodFields = (f: FieldBuilder) => ({
  owner: f(MethodUserLight),
  members: f([MethodUserLight]),
});
const buildNumericFieldTypeChecks = (f: FieldBuilder) => ({
  int: f<number>(Int),
  float: f<number>(Float),
  // @ts-expect-error Number is not an Akan scalar; choose Int or Float explicitly.
  number: f(Number),
  // @ts-expect-error Number arrays must choose Int or Float explicitly.
  numberList: f([Number]),
  // @ts-expect-error Explicit number fields still need Int or Float.
  explicitNumber: f<number>(Number),
});
type TypeOptimizedFieldObject = FieldInfoObjectToFieldObject<ReturnType<typeof buildTypeOptimizedFields>>;
type TypeOptimizedInputRef = ConstantCls<
  ExtractFieldInfoObject<ReturnType<typeof buildTypeOptimizedFields>>,
  TypeOptimizedFieldObject
>;
type NumericFieldTypeCheckResult = ReturnType<typeof buildNumericFieldTypeChecks>;
type RelationMethodSchema = ExtractFieldInfoObject<ReturnType<typeof buildRelationMethodFields>>;
const TypeOptimizedExtendedInput = via(
  (f) => ({
    extraCount: f(Int),
  }),
  UserInput,
);

type _TypeOptimizedAssertions = [
  Assert<Equal<TypeOptimizedInputRef["_EnumKey"], "status">>,
  Assert<Equal<TypeOptimizedInputRef["_RelationKey"], "related" | "relatedList">>,
  Assert<Equal<TypeOptimizedInputRef["_MapKey"], "metadataMap">>,
  Assert<Equal<TypeOptimizedInputRef["_HiddenKey"], "hiddenValue">>,
  Assert<Equal<TypeOptimizedInputRef["_SecretKey"], "secretValue">>,
  Assert<
    Equal<
      keyof (typeof TypeOptimizedExtendedInput)["_OwnSchema"],
      "name" | "age" | "role" | "tags" | "metadata" | "password" | "extraCount"
    >
  >,
  Assert<Equal<keyof NumericFieldTypeCheckResult, "int" | "float" | "number" | "numberList" | "explicitNumber">>,
];
type _RelationMethodAssertions = [
  Assert<Equal<RelationMethodSchema["owner"], InstanceType<typeof MethodUserLight>>>,
  Assert<Equal<RelationMethodSchema["members"], InstanceType<typeof MethodUserLight>[]>>,
  Assert<Equal<ReturnType<RelationMethodSchema["owner"]["hello"]>, "hello">>,
  Assert<Equal<ReturnType<InstanceType<typeof MethodUserLight>["set"]>, InstanceType<typeof MethodUserLight>>>,
  Assert<Equal<DocumentModel<RelationMethodSchema>["owner"], string>>,
  Assert<Equal<DocumentModel<RelationMethodSchema>["members"], string[]>>,
  Assert<Equal<PurifiedModel<RelationMethodSchema>["owner"], string>>,
  Assert<Equal<Extract<NonFunctionalKeys<InstanceType<typeof MethodUserLight>>, "hello">, never>>,
  Assert<Equal<Extract<NonFunctionalKeys<InstanceType<typeof MethodUserLight>>, "name">, "name">>,
];

const validUserId = "1234567890abcdef12345678";
const validChildId = "abcdefabcdefabcdefabcdef";
const complexInput = (input: Record<string, unknown>) => input as never;

const createUser = () =>
  new UserFull({
    id: validUserId,
    name: "Ada",
    age: 31,
    role: "admin",
    tags: ["founder", "engineer"],
    metadata: { locale: "ko" } as never,
    password: "secret",
    note: "hello",
    profileText: "Ada profile",
    addressLabel: "Seoul",
    createdAt: "2026-01-01T00:00:00.000Z" as never,
    updatedAt: "2026-01-02T00:00:00.000Z" as never,
  });

describe("via and ConstantField", () => {
  test("builds field metadata and default values", () => {
    expect(UserInput.modelType).toBe("input");
    expect(UserObject.modelType).toBe("object");
    expect(UserLight.modelType).toBe("light");
    expect(UserFull.modelType).toBe("full");
    expect(UserInsight.modelType).toBe("insight");

    const nameField = UserFull[FIELD_META].name;
    const metadataField = UserFull[FIELD_META].metadata;
    const passwordField = UserFull[FIELD_META].password;

    expect(nameField).toBeInstanceOf(ConstantField);
    expect(nameField.modelRef).toBe(String);
    expect(metadataField.isMap).toBe(true);
    expect(metadataField.of).toBe(String);
    expect(passwordField.fieldType).toBe("secret");
    expect(passwordField.select).toBe(false);

    expect(UserFull.getDefault()).toMatchObject({
      name: "",
      age: 20,
      role: "user",
      tags: [],
      metadata: undefined,
      note: null,
      addressLabel: "",
      password: null,
    });
    expect(UserFull.text.search.has("profileText")).toBe(true);
    expect(UserFull.text.filter.has("addressLabel")).toBe(true);
  });

  test("crystalizes constructor input into typed runtime values", () => {
    const user = createUser();

    expect(user.createdAt.toISOString()).toBe(dayjs("2026-01-01T00:00:00.000Z").toISOString());
    expect(user.metadata).toBeInstanceOf(Map);
    expect(user.metadata.get("locale")).toBe("ko");

    user.set({ age: 32 });

    expect(user.age).toBe(32);

    const address = new AddressInput({ city: "Seoul" } as never);
    expect(address.city).toBe("Seoul");
    expect(address.zip).toBe(10000);
  });

  test("supports maps, deep nested objects, and high-dimensional arrays", () => {
    const cube = [
      [
        [
          [1, 2],
          [3, 4],
        ],
      ],
    ];
    const addressCube = [
      [
        [
          { city: "Seoul", zip: 12345, coordinate: { lat: 37, lng: 127 } },
          { city: "Busan", zip: 23456, coordinate: { lat: 35, lng: 129 } },
        ],
      ],
    ];
    const complex = new ComplexInput(
      complexInput({
        settings: { theme: "dark", locale: "ko" } as never,
        cube,
        addressCube,
        primaryAddress: { city: "Jeju", coordinate: { lat: 33, lng: 126 } },
        addressBook: {
          home: { city: "Seoul", zip: 12345, coordinate: { lat: 37, lng: 127 } },
          office: { city: "Pangyo", coordinate: { lat: 37, lng: 127 } },
        } as never,
      }),
    );
    const cubeField = ComplexInput[FIELD_META].cube;
    const addressCubeField = ComplexInput[FIELD_META].addressCube;
    const primaryAddressField = ComplexInput[FIELD_META].primaryAddress;
    const addressBookField = ComplexInput[FIELD_META].addressBook;

    expect(cubeField.arrDepth).toBe(4);
    expect(cubeField.modelRef).toBe(Int as unknown as typeof cubeField.modelRef);
    expect(addressCubeField.arrDepth).toBe(3);
    expect(addressCubeField.modelRef).toBe(AddressInput as unknown as typeof addressCubeField.modelRef);
    expect(addressCubeField.isScalar).toBe(true);
    expect(primaryAddressField.isClass).toBe(true);
    expect(primaryAddressField.isScalar).toBe(true);
    expect(addressBookField.isMap).toBe(true);
    expect(addressBookField.of).toBe(AddressInput as unknown as typeof addressBookField.of);

    const complexValue = complex as {
      settings: Map<string, string>;
      cube: number[][][][];
      primaryAddress: InstanceType<typeof AddressInput>;
      addressCube: InstanceType<typeof AddressInput>[][][];
      addressBook: Map<string, InstanceType<typeof AddressInput>>;
    };
    expect(complexValue.settings).toBeInstanceOf(Map);
    expect(complexValue.settings.get("theme")).toBe("dark");
    expect(complexValue.cube).toEqual(cube);
    expect(complexValue.primaryAddress).toBeInstanceOf(AddressInput);
    expect(complexValue.primaryAddress.coordinate).toBeInstanceOf(CoordinateInput);
    expect(complexValue.primaryAddress.zip).toBe(10000);
    expect(complexValue.addressCube[0][0][1]).toBeInstanceOf(AddressInput);
    expect(complexValue.addressCube[0][0][1].coordinate.lat).toBe(35);
    expect(complexValue.addressBook).toBeInstanceOf(Map);
    expect(complexValue.addressBook.get("office")?.zip).toBe(10000);
  });
});

describe("ConstantRegistry", () => {
  test("registers model refs and resolves model names", () => {
    expect(ConstantRegistry.getDatabase("constantTestUser")).toBe(userModel);
    expect(ConstantRegistry.getScalar("constantTestAddress").model).toBe(AddressInput as never);
    expect(ConstantRegistry.getRefName(UserFull)).toBe("constantTestUser");
    expect(ConstantRegistry.getModelName(UserInput)).toBe("ConstantTestUserInput");
    expect(ConstantRegistry.getModelName(UserObject)).toBe("ConstantTestUserObject");
    expect(ConstantRegistry.getModelName(UserLight)).toBe("LightConstantTestUser");
    expect(ConstantRegistry.getModelName(UserFull)).toBe("ConstantTestUser");
    expect(ConstantRegistry.getModelName(UserInsight)).toBe("ConstantTestUserInsight");
    expect(ConstantRegistry.getModelName(ID)).toBe("ID");
    expect(ConstantRegistry.value.get("statusLabel")).toBe("active");
  });

  test("serializes and deserializes primitive and model values", () => {
    expect(ConstantRegistry.serialize(Int, 7 as never)).toBe(7 as never);
    expect(ConstantRegistry.deserialize(Int, "7")).toBe(7 as never);

    const user = createUser();
    const serialized = ConstantRegistry.serialize(UserFull, user);

    expect(serialized).toMatchObject({
      id: validUserId,
      name: "Ada",
      age: 31,
      role: "admin",
      tags: ["founder", "engineer"],
      metadata: { locale: "ko" },
    });
    expect(serialized.createdAt).toBeInstanceOf(Date);

    const deserialized = ConstantRegistry.deserialize(UserFull, serialized);

    expect(deserialized.createdAt.toISOString()).toBe(user.createdAt.toISOString());
    expect(deserialized.metadata).toEqual({ locale: "ko" } as never);
  });
});

describe("serialize, deserialize, purify, and immerify", () => {
  test("normalizes numeric boolean values from persisted rows", () => {
    expect(serialize(Boolean, 0, 1, "object", {}) as unknown as boolean).toBe(true);
    expect(serialize(Boolean, 0, 0, "object", {}) as unknown as boolean).toBe(false);
    expect(deserialize(Boolean, 0, 1, {}) as unknown as boolean).toBe(true);
    expect(deserialize(Boolean, 0, 0, {}) as unknown as boolean).toBe(false);
    expect(serialize(BooleanState, 0, { enabled: 1 }, "object", {}) as unknown as { enabled: boolean }).toEqual({
      enabled: true,
    });
    expect(serialize(BooleanState, 0, { enabled: 0 }, "object", {}) as unknown as { enabled: boolean }).toEqual({
      enabled: false,
    });
    expect(() => serialize(Boolean, 0, 2, "object", {})).toThrow("Invalid Boolean value: 2");
  });

  test("handles arrays and nullable values", () => {
    const serialized = serialize(String, 1, ["a", "b"], "object", {});
    expect(serialized).toEqual(["a", "b"] as never);
    expect(serialize(String, 0, null, "object", { nullable: true })).toBeNull();
    expect(() => serialize(String, 0, null, "object", { key: "name" })).toThrow("Invalid Value (Nullable)");

    expect(deserialize(String, 1, ["a", "b"], {})).toEqual(["a", "b"] as never);
    expect(deserialize(String, 0, null, { nullable: true })).toBeNull();
    expect(() => deserialize(String, 0, null, { key: "name" })).toThrow("Invalid Value (Nullable)");
  });

  test("serializes and deserializes complex schema shapes", () => {
    const complex = new ComplexInput(
      complexInput({
        settings: { theme: "dark" } as never,
        cube: [[[[1, 2, 3]]]],
        addressCube: [[[{ city: "Seoul", coordinate: { lat: 37, lng: 127 } }]]],
        primaryAddress: { city: "Jeju", coordinate: { lat: 33, lng: 126 } },
        addressBook: {
          home: { city: "Seoul", coordinate: { lat: 37, lng: 127 } },
        } as never,
      }),
    );

    const serialized = serialize(ComplexInput, 0, complex, "object", {});

    expect(serialized).toMatchObject({
      settings: { theme: "dark" },
      cube: [[[[1, 2, 3]]]],
      addressCube: [[[{ city: "Seoul", zip: 10000, coordinate: { lat: 37, lng: 127 } }]]],
      primaryAddress: { city: "Jeju", zip: 10000, coordinate: { lat: 33, lng: 126 } },
      addressBook: { home: { city: "Seoul", zip: 10000, coordinate: { lat: 37, lng: 127 } } },
    });

    const deserialized = deserialize(ComplexInput, 0, serialized, {}) as unknown as {
      settings: Record<string, string>;
      cube: number[][][][];
      addressCube: { coordinate: { lat: number; lng: number } }[][][];
      primaryAddress: { coordinate: { lng: number } };
      addressBook: Record<string, { coordinate: { lng: number } }>;
    };

    expect(deserialized.settings).toEqual({ theme: "dark" });
    expect(deserialized.cube).toEqual([[[[1, 2, 3]]]]);
    expect(deserialized.addressCube[0][0][0].coordinate.lat).toBe(37);
    expect(deserialized.primaryAddress.coordinate.lng).toBe(126);
    expect(deserialized.addressBook.home.coordinate.lng).toBe(127);
  });

  test("preserves resolved relation objects when serializing response objects", () => {
    const user = createUser();
    const team = new TeamFull({
      id: validChildId,
      owner: user,
      members: [user],
      title: "Core",
      createdAt: "2026-01-01T00:00:00.000Z" as never,
      updatedAt: "2026-01-02T00:00:00.000Z" as never,
    });

    const objectSerialized = serialize(TeamFull, 0, team, "object", {}) as unknown as {
      owner: { id: string; name: string };
      members: { id: string; name: string }[];
    };
    const inputSerialized = serialize(TeamFull, 0, team, "input", {}) as unknown as {
      owner: string;
      members: string[];
    };

    expect(objectSerialized.owner).toMatchObject({ id: validUserId, name: "Ada" });
    expect(objectSerialized.members[0]).toMatchObject({ id: validUserId, name: "Ada" });
    expect(inputSerialized.owner).toBe(validUserId);
    expect(inputSerialized.members).toEqual([validUserId]);
  });

  test("purifies valid input and rejects invalid values", () => {
    const user = createUser();
    const purified = UserFull.purify(user);

    expect(purified).toMatchObject({
      id: validUserId,
      name: "Ada",
      role: "admin",
      metadata: { locale: "ko" },
    });

    expect(UserFull.purify({ ...UserFull.getDefault(), id: "bad-user" })).toBeNull();
    expect(UserObject.purify({ id: validChildId } as never, true)).toBe(validChildId as never);
    expect(() => UserObject.purify({} as never, true)).toThrow("Invalid Value (No ID)");
  });

  test("purifies complex schema shapes", () => {
    const complex = new ComplexInput(
      complexInput({
        settings: { theme: "dark" } as never,
        cube: [[[[1]]]],
        addressCube: [[[{ city: "Seoul", coordinate: { lat: 37, lng: 127 } }]]],
        primaryAddress: { city: "Jeju", coordinate: { lat: 33, lng: 126 } },
        addressBook: {
          home: { city: "Seoul", coordinate: { lat: 37, lng: 127 } },
        } as never,
      }),
    );

    expect(ComplexInput.purify(complex)).toMatchObject({
      settings: { theme: "dark" },
      cube: [[[[1]]]],
      addressCube: [[[{ city: "Seoul", zip: 10000, coordinate: { lat: 37, lng: 127 } }]]],
      primaryAddress: { city: "Jeju", zip: 10000, coordinate: { lat: 33, lng: 126 } },
      addressBook: { home: { city: "Seoul", zip: 10000, coordinate: { lat: 37, lng: 127 } } },
    });

    expect(ComplexInput.purify({ ...ComplexInput.getDefault(), cube: [[1]] } as never)).toBeNull();
  });

  test("marks plain model objects as immerable recursively", () => {
    const user = createUser();
    const plain = serialize(UserFull, 0, user, "object", {}) as unknown as typeof user;
    const immered = immerify(UserFull as never, plain);

    expect((immered as unknown as Record<symbol, unknown>)[immerable]).toBe(true);
    const address = immerify(AddressInput as never, { city: "Seoul", zip: 12345 });
    expect((address as Record<symbol, unknown>)[immerable]).toBe(true);
  });
});
