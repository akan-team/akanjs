import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FrameworkGraph } from "./frameworkGraph";

const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
//? The other end of these lies outside the source read here: @akanjs/native's desktop shell answers file and secret
//? requests, AkanApp's child reports a boot error from a code string, and the browser tab sends `sync-navigation` and
//? handles every HmrMessage in a script string. `ws.*` and HMR `ok` have no site.
const unrecognised = [
  "AkanIpcMessage ws.opened sender",
  "AkanIpcMessage ws.opened handler",
  "AkanIpcMessage ws.closed sender",
  "AkanIpcMessage ws.closed handler",
  "AkanIpcMessage file.resolve handler",
  "AkanIpcMessage file.resolved sender",
  "AkanIpcMessage secret.request handler",
  "AkanIpcMessage secret.answer sender",
  "AkanIpcMessage error sender",
  "HmrMessage sync-navigation sender",
  "HmrMessage ok sender",
];
const handledInBrowser = new Set(["HmrMessage"]);

const withWorkspace = async (files: Record<string, string>, run: (root: string) => Promise<void>) => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-framework-"));
  try {
    for (const [file, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const installed = (version: string) => ({
  "node_modules/akanjs/package.json": JSON.stringify({
    name: "akanjs",
    version,
    exports: { ".": "./index.ts", "./package.json": "./package.json" },
  }),
  "node_modules/akanjs/index.ts": `export * from "./base";\n`,
  "node_modules/akanjs/base/scalar.ts": "export class Scalar {}\n",
  "node_modules/akanjs/native/bridge.ts": `import { Native } from "../vendor/@akanjs/native/index";\nexport class Bridge {}\n`,
  "node_modules/akanjs/vendor/@akanjs/native/index.ts": "export class Native {}\n",
  "node_modules/akanjs/vendor/use-agentic/index.ts": "export class Agentic {}\n",
  "node_modules/akanjs/types/base/index.ts": "export class Declared {}\n",
});

describe("FrameworkGraph", () => {
  it(`keeps ${FrameworkGraph.architectureFile} current with the source it describes`, async () => {
    const architecture = await FrameworkGraph.architecture(workspaceRoot);
    expect(architecture).not.toBeNull();
    if (!architecture) return;
    const { map } = architecture;
    expect(map.missing).toEqual([]);
    expect(map.cycles).toEqual([]);
    expect(architecture.unknownClasses).toEqual([]);
    const unmatched = map.channels.flatMap(({ name, messages }) =>
      messages.flatMap(({ type, senders, handlers }) => [
        ...(senders.length ? [] : [`${name} ${type} sender`]),
        ...(handlers.length || handledInBrowser.has(name) ? [] : [`${name} ${type} handler`]),
      ]),
    );
    expect(unmatched).toEqual(unrecognised);
    if (architecture.next !== architecture.current)
      throw new Error(`${FrameworkGraph.architectureFile} is stale. Regenerate it: bun run akan sync-architecture`);
  });

  it("reads a consumer's installed akanjs without its bundled vendor and declaration folders", async () => {
    await withWorkspace({ "package.json": "{}" }, async (root) => {
      expect(await FrameworkGraph.build(root)).toBeNull();
    });
    await withWorkspace(installed("3.1.0"), async (root) => {
      expect(await FrameworkGraph.packagesOf(root)).toEqual([
        { name: "akanjs", root: "node_modules/akanjs", split: true },
      ]);
      const map = await FrameworkGraph.build(root);
      expect(map?.facets.map(({ id, layer, classes }) => `${id}:${layer}:${classes.map(({ name }) => name)}`)).toEqual([
        "akanjs/base:0:Scalar",
        "akanjs/native:0:Bridge",
      ]);
      expect(await FrameworkGraph.architecture(root)).toBeNull();
    });
  });

  it("rebuilds an installed map on a new version, and an in-repo one on a save under it", async () => {
    await withWorkspace(installed("3.1.0"), async (root) => {
      const first = await FrameworkGraph.cached(root);
      FrameworkGraph.touched(root, [path.join(root, "node_modules/akanjs/base/scalar.ts")]);
      expect(await FrameworkGraph.cached(root)).toBe(first);
      await writeFile(path.join(root, "node_modules/akanjs/package.json"), JSON.stringify({ version: "3.1.1" }));
      expect(await FrameworkGraph.cached(root)).not.toBe(first);
    });
    await withWorkspace({ "pkgs/akanjs/base/scalar.ts": "export class Scalar {}\n" }, async (root) => {
      const first = await FrameworkGraph.cached(root);
      FrameworkGraph.touched(root, [path.join(root, "apps/demo/page/_index.tsx")]);
      expect(await FrameworkGraph.cached(root)).toBe(first);
      FrameworkGraph.touched(root, [path.join(root, "pkgs/akanjs/base/scalar.ts")]);
      expect(await FrameworkGraph.cached(root)).not.toBe(first);
    });
  });

  it("reads a document checked out with CRLF line endings as current", async () => {
    const files = {
      "pkgs/akanjs/base/scalar.ts": "export class Scalar {}\n",
      [FrameworkGraph.architectureFile]: "# A\n",
    };
    await withWorkspace(files, async (root) => {
      const first = await FrameworkGraph.architecture(root);
      if (!first) throw new Error("no architecture");
      await writeFile(path.join(root, FrameworkGraph.architectureFile), first.next.replace(/\n/g, "\r\n"));
      const second = await FrameworkGraph.architecture(root);
      expect(second?.current).toBe(first.next);
      expect(second?.next).toBe(first.next);
    });
  });
});
