import { describe, expect, test } from "bun:test";
import { AkanError } from "../../base/akanError";
import { EnvProfile } from "./envProfile";

describe("EnvProfile.active", () => {
  test("no profile is active while AKAN_ENV_PROFILE is unset or empty, whatever the build carries", () => {
    expect(EnvProfile.active({}, "edge")).toBeNull();
    expect(EnvProfile.active({ AKAN_ENV_PROFILE: "" }, "edge")).toBeNull();
    expect(EnvProfile.active({}, undefined)).toBeNull();
  });

  test("a profile the build carries is the active one", () => {
    expect(EnvProfile.active({ AKAN_ENV_PROFILE: "edge" }, EnvProfile.format(["edge", "kiosk"]))).toBe("edge");
    expect(EnvProfile.active({ AKAN_ENV_PROFILE: "kiosk" }, "edge,kiosk")).toBe("kiosk");
  });

  test("a profile the build does not carry stops the server, naming what it carries", () => {
    const refusal = (carried: string | undefined) => {
      try {
        EnvProfile.active({ AKAN_ENV_PROFILE: "desk" }, carried);
      } catch (error) {
        return error;
      }
      return null;
    };
    const none = refusal(undefined);
    expect(AkanError.is(none, "envProfileUnbuilt")).toBe(true);
    expect((none as Error).message).toContain(
      "AKAN_ENV_PROFILE=desk names a server env profile this server was not built with (it carries none), so it does not start",
    );
    expect((refusal("edge,kiosk") as Error).message).toContain("(it carries edge, kiosk)");
    expect(AkanError.is(refusal(""), "envProfileUnbuilt")).toBe(true);
  });
});
