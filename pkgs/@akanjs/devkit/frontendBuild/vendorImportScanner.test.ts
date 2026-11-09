import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
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

  test("leaves out a specifier read whole: a namespace import, an export star, a dynamic import or a require", () => {
    expect(scan('import*as s from"akanjs/store";import{isEmail}from"akanjs/common";')).not.toHaveProperty(
      "akanjs/store",
    );
    expect(scan('export*from"akanjs/store";')).not.toHaveProperty("akanjs/store");
    expect(scan('export*as s from"akanjs/store";')).not.toHaveProperty("akanjs/store");
    expect(scan('const load=()=>import("akanjs/store");')).not.toHaveProperty("akanjs/store");
    expect(scan('var s=require("akanjs/store");')).not.toHaveProperty("akanjs/store");
    expect(scan('var s=__require("akanjs/store");')).not.toHaveProperty("akanjs/store");
    expect(scan('export{twMerge as m}from"tailwind-merge";')["tailwind-merge"]).toEqual(["twMerge"]);
  });

  test("ignores a specifier quoted in a string, as a docs page shows code", () => {
    const used = scan(
      'const sample="import { st } from \\"akanjs/store\\"";const tpl=`export * from "akanjs/store"`;console.info("akanjs/store");',
    );

    expect(used["akanjs/store"]).toEqual([]);
  });

  test("collects across every .js file of a directory", async () => {
    const dir = await makeTempRoot();
    await write(path.join(dir, "entry-a.js"), 'import{st}from"akanjs/store";');
    await write(path.join(dir, "chunks/lazy.js"), 'import{RootStore}from"akanjs/store";');
    await write(path.join(dir, "chunks/lazy.js.map"), 'import{ignored}from"akanjs/store";');

    const used = await VendorImportScanner.exportsUsedIn(dir, ["akanjs/store"]);

    expect(used).toEqual({ "akanjs/store": ["RootStore", "st"] });
  });
});
