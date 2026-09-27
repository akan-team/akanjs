import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ABI_MAJOR, SYMBOLS } from "../src/ffi.ts";

// The C ABI (docs/architecture.md §9): what ffi.ts binds is what the library exports, and the major
// versions agree. A symbol added on one side only would fail at dlopen or be dead code.
test("ffi.ts binds exactly the library's C ABI", () => {
  const src = join(import.meta.dir, "../../../native/desktop/src");
  const text = readdirSync(src, { recursive: true })
    .filter((f) => String(f).endsWith(".rs"))
    .map((f) => readFileSync(join(src, String(f)), "utf8"))
    .join("\n");
  const exported = [...text.matchAll(/#\[no_mangle\]\s*pub (?:unsafe )?extern "C" fn (akan_native_\w+)/g)]
    .map((m) => m[1]!)
    .sort();
  expect(Object.keys(SYMBOLS).sort()).toEqual(exported);
  const abi = Number(/pub const ABI: u32 = (\d+);/.exec(text)?.[1]);
  expect(abi >>> 16).toBe(ABI_MAJOR);
});
