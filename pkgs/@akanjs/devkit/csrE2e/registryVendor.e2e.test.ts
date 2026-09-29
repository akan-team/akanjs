import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

//* Package shapes that once turned a whole dev vendor file into a SyntaxError or a startup throw, each followed by
//* nothing but distant MissingModuleErrors. Written in for the run only: no app of the repo depends on them.
const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const vendorRoot = path.join(workspaceRoot, "node_modules/@akan-e2e");
const probeFile = path.join(workspaceRoot, "apps/minimal/ui/RegistryVendor.tsx");
const pageFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/vendor.tsx");
const cliFile = path.join(workspaceRoot, "dist/pkgs/@akanjs/cli/index.js");
const VENDOR = "/e2e/vendor";
const expected = { prebundled: 3, metaDev: true, metaUrl: "http:", used: "used", inspectish: "yes" };
const broken =
  /SyntaxError|MissingModuleError|no module registered|Node built-in|left out of the dev registry|error occurred in one of your React components/;

const packages: Record<string, string> = {
  //? esbuild's own interop helpers, as the @mermaid-js/parser chunks ship them.
  "prebundled/package.json": JSON.stringify({ name: "@akan-e2e/prebundled", type: "module", main: "chunk.mjs" }),
  "prebundled/chunk.mjs": `var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var parts = {};
__reExport(parts, { a: 1 });
var wrapped = __toESM({ b: 2 });
export const prebundled = parts.a + wrapped.b;
`,
  //? jotai's and zustand's ESM development check.
  "meta-env/package.json": JSON.stringify({
    name: "@akan-e2e/meta-env",
    type: "module",
    exports: { ".": "./esm/index.mjs" },
  }),
  "meta-env/esm/index.mjs": `export const metaDev = (import.meta.env ? import.meta.env.MODE : void 0) !== "production";
export const metaUrl = new URL(import.meta.url).protocol;
`,
  //? vfile behind unified: a side-effect-free barrel whose unused re-exports reach Node-only files through `#imports`.
  "barrel/package.json": JSON.stringify({
    name: "@akan-e2e/barrel",
    type: "module",
    main: "index.js",
    sideEffects: false,
    imports: {
      "#where": { node: "./where.node.js", default: "./where.browser.js" },
      "#other": { node: "./other.node.js", default: "./other.browser.js" },
    },
  }),
  "barrel/index.js": `export { used } from "./used.js";
export { unused } from "./unused.js";
export { other } from "#other";
`,
  "barrel/used.js": `export const used = "used";\n`,
  "barrel/unused.js": `import { where } from "#where";\nexport const unused = where;\n`,
  "barrel/where.node.js": `import path from "node:path";\nexport const where = path.sep;\n`,
  "barrel/where.browser.js": `export const where = "browser";\n`,
  "barrel/other.node.js": `import path from "node:path";\nexport const other = path.sep;\n`,
  "barrel/other.browser.js": `export const other = "browser";\n`,
  //? object-inspect: a `browser` map that turns a Node-only file off.
  "inspectish/package.json": JSON.stringify({
    name: "@akan-e2e/inspectish",
    main: "index.js",
    browser: { "./util.inspect.js": false },
  }),
  //? Bun's own bundle gives the require `() => ({})` where the registry gives `{}`; either way it must not throw.
  "inspectish/index.js": `var inspect = require("./util.inspect");\nmodule.exports = { loaded: inspect ? "yes" : "no" };\n`,
  "inspectish/util.inspect.js": `module.exports = require("util").inspect;\n`,
};

const probeSource = `"use client";
import { used } from "@akan-e2e/barrel";
import inspectish from "@akan-e2e/inspectish";
import { metaDev, metaUrl } from "@akan-e2e/meta-env";
import { prebundled } from "@akan-e2e/prebundled";
import { useEffect, useState } from "react";

export const RegistryVendor = () => {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <div data-e2e="vendor" data-e2e-hydrated={hydrated ? "1" : "0"} data-e2e-hot="0">
      {JSON.stringify({ prebundled, metaDev, metaUrl, used, inspectish: inspectish.loaded })}
    </div>
  );
};
`;

const pageSource = `import { page } from "akanjs/client";
import { RegistryVendor } from "../../../ui/RegistryVendor";

export default page()
  .config({ transition: "none", gesture: false })
  .render(() => (
    <main>
      <RegistryVendor />
    </main>
  ));
`;

interface VendorWindow {
  __akan?: { has(id: string): boolean; inspect(): { started: boolean; failed: boolean; executed: string[] } };
}

describe.skipIf(!CsrE2eHarness.enabled)("dev registries with the package shapes that broke them (minimal)", () => {
  //? Run first too, and safe to run twice: a run killed mid-way (a timeout, SIGKILL, a Jenkins abort on a reused
  //? workspace) leaves the packages, the probe and the page behind, and `akan sync` rebuilds the barrel it joined.
  const cleanup = async () => {
    await Promise.all([
      rm(vendorRoot, { recursive: true, force: true }),
      rm(probeFile, { force: true }),
      rm(pageFile, { force: true }),
    ]);
    for (const command of [
      ["bun", path.join(workspaceRoot, "pkgs/@akanjs/cli/build.ts")],
      ["bun", cliFile, "sync", "minimal"],
    ]) {
      const done = Bun.spawnSync(command, { cwd: workspaceRoot, stdout: "ignore" });
      if (done.exitCode !== 0)
        throw new Error(`[csr-e2e] ${command.slice(1).join(" ")} failed: ${done.stderr.toString()}`);
    }
  };

  beforeAll(async () => {
    await cleanup();
    for (const [file, text] of Object.entries(packages)) await Bun.write(path.join(vendorRoot, file), text);
    await Bun.write(probeFile, probeSource);
    await Bun.write(pageFile, pageSource);
  }, 120_000);

  afterAll(cleanup, 120_000);

  describe.each([
    ["registry", 8495],
    ["artifact", 8496],
  ] as const)("AKAN_DEV_CSR=%s", (mode, port) => {
    let harness: CsrE2eHarness;

    beforeAll(async () => {
      harness = await CsrE2eHarness.start({ app: "minimal", port, env: { AKAN_DEV_CSR: mode } });
    }, 240_000);

    afterAll(async () => {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: unassigned when beforeAll threw before the harness started
      await harness?.close();
    }, 60_000);

    const probeValues = async () =>
      JSON.parse((await harness.text('[data-e2e="vendor"]', { mounted: true }))[0] ?? "null") as typeof expected | null;
    const openVendor = async (csr: boolean) => {
      await harness.open(VENDOR, { csr });
      await harness.waitFor(
        () => document.querySelector('[data-e2e="vendor"]')?.getAttribute("data-e2e-hydrated") === "1",
        { timeout: 60_000 },
      );
    };
    const registryState = async () =>
      await harness.evaluate(() => {
        const akan = (window as unknown as VendorWindow).__akan;
        if (!akan) return null;
        const { started, failed, executed } = akan.inspect();
        return {
          started,
          failed,
          refresh: executed.some((id) => id.includes("react-refresh/")),
          vendors: [
            "node_modules/@akan-e2e/prebundled/chunk.mjs",
            "node_modules/@akan-e2e/meta-env/esm/index.mjs",
            "node_modules/@akan-e2e/barrel/unused.js",
            "node_modules/@akan-e2e/inspectish/index.js",
          ].filter((id) => akan.has(id)),
        };
      });

    test("an SSR page hydrates its client code with every package shape in it", async () => {
      await openVendor(false);
      expect(await probeValues()).toEqual(expected);
      expect(await registryState()).toMatchObject({ started: true, failed: false });
      expect((await registryState())?.vendors).toHaveLength(4);
      expect(harness.consoleMessages().filter((message) => broken.test(message))).toEqual([]);
    }, 120_000);

    test("a CSR page boots and renders with every package shape in it", async () => {
      await openVendor(true);
      expect(await probeValues()).toEqual(expected);
      const state = await registryState();
      if (mode === "registry") expect(state).toMatchObject({ started: true, failed: false, refresh: true });
      if (mode === "registry") expect(state?.vendors).toHaveLength(4);
      expect(harness.consoleMessages().filter((message) => broken.test(message))).toEqual([]);
    }, 120_000);

    test("a save to the page's client code shows on the CSR page", async () => {
      await openVendor(true);
      await harness.editSource(
        probeFile,
        (source) => source.replace('data-e2e-hot="0"', 'data-e2e-hot="1"'),
        async () => {
          await harness.waitFor(
            () => document.querySelector('[data-e2e="vendor"]')?.getAttribute("data-e2e-hot") === "1",
            { timeout: 60_000 },
          );
        },
      );
      //? The registry patches in place; the single-file artifact reloads on every save, which is its contract.
      expect(await harness.reloaded()).toBe(mode === "artifact");
      expect(await probeValues()).toEqual(expected);
    }, 120_000);
  });
});
