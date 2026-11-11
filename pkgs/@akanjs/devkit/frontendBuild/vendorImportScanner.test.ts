import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { VendorImportScanner } from "./vendorImportScanner";

const makeTempRoot = tempDirs("akan-vendor-imports-");
const specifiers = ["akanjs/store", "akanjs/common", "akanjs/fetch", "tailwind-merge"];
const scan = (...sources: string[]) => {
  const scanner = new VendorImportScanner(specifiers);
  for (const source of sources) scanner.scan(source);
  return scanner.usedExports();
};

describe("VendorImportScanner", () => {
  test("reads the imported names, not the local aliases, of minified and plain imports", () => {
    const used = scan(
      'import{capitalize as He,Logger as K}from"akanjs/common";import{st}from"akanjs/store";',
      'import { formSetterNames, Logger } from "akanjs/common";\nimport "akanjs/fetch";\n',
    );

    expect(used).toEqual({
      "akanjs/store": ["st"],
      "akanjs/common": ["Logger", "capitalize", "formSetterNames"],
      "akanjs/fetch": [],
      "tailwind-merge": [],
    });
  });

  test("leaves out a specifier read whole: a namespace import, an export star or a dynamic import", () => {
    expect(scan('import*as s from"akanjs/store";import{isEmail}from"akanjs/common";')).not.toHaveProperty(
      "akanjs/store",
    );
    expect(scan('export*from"akanjs/store";')).not.toHaveProperty("akanjs/store");
    expect(scan('export*as s from"akanjs/store";')).not.toHaveProperty("akanjs/store");
    expect(scan('const load=()=>import("akanjs/store");')).not.toHaveProperty("akanjs/store");
    expect(scan('export{twMerge as m}from"tailwind-merge";')["tailwind-merge"]).toEqual(["twMerge"]);
  });

  test("reads nothing from a require, which a browser chunk carries as Bun's shim and never resolves", () => {
    const used = scan('function C9(){let{untrackedHeaders:n,untrackedRequest:d}=ii("akanjs/fetch");return d}');

    expect(used["akanjs/fetch"]).toEqual([]);
  });

  test("ignores a specifier quoted in a string, as a docs page shows code", () => {
    const used = scan(
      'const sample="import { st } from \\"akanjs/store\\"";const tpl=`export * from "akanjs/store"`;console.info("akanjs/store");',
    );

    expect(used["akanjs/store"]).toEqual([]);
  });

  test("reads the import at the end of a minified body too long for the call stack to walk", () => {
    const body = Array.from({ length: 40_000 }, (_, i) => `a${i % 26}(${i})`).join(",");

    const used = scan(`import{st}from"akanjs/store";function f(){${body},import("akanjs/fetch")}`);

    expect(used).toEqual({ "akanjs/store": ["st"], "akanjs/common": [], "tailwind-merge": [] });
  });

  test("collects across every .js file of a directory", async () => {
    const dir = await makeTempRoot();
    await write(path.join(dir, "entry-a.js"), 'import{st}from"akanjs/store";');
    await write(path.join(dir, "chunks/lazy.js"), 'import{RootStore}from"akanjs/store";');
    await write(path.join(dir, "chunks/lazy.js.map"), 'import{ignored}from"akanjs/store";');

    const used = await VendorImportScanner.exportsUsedIn(dir, ["akanjs/store"], ["/_akan/client/entry-a.js"]);

    expect(used).toEqual({ "akanjs/store": ["RootStore", "st"] });
  });

  test("reads a client output directory a build never wrote as importing nothing when the routes have no client entry", async () => {
    const dir = await makeTempRoot();

    expect(await VendorImportScanner.exportsUsedIn(path.join(dir, "client"), ["akanjs/store"], [])).toEqual({
      "akanjs/store": [],
    });
  });

  test("fails, naming the entry, when a route client entry is not in the directory it scans", async () => {
    const dir = await makeTempRoot();
    await write(path.join(dir, "chunks/shared.js"), 'import{st}from"akanjs/store";');
    const entries = ["/_akan/client/page-a1.js", "/_akan/client/page-a1.js", "/_akan/client/chunks/shared.js"];

    await expect(VendorImportScanner.exportsUsedIn(dir, ["akanjs/store"], entries)).rejects.toThrow(
      `no file under ${dir} for the route client entries /_akan/client/page-a1.js`,
    );
    await expect(
      VendorImportScanner.exportsUsedIn(path.join(dir, "missing"), ["akanjs/store"], ["/_akan/client/page-a1.js"]),
    ).rejects.toThrow("/_akan/client/page-a1.js");
  });
});
