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

const writeHangingScope = async () => {
  const scope = await writeScope();
  const pidFile = path.join(scope.root, "reader.pid");
  await writeText(
    path.join(scope.root, "apps/shop/lib/sig.ts"),
    `await Bun.write(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => undefined, 1_000);\nawait new Promise(() => undefined);\n${sigSource}`,
  );
  return { ...scope, pidFile };
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const goneWithin = async (pid: number, ms: number) => {
  for (const started = Date.now(); Date.now() - started < ms; await Bun.sleep(50)) if (!alive(pid)) return true;
  return !alive(pid);
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
    for (const name of ["valueOf", "__proto__", "constructor"])
      expect(await descriptors.inline(pieceOf(name), path.join(pieceDir, `${name}.fetch.ts`))).toBeNull();
  });

  test("says which scope's signals it could not read, leaves only their pieces to the macro and answers the rest", async () => {
    const { root, pieceDir } = await writeScope();
    await writeText(path.join(root, "libs/kit/lib/sig.ts"), 'throw new Error("the signal broke");\n');
    const said: string[] = [];
    const descriptors = new SignalDescriptors(root, ["libs/kit", "apps/shop"], {
      onUnread: (reason) => said.push(reason),
    });

    expect(
      await descriptors.inline(pieceOf("crate"), path.join(root, "libs/kit/lib/__client/crate.fetch.ts")),
    ).toBeNull();
    expect(await descriptors.inline(pieceOf("trolley"), path.join(pieceDir, "trolley.fetch.ts"))).toContain(
      '{"trolley":{"endpoint":',
    );
    expect(said).toEqual(["the signals of libs/kit could not be read (the signal broke)"]);
  });

  test("stops a signal that does not finish loading within its time, names its scope once and leaves no process behind", async () => {
    const { root, pieceDir, pidFile } = await writeHangingScope();
    const said: string[] = [];
    const descriptors = new SignalDescriptors(root, ["apps/shop"], {
      onUnread: (reason) => said.push(reason),
      timeoutMs: 500,
    });

    const inlined = await Promise.all(
      ["trolley", "crate"].map((name) => descriptors.inline(pieceOf(name), path.join(pieceDir, `${name}.fetch.ts`))),
    );

    expect(inlined).toEqual([null, null]);
    expect(said).toEqual([
      "the signals of apps/shop could not be read (they did not load within 0.5s, so the process reading them was stopped)",
    ]);
    expect(await goneWithin(Number(await Bun.file(pidFile).text()), 3_000)).toBe(true);
  });

  for (const ending of ["exits", "is killed"] as const)
    test(`the process reading the signals ends when the build that started it ${ending}`, async () => {
      const { root, pieceDir, pidFile } = await writeHangingScope();
      const build = path.join(root, "build.ts");
      await writeText(
        build,
        [
          `import { SignalDescriptors } from ${JSON.stringify(path.join(import.meta.dir, "signalDescriptors.ts"))};`,
          `void new SignalDescriptors(${JSON.stringify(root)}, ["apps/shop"]).inline(${JSON.stringify(pieceOf("trolley"))}, ${JSON.stringify(path.join(pieceDir, "trolley.fetch.ts"))});`,
          `while (!(await Bun.file(${JSON.stringify(pidFile)}).exists())) await Bun.sleep(50);`,
          ending === "exits" ? "process.exit(0);" : "",
          "",
        ].join("\n"),
      );
      const parent = Bun.spawn([process.execPath, build], { cwd: root, stdout: "ignore", stderr: "ignore" });
      try {
        for (let tries = 0; tries < 200 && !(await Bun.file(pidFile).exists()); tries++) await Bun.sleep(50);
        const reader = Number(await Bun.file(pidFile).text());
        if (ending === "is killed") {
          expect(alive(reader)).toBe(true);
          parent.kill("SIGKILL");
        }
        await parent.exited;
        expect(await goneWithin(reader, 5_000)).toBe(true);
      } finally {
        parent.kill("SIGKILL");
      }
    }, 30_000);

  test("reads the signals in the build's own environment and its define, never a .env file the build did not load", async () => {
    const { root, pieceDir } = await writeScope(
      sigSource.replace(
        'refName: "String" }',
        'refName: "String", mode: process.env.NODE_ENV, sentinel: process.env.AKAN_SIGNAL_SENTINEL ?? "none" }',
      ),
    );
    for (const file of [".env.production", ".env.production.local"])
      await writeText(path.join(root, file), "AKAN_SIGNAL_SENTINEL=from-an-env-file\n");
    const descriptors = new SignalDescriptors(root, ["apps/shop"]);
    descriptors.plugin.setup({
      config: { define: { "process.env.NODE_ENV": '"production"' } },
      onLoad: () => undefined,
    } as never);

    const trolley = await descriptors.inline(pieceOf("trolley"), path.join(pieceDir, "trolley.fetch.ts"));

    expect(trolley).toContain('"mode":"production","sentinel":"none"');
    expect(trolley).not.toContain("from-an-env-file");
  });

  describe("a scope's whole runtime file on a page that also loads pieces", () => {
    const wholeSource = `import { FetchClient } from "akanjs/fetch";
import * as cnst from "./cnst";
import { fetch as pageFetch, sig as pageSig } from "./usePage";
import { getSerializedSignal } from "./sig" with { type: "macro" };
Object.assign(pageSig, FetchClient.build(cnst, getSerializedSignal(), { base: pageFetch }).sig);
`;
    const plainSig = sigSource.replace("\n  odd: {", "\n  spare: {").replace(", nullable: undefined }", " }");
    const writePieces = async (pieceDir: string, names: string[]) =>
      Promise.all(
        names.map(async (name) => {
          const file = path.join(pieceDir, `${name}.fetch.ts`);
          await writeText(file, pieceOf(name));
          return file;
        }),
      );

    test("leaves out the descriptors of the pieces it is told, imports each piece by a name it uses, and keeps the rest", async () => {
      const { root, pieceDir } = await writeScope(plainSig);
      const [trolley] = await writePieces(pieceDir, ["trolley"]);
      const descriptors = new SignalDescriptors(root, ["apps/shop"]);

      const whole = await descriptors.withoutPieces(wholeSource, path.join(root, "apps/shop/lib/useClient.ts"), [
        trolley ?? "",
      ]);

      expect(whole).toContain(`import { loaded as __akanPiece0 } from ${JSON.stringify(trolley)};`);
      expect(whole).toContain("__akanPiecesFirst(__akanPiece0);");
      expect(whole).toContain('FetchClient.build(cnst, {"crate":');
      expect(whole).toContain('"spare":');
      expect(whole).not.toContain("pingAt");
      expect(whole).not.toContain('type: "macro"');
    });

    test("keeps its macro and every descriptor where a name has no literal, or a piece names none", async () => {
      const { root, pieceDir } = await writeScope();
      const [trolley] = await writePieces(pieceDir, ["trolley"]);
      const file = path.join(root, "apps/shop/lib/useClient.ts");
      expect(
        await new SignalDescriptors(root, ["apps/shop"]).withoutPieces(wholeSource, file, [trolley ?? ""]),
      ).toBeNull();

      const plain = await writeScope(plainSig);
      const unnamed = path.join(plain.pieceDir, "_base.fetch.ts");
      await writeText(unnamed, "export const loaded = {};\n");
      const plainFile = path.join(plain.root, "apps/shop/lib/useClient.ts");
      expect(
        await new SignalDescriptors(plain.root, ["apps/shop"]).withoutPieces(wholeSource, plainFile, [unnamed]),
      ).toBeNull();
    });
  });
});
