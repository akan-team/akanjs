import { describe, expect, test } from "bun:test";
import { enumOf, Int } from "akanjs/base";
import { ConstantRegistry } from "./constantRegistry";
import { via } from "./via";

describe("RefNameClaims", () => {
  test("refuses two libs declaring one scalar refName with different fields, naming both", () => {
    const LibAInvite = via((field) => ({ orgId: field(String), orgName: field(String) }));
    const LibBInvite = via((field) => ({ devProjectId: field(String), count: field(Int).optional() }));
    ConstantRegistry.buildScalar("dupInvite", LibAInvite, {}, "libA");
    ConstantRegistry.buildScalar("dupInvite", LibBInvite, {}, "libB");

    expect(() => ConstantRegistry.assertConsistentRefNames()).toThrow(
      'scalar "dupInvite": "libA" (lib/__scalar/dupInvite) has orgId: String, orgName: String; "libB" (lib/__scalar/dupInvite) has devProjectId: String, count: Int?',
    );
    expect(ConstantRegistry.getScalar("dupInvite").model).toBe(LibBInvite as never);
    expect(ConstantRegistry.getRefName(LibAInvite)).toBe("dupInvite");

    const RenamedInvite = via((field) => ({ orgId: field(String), orgName: field(String) }));
    ConstantRegistry.buildScalar("dupInvite", RenamedInvite, {}, "libB");
    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
  });

  test("tells a secret, hidden or visual field from a plain one of the same type", () => {
    const LibACredential = via((field) => ({
      token: field.secret(String),
      note: field.hidden(String),
      art: field.visual(String),
    }));
    const LibBCredential = via((field) => ({
      token: field(String).optional(),
      note: field(String).optional(),
      art: field(String),
    }));
    ConstantRegistry.buildScalar("dupCredential", LibACredential, {}, "libA");
    ConstantRegistry.buildScalar("dupCredential", LibBCredential, {}, "libB");

    expect(() => ConstantRegistry.assertConsistentRefNames()).toThrow(
      'scalar "dupCredential": "libA" (lib/__scalar/dupCredential) has token: secret String?, note: hidden String?, art: visual String; "libB" (lib/__scalar/dupCredential) has token: String?, note: String?, art: String',
    );
    ConstantRegistry.buildScalar(
      "dupCredential",
      via((field) => ({ token: field.secret(String), note: field.hidden(String), art: field.visual(String) })),
      {},
      "libB",
    );
    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
  });

  test("reads the same fields under two libs as one declaration, the latest serving", () => {
    const FirstCopy = via((field) => ({ lat: field(Int), tags: field([String]) }));
    const SecondCopy = via((field) => ({ lat: field(Int), tags: field([String]) }));
    ConstantRegistry.buildScalar("sameGeo", FirstCopy, {}, "libA");
    ConstantRegistry.buildScalar("sameGeo", SecondCopy, {}, "libB");

    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
    expect(ConstantRegistry.getScalar("sameGeo").model).toBe(SecondCopy as never);
    expect(ConstantRegistry.getOrigin("scalar", "sameGeo")).toEqual(["libA", "libB"]);
  });

  test("refuses one enum key with different values, and takes the same values", () => {
    class LibAStatus extends enumOf("dupStatus", ["active", "paused"] as const) {}
    class LibBStatus extends enumOf("dupStatus", ["active", "archived"] as const) {}
    const Carrier = via((field) => ({ note: field(String) }));
    ConstantRegistry.buildScalar("statusCarrierA", Carrier, { DupStatus: LibAStatus }, "libA");
    ConstantRegistry.buildScalar("statusCarrierB", Carrier, { DupStatus: LibBStatus }, "libB");

    expect(() => ConstantRegistry.assertConsistentRefNames()).toThrow(
      'enum "dupStatus": "libA" (lib/__scalar/statusCarrierA) has paused; "libB" (lib/__scalar/statusCarrierB) has archived',
    );

    class SameStatus extends enumOf("dupStatus", ["active", "paused"] as const) {}
    ConstantRegistry.buildScalar("statusCarrierB", Carrier, { DupStatus: SameStatus }, "libB");
    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
    expect(ConstantRegistry.enum.get("dupStatus")).toBe(SameStatus as never);
  });

  test("lets an app model extend a lib model of its refName, the app's class serving", () => {
    const LibInput = via((field) => ({ name: field(String) }));
    const LibObject = via(LibInput, () => ({}));
    const LibLight = via(LibObject, ["name"] as const, () => ({}));
    class LibFull extends via(LibObject, LibLight, () => ({})) {}
    const LibInsight = via(LibFull, () => ({}));
    ConstantRegistry.buildModel("overrideMember", LibInput, LibObject, LibFull, LibLight, LibInsight, {}, "lib");

    const AppInput = via((field) => ({ nick: field(String) }), LibInput);
    const AppObject = via(AppInput, () => ({}), LibObject);
    const AppLight = via(AppObject, ["nick"] as const, () => ({}), LibLight);
    class AppFull extends via(AppObject, AppLight, () => ({}), LibFull) {}
    const AppInsight = via(AppFull, () => ({}), LibInsight);
    ConstantRegistry.buildModel("overrideMember", AppInput, AppObject, AppFull, AppLight, AppInsight, {}, "app");

    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
    expect(ConstantRegistry.getDatabase("overrideMember").full).toBe(AppFull as never);
  });

  test("refuses an app model of a lib's refName that does not extend it", () => {
    const LibInput = via((field) => ({ name: field(String), nick: field(String) }));
    const LibObject = via(LibInput, () => ({}));
    const LibLight = via(LibObject, ["name"] as const, () => ({}));
    class LibFull extends via(LibObject, LibLight, () => ({})) {}
    const LibInsight = via(LibFull, () => ({}));
    ConstantRegistry.buildModel("rivalMember", LibInput, LibObject, LibFull, LibLight, LibInsight, {}, "lib");

    const AppInput = via((field) => ({ name: field(String), title: field(String) }));
    const AppObject = via(AppInput, () => ({}));
    const AppLight = via(AppObject, ["name"] as const, () => ({}));
    class AppFull extends via(AppObject, AppLight, () => ({})) {}
    const AppInsight = via(AppFull, () => ({}));
    ConstantRegistry.buildModel("rivalMember", AppInput, AppObject, AppFull, AppLight, AppInsight, {}, "app");

    expect(() => ConstantRegistry.assertConsistentRefNames()).toThrow(
      'model "rivalMember" (RivalMember): "lib" (lib/rivalMember) has nick: String; "app" (lib/rivalMember) has title: String',
    );
    ConstantRegistry.buildModel("rivalMember", LibInput, LibObject, LibFull, LibLight, LibInsight, {}, "app");
    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
  });

  test("names an embedded scalar by the refName it registers under, even when it registers later", () => {
    const LibAGeo = via((field) => ({ lat: field(Int) }));
    const LibBGeo = via((field) => ({ lat: field(Int) }));
    const LibAPlace = via((field) => ({ geo: field(LibAGeo) }));
    const LibBPlace = via((field) => ({ geo: field(LibBGeo) }));
    ConstantRegistry.buildScalar("nestPlace", LibAPlace, {}, "libA");
    ConstantRegistry.buildScalar("nestGeo", LibAGeo, {}, "libA");
    ConstantRegistry.buildScalar("nestPlace", LibBPlace, {}, "libB");
    ConstantRegistry.buildScalar("nestGeo", LibBGeo, {}, "libB");
    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();

    ConstantRegistry.buildScalar("nestOtherGeo", LibBGeo, {}, "libB");
    expect(() => ConstantRegistry.assertConsistentRefNames()).toThrow(
      'scalar "nestPlace": "libA" (lib/__scalar/nestPlace) has geo: NestGeo; "libB" (lib/__scalar/nestPlace) has geo: NestOtherGeo',
    );
    ConstantRegistry.buildScalar("nestGeo", LibBGeo, {}, "libB");
    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
  });

  test("takes a re-registration from the same origin as the module re-evaluated", () => {
    const Before = via((field) => ({ title: field(String) }));
    const After = via((field) => ({ title: field(String), body: field(String) }));
    ConstantRegistry.buildScalar("hmrNote", Before, {}, "app");
    ConstantRegistry.buildScalar("hmrNote", After, {}, "app");

    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
    expect(ConstantRegistry.getScalar("hmrNote").model).toBe(After as never);
    expect(ConstantRegistry.getOrigin("scalar", "hmrNote")).toEqual(["app"]);
  });

  test("names a registrant without an origin by the file that registered it", () => {
    const Framework = via((field) => ({ text: field(String) }));
    const Lib = via((field) => ({ text: field(Int) }));
    ConstantRegistry.buildScalar("sitedTurn", Framework, {});
    ConstantRegistry.buildScalar("sitedTurn", Lib, {}, "lib");

    expect(() => ConstantRegistry.assertConsistentRefNames()).toThrow(
      new RegExp(
        `scalar "sitedTurn": ${import.meta.path.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&")}:\\d+ has text: String`,
      ),
    );
    ConstantRegistry.buildScalar(
      "sitedTurn",
      via((field) => ({ text: field(String) })),
      {},
      "lib",
    );
    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
  });
});
