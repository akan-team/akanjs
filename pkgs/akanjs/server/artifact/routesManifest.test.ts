import { describe, expect, test } from "bun:test";
import path from "node:path";
import { type RoutesManifest, RoutesManifestStore } from "./routesManifestStore";

describe("routes manifest artifact paths", () => {
  test("serializes file-system paths relative to the artifact directory and restores them", () => {
    const artifactDir = path.resolve("/repo/dist/apps/akan/.akan/artifact");
    const clientEntry = "apps/akan/ui/ProfileCard.tsx#default";
    const knownEntry = path.resolve("/repo/apps/akan/ui/ProfileCard.tsx");
    const ssrEntry = path.resolve("/repo/dist/apps/akan/.akan/artifact/client-ssr/ProfileCard-abc.js");
    const manifest: RoutesManifest = {
      routeIds: ["/profile"],
      clientManifest: {
        [clientEntry]: {
          id: "/_akan/client/abc.js",
          chunks: ["/_akan/client/abc.js", "/_akan/client/chunks/def.js"],
          name: "default",
          async: true,
        },
      },
      ssrManifest: {
        moduleLoading: null,
        moduleMap: {
          "/_akan/client/abc.js": {
            default: {
              id: ssrEntry,
              chunks: [ssrEntry, ssrEntry],
              name: "default",
              async: true,
            },
          },
        },
      },
      knownEntries: [knownEntry],
    };

    const serialized = RoutesManifestStore.serialize(manifest, artifactDir);

    expect(Object.keys(serialized.clientManifest)).toEqual(["apps/akan/ui/ProfileCard.tsx#default"]);
    expect(serialized.clientManifest["apps/akan/ui/ProfileCard.tsx#default"]?.id).toBe("/_akan/client/abc.js");
    expect(serialized.ssrManifest.moduleMap["/_akan/client/abc.js"]?.default.id).toBe("client-ssr/ProfileCard-abc.js");
    expect(serialized.knownEntries).toEqual(["../../../../../apps/akan/ui/ProfileCard.tsx"]);
    expect(JSON.stringify(serialized)).not.toContain("/repo/");

    expect(RoutesManifestStore.normalize(serialized, artifactDir)).toEqual({
      ...manifest,
      clientManifest: serialized.clientManifest,
      knownEntries: manifest.knownEntries,
    });
  });

  test("normalizes manifests without production-only known entries", () => {
    const artifactDir = "/repo/dist/apps/akan/.akan/artifact";
    const normalized = RoutesManifestStore.normalize(
      {
        routeIds: ["/profile"],
        clientManifest: {},
        ssrManifest: { moduleLoading: null, moduleMap: {} },
      },
      artifactDir,
    );

    expect(normalized.knownEntries).toEqual([]);
  });
});
