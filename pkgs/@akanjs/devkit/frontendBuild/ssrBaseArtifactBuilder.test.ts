import { describe, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BaseBuildArtifact } from "akanjs/server";
import { SsrBaseArtifactBuilder } from "./ssrBaseArtifactBuilder";

describe("SsrBaseArtifactBuilder.writeArtifact", () => {
  test("writes beside the final path and renames into it, so a reader never finds a half-written artifact", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-base-artifact-"));
    const finalPath = path.join(dir, "base-artifact.json");
    const artifact = { domains: ["a.example.com"], pagesBundlePath: "/app/pages.js" } as unknown as BaseBuildArtifact;
    const write = Bun.write;
    const seen: { target: string; finalExisted: boolean }[] = [];
    const written = spyOn(Bun, "write").mockImplementation(((target: string, data: string) => {
      seen.push({ target: String(target), finalExisted: existsSync(finalPath) });
      return write(target, data);
    }) as typeof Bun.write);
    try {
      await SsrBaseArtifactBuilder.writeArtifact(dir, artifact);
    } finally {
      written.mockRestore();
    }

    expect(seen).toEqual([{ target: `${finalPath}.tmp`, finalExisted: false }]);
    expect(await Bun.file(finalPath).json()).toEqual(artifact);
    expect(await readdir(dir)).toEqual(["base-artifact.json"]);
    await rm(dir, { recursive: true, force: true });
  });
});

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
