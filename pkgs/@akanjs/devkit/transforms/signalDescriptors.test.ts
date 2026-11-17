import { describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { SignalDescriptors } from "./signalDescriptors";

const makeTempRoot = tempDirs("akan-devkit-signal-descriptors-");

const sigSource = `import { appendFileSync } from "node:fs";
import path from "node:path";

appendFileSync(path.join(import.meta.dir, "reads.txt"), "read\\n");
const serialized = {
  trolley: { endpoint: { pingAt: { type: "query", args: [], returns: { refName: "String" } } } },
  crate: { endpoint: { countOf: { type: "query", args: [], returns: { refName: "Int", nullable: true } } } },
  odd: { endpoint: { at: { type: "query", args: [], returns: { refName: "String", nullable: undefined } } } },
};
export const fetch = { ownSerializedSignal: serialized };
export const getSerializedSignalOf = (name) => (name === "base" ? {} : { [name]: serialized[name] });
`;

const pieceOf = (name: string) => `import { FetchClient } from "akanjs/fetch";
import * as cnst from "../cnst";
import { fetch, sig } from "../usePage";
import { getSerializedSignalOf } from "../sig" with { type: "macro" };
import type * as signal from "../sig";
Object.assign(sig, FetchClient.build<typeof signal>(cnst, getSerializedSignalOf("${name}"), { base: fetch }).sig);
`;

const writeScope = async (sig = sigSource) => {
  const root = await realpath(await makeTempRoot());
  await writeText(path.join(root, "apps/shop/lib/sig.ts"), sig);
  const pieceDir = path.join(root, "apps/shop/lib/__client");
  return {
    root,
    pieceDir,
    readsOf: () =>
      Bun.file(path.join(root, "apps/shop/lib/reads.txt"))
        .text()
        .catch(() => ""),
  };
};

describe("SignalDescriptors", () => {
  test("answers each piece with its own descriptors as a literal in place of the macro, reading the signal once", async () => {
    const { root, pieceDir, readsOf } = await writeScope();
    const descriptors = new SignalDescriptors(root, ["apps/shop"]);
    const [trolley, crate, base] = await Promise.all(
      ["trolley", "crate", "base"].map((name) =>
        descriptors.inline(pieceOf(name), path.join(pieceDir, `${name === "base" ? "_base" : name}.fetch.ts`)),
      ),
    );

    expect(trolley).toBe(
      pieceOf("trolley")
        .replace('import { getSerializedSignalOf } from "../sig" with { type: "macro" };', "")
        .replace(
          'getSerializedSignalOf("trolley")',
          '{"trolley":{"endpoint":{"pingAt":{"type":"query","args":[],"returns":{"refName":"String"}}}}}',
        ),
    );
    expect(crate).toContain('{"crate":{"endpoint":{"countOf":');
    expect(base).toContain("FetchClient.build<typeof signal>(cnst, {}, { base: fetch })");
    expect([trolley, crate, base].some((source) => source?.includes('with { type: "macro" }'))).toBe(false);
    expect(await readsOf()).toBe("read\n");
  });

  test("leaves the macro to a file it cannot answer exactly: not a piece, two calls, a name the signal lacks, or a value JSON cannot carry", async () => {
    const { root, pieceDir } = await writeScope();
    const descriptors = new SignalDescriptors(root, ["apps/shop"]);
    const twoCalls = pieceOf("trolley").replace(
      'getSerializedSignalOf("trolley")',
      'getSerializedSignalOf("trolley"), getSerializedSignalOf("crate")',
    );

    expect(await descriptors.inline(pieceOf("trolley"), path.join(root, "apps/shop/lib/sigOf.ts"))).toBeNull();
    expect(await descriptors.inline(twoCalls, path.join(pieceDir, "trolley.fetch.ts"))).toBeNull();
    expect(await descriptors.inline(pieceOf("absent"), path.join(pieceDir, "absent.fetch.ts"))).toBeNull();
    expect(await descriptors.inline(pieceOf("odd"), path.join(pieceDir, "odd.fetch.ts"))).toBeNull();
  });

  test("says which scope's signals it could not read, and leaves their pieces to the macro", async () => {
    const { root, pieceDir } = await writeScope('throw new Error("the signal broke");\n');
    const said: string[] = [];
    const descriptors = new SignalDescriptors(root, ["apps/shop"], { onUnread: (reason) => said.push(reason) });

    expect(await descriptors.inline(pieceOf("trolley"), path.join(pieceDir, "trolley.fetch.ts"))).toBeNull();
    expect(said).toEqual(["the signals of apps/shop could not be read (the signal broke)"]);
  });
});
