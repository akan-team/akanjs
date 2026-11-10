import { describe, expect, test } from "bun:test";
import { SsrBaseArtifactBuilder } from "./ssrBaseArtifactBuilder";

describe("SsrBaseArtifactBuilder.outletModuleMap", () => {
  const outlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const ssrOutput = "/dist/client-ssr/rscSegmentOutlet.js";
  const manifest = {
    [`${outlet}#AkanSegmentOutlet`]: { id: "/_akan/client/outlet.js", chunks: [], name: "AkanSegmentOutlet" },
    [`${outlet}#AkanRouteHead`]: { id: "/_akan/client/outlet.js", chunks: [], name: "AkanRouteHead" },
    "pkgs/akanjs/ui/Other.tsx#Other": { id: "/_akan/client/other.js", chunks: [], name: "Other" },
  };

  test("keeps every export of the outlet module under its one client id, each served by the SSR build", () => {
    expect(SsrBaseArtifactBuilder.outletModuleMap(manifest, outlet, ssrOutput)).toEqual({
      "/_akan/client/outlet.js": {
        AkanSegmentOutlet: { id: ssrOutput, chunks: [ssrOutput, ssrOutput], name: "AkanSegmentOutlet", async: true },
        AkanRouteHead: { id: ssrOutput, chunks: [ssrOutput, ssrOutput], name: "AkanRouteHead", async: true },
      },
    });
  });

  test("is empty without the outlet's SSR build or client reference", () => {
    expect(SsrBaseArtifactBuilder.outletModuleMap(manifest, outlet, undefined)).toEqual({});
    expect(SsrBaseArtifactBuilder.outletModuleMap(manifest, undefined, ssrOutput)).toEqual({});
  });
});
