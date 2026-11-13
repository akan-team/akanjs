import { describe, expect, test } from "bun:test";
import { AkanError, enumOf, ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type { DatabaseModule, ServiceModule } from "../akanLib";
import { assertUniqueRegistrations, getModuleCascadeRefNames, getModuleRelationRefNames, runStage } from "./utils";

const OwnerInput = via((f) => ({ url: f(String) }));
const OwnerObject = via(OwnerInput, () => ({}));
const OwnerLight = via(OwnerObject, ["url"] as const, () => ({}));
const OwnerFull = via(OwnerObject, OwnerLight, () => ({}));
const OwnerInsight = via(OwnerFull, () => ({}));
ConstantRegistry.buildModel("diUtilsOwner", OwnerInput, OwnerObject, OwnerFull, OwnerLight, OwnerInsight, {
  OwnerInput,
  OwnerObject,
  OwnerFull,
  OwnerLight,
  OwnerInsight,
});

class DiUtilsParentType extends enumOf("diUtilsParentType", ["diUtilsOwner", "diUtilsAlbum"] as const) {}

const asDatabaseModule = (full: unknown) => ({ constant: { full } }) as unknown as DatabaseModule;

describe("getModuleCascadeRefNames", () => {
  test("collects removeRef targets", () => {
    const Model = via((f) => ({
      cover: f(OwnerFull, { cascade: "removeRef" }).optional(),
      untouched: f(OwnerFull).optional(),
    }));

    expect([...getModuleCascadeRefNames(asDatabaseModule(Model))]).toEqual(["diUtilsOwner"]);
  });

  test("collects a monomorphic removeWith owner and skips a polymorphic one", () => {
    const Model = via((f) => ({
      owner: f(ID, { ref: "diUtilsOwner", cascade: "removeWith" }),
      parent: f(ID, { refPath: "parentType", cascade: "removeWith" }),
      parentType: f(DiUtilsParentType),
    }));

    expect([...getModuleCascadeRefNames(asDatabaseModule(Model))]).toEqual(["diUtilsOwner"]);
  });

  test("reads nothing off a service module, which owns no constant", () => {
    expect([...getModuleCascadeRefNames({ service: {}, signal: {} } as unknown as ServiceModule)]).toEqual([]);
  });
});

const SpotInput = via((f) => ({ owner: f(OwnerFull).optional(), label: f(String) }));
ConstantRegistry.buildScalar("diUtilsSpot", SpotInput, { SpotInput });

class DiUtilsLevel extends enumOf("diUtilsLevel", ["low", "high"] as const) {}

describe("getModuleRelationRefNames", () => {
  test("collects relation targets, including those inside a scalar, and skips primitives and enums", () => {
    const Model = via((f) => ({
      owner: f(OwnerFull).optional(),
      spots: f([SpotInput]),
      level: f(DiUtilsLevel),
      count: f(Int),
      ownerId: f(ID).optional(),
    }));

    expect([...getModuleRelationRefNames(asDatabaseModule(Model))]).toEqual(["diUtilsOwner"]);
  });

  test("reads nothing off a service module, which owns no constant", () => {
    expect(getModuleRelationRefNames({} as ServiceModule).size).toBe(0);
  });
});

describe("assertUniqueRegistrations", () => {
  test("passes when every key is claimed once", () => {
    expect(() =>
      assertUniqueRegistrations("use", [
        { key: "storageApi", owner: 'lib "util"' },
        { key: "rootAdminInfo", owner: 'lib "shared"' },
      ]),
    ).not.toThrow();
  });

  test("names both claimants of a repeated key, as duplicateRegistration", () => {
    let failure: unknown;
    try {
      assertUniqueRegistrations("use", [
        { key: "storageApi", owner: 'lib "util"' },
        { key: "storageApi", owner: 'lib "shared"' },
      ]);
    } catch (error) {
      failure = error;
    }

    expect(AkanError.is(failure, "duplicateRegistration")).toBe(true);
    expect(failure).toMatchObject({
      statusCode: 500,
      message:
        '[DI:use] 1 duplicate registration(s):\n  • "storageApi" is registered by lib "util" and by lib "shared"',
    });
  });
});

describe("runStage", () => {
  test("fails a stage as stageFailed, summarizing every failed task and keeping each one's error", async () => {
    const refused = new Error("connection refused");

    const failure = await runStage("adaptor[stage=0]", [
      { label: "adaptor:ok", run: async () => undefined },
      { label: "adaptor:db", run: async () => Promise.reject(refused) },
      { label: "adaptor:cache", run: async () => Promise.reject("timed out") },
    ]).catch((error: unknown) => error);

    expect(AkanError.is(failure, "stageFailed")).toBe(true);
    expect(failure).toMatchObject({
      statusCode: 500,
      message:
        "[DI:adaptor[stage=0]] 2/3 task(s) failed:\n  • adaptor:db: connection refused\n  • adaptor:cache: timed out",
    });
    expect((failure as { errors: Error[] }).errors.map((error) => error.message)).toEqual([
      "connection refused",
      "timed out",
    ]);
    expect((failure as { errors: Error[] }).errors[0]).toBe(refused);
  });
});
