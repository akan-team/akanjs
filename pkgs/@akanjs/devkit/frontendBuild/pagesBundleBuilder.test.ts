import { describe, expect, test } from "bun:test";
import { PagesBundleBuilder } from "./pagesBundleBuilder";

const macroImport = `import { getSerializedSignal } from "./sig" with { type: "macro" };`;
const macroFetchProto = "const fetchProto = FetchClient.build<typeof signal>(cnst, getSerializedSignal());";
const serverImport = `import { fetch as serverFetch } from "./sig";`;
const serverFetchProto =
  "const fetchProto = FetchClient.build<typeof signal>(cnst, serverFetch.serializedSignal, { base: serverFetch });";

const generatedUseClient = (lines: { importLine?: string; fetchProtoLine?: string } = {}) =>
  [
    'import { makePageProto, registerClientRuntime } from "akanjs/client";',
    'import { FetchClient } from "akanjs/fetch";',
    'import * as cnst from "./cnst";',
    'import type * as dict from "./dict";',
    lines.importLine ?? macroImport,
    'import type * as signal from "./sig";',
    "",
    "// dict.ts is cumulative, so a lib dictionary is a subset of the mounting app's. Translator state is global,",
    "const dictionary = {};",
    "const pageProto = makePageProto<typeof dict>(dictionary);",
    lines.fetchProtoLine ?? macroFetchProto,
    'export const runtime = registerClientRuntime({ ...pageProto, ...fetchProto }, { scope: "lib" });',
    "",
    "export const { msg, Err, usePage, sig, fetch } = runtime;",
    "",
  ].join("\n");

const transform = (source: string) => PagesBundleBuilder.transformServerUseClientFetchSource(source);

describe("PagesBundleBuilder.transformServerUseClientFetchSource", () => {
  test("swaps the signal macro for the live server fetch in the generated useClient.ts", () => {
    expect(transform(generatedUseClient())).toBe(
      generatedUseClient({ importLine: serverImport, fetchProtoLine: serverFetchProto }),
    );
  });

  test("accepts the spacing and quoting variants the regex-based version accepted", () => {
    const source = generatedUseClient({
      importLine: `import   {getSerializedSignal}   from './sig'   with {type : 'macro'};`,
      fetchProtoLine: [
        "const fetchProto=FetchClient.build<typeof signal>(",
        "  cnst,",
        "  getSerializedSignal(),",
        "  { Err: pageProto.Err },",
        ");",
      ].join("\n"),
    }).replace("import type * as dict", `import { x } from "./x" with { type: "macro" };\nimport type * as dict`);
    const transformed = transform(source);
    expect(transformed).toContain(`\n${serverImport}\n`);
    expect(transformed).toContain(`\n${serverFetchProto}\nexport const runtime`);
    expect(transformed).not.toContain("getSerializedSignal");
  });

  test("keeps an export modifier in front of the rewritten declaration", () => {
    const transformed = transform(generatedUseClient({ fetchProtoLine: `export ${macroFetchProto}` }));
    expect(transformed).toContain(`\nexport ${serverFetchProto}\n`);
  });

  test("leaves comments and strings that spell the statements alone", () => {
    const source = generatedUseClient().replace(
      "const dictionary = {};",
      `// ${macroFetchProto}\nconst note = "${macroImport.replaceAll('"', "'")}";\nconst dictionary = {};`,
    );
    const transformed = transform(source);
    expect(transformed).toContain(`// ${macroFetchProto}\n`);
    expect(transformed).toContain(`const note = "${macroImport.replaceAll('"', "'")}";`);
    expect(transformed).toContain(`\n${serverImport}\n`);
    expect(transformed).toContain(`\n${serverFetchProto}\n`);
  });

  test("returns sources it does not recognise unchanged", () => {
    const transformed = generatedUseClient({ importLine: serverImport, fetchProtoLine: serverFetchProto });
    expect(transform(transformed)).toBe(transformed);
    const typeOnly = generatedUseClient({ importLine: macroImport.replace("import {", "import type {") });
    expect(transform(typeOnly)).toContain(`import type { getSerializedSignal } from "./sig" with { type: "macro" };`);
    const aliased = generatedUseClient({
      importLine: macroImport.replace("getSerializedSignal", "getSerializedSignal as g"),
    });
    expect(transform(aliased)).toContain(`import { getSerializedSignal as g } from "./sig" with { type: "macro" };`);
    const withoutMacro = 'import { x } from "./y";\n';
    expect(transform(withoutMacro)).toBe(withoutMacro);
  });

  test("adversarial input finishes well under a second", () => {
    const marker = `${macroImport}\nFetchClient.build\n`;
    for (const source of [
      marker + "const fetchProto=FetchClient.build<".repeat(100_000),
      marker + `import { getSerializedSignal } from "./sig" with { type: `.repeat(100_000),
      marker + "{".repeat(100_000),
    ]) {
      const started = performance.now();
      transform(source);
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });
});

describe("PagesBundleBuilder on the generated layout with lib/usePage.ts", () => {
  const emptyBuild = "const fetchProto = FetchClient.build<typeof signal>({}, {});";
  const generatedPage = (fetchProtoLine = emptyBuild) =>
    [
      'import { makePageProto, registerClientRuntime } from "akanjs/client";',
      'import { FetchClient } from "akanjs/fetch";',
      'import { getAllDictionary } from "./dict" with { type: "macro" };',
      'import type * as dict from "./dict";',
      'import type * as signal from "./sig";',
      "",
      'const dictionary = process.env.AKAN_PUBLIC_RENDER_ENV === "csr" ? getAllDictionary() : {};',
      "const pageProto = makePageProto<typeof dict>(dictionary);",
      fetchProtoLine,
      'export const runtime = registerClientRuntime({ ...pageProto, ...fetchProto }, { scope: "app" });',
      "",
      "export const { msg, Err, usePage, sig, fetch } = runtime;",
      "",
    ].join("\n");
  const generatedUseClientOnPage = (lines: { importLine?: string; signalArg?: string } = {}) =>
    [
      'import { FetchClient } from "akanjs/fetch";',
      'import * as cnst from "./cnst";',
      'import { fetch as pageFetch, sig as pageSig } from "./usePage";',
      lines.importLine ?? macroImport,
      'import type * as signal from "./sig";',
      "",
      `Object.assign(pageSig, FetchClient.build<typeof signal>(cnst, ${lines.signalArg ?? "getSerializedSignal()"}, { base: pageFetch }).sig);`,
      "",
      "export const fetch = pageFetch;",
      "export const sig = pageSig;",
      'export { Err, msg, runtime, usePage } from "./usePage";',
      "",
    ].join("\n");

  test("builds usePage.ts's client onto the live server fetch, so a server render calls what it calls today", () => {
    expect(PagesBundleBuilder.transformServerPageFetchSource(generatedPage())).toBe(
      `${serverImport}\n${generatedPage("const fetchProto = FetchClient.build<typeof signal>({}, {}, { base: serverFetch });")}`,
    );
  });

  test("applies the server fetch's own signal in useClient.ts instead of the signal macro", () => {
    expect(transform(generatedUseClientOnPage())).toBe(
      generatedUseClientOnPage({ importLine: serverImport, signalArg: "serverFetch.serializedSignal" }),
    );
  });

  test("leaves a usePage.ts or useClient.ts it does not recognise unchanged", () => {
    const withDescriptors = generatedPage("const fetchProto = FetchClient.build<typeof signal>(cnst, {});");
    expect(PagesBundleBuilder.transformServerPageFetchSource(withDescriptors)).toBe(withDescriptors);
    const commented = generatedPage(`// ${emptyBuild}`);
    expect(PagesBundleBuilder.transformServerPageFetchSource(commented)).toBe(commented);
    const withoutMacroImport = generatedUseClientOnPage({ importLine: 'import { getSerializedSignal } from "./sig";' });
    expect(transform(withoutMacroImport)).toBe(withoutMacroImport);
  });
});

describe("PagesBundleBuilder on a generated lib/__client fetch piece", () => {
  const pieceMacroImport = `import { getSerializedSignalOf } from "../sig" with { type: "macro" };`;
  const generatedPiece = (importLine = pieceMacroImport) =>
    [
      'import { FetchClient } from "akanjs/fetch";',
      'import * as cnst from "../cnst";',
      'import { fetch, sig } from "../usePage";',
      importLine,
      'import type * as signal from "../sig";',
      "",
      'Object.assign(sig, FetchClient.build<typeof signal>(cnst, getSerializedSignalOf("memo"), { base: fetch }).sig);',
      "",
    ].join("\n");

  test("reads the module's descriptors from the live server signal instead of the build-time macro", () => {
    expect(PagesBundleBuilder.transformServerClientPieceSource(generatedPiece())).toBe(
      generatedPiece('import { getSerializedSignalOf } from "../sig";'),
    );
  });

  test("leaves a piece it does not recognise unchanged", () => {
    const commented = generatedPiece(`// ${pieceMacroImport}`);
    expect(PagesBundleBuilder.transformServerClientPieceSource(commented)).toBe(commented);
    const otherMacro = generatedPiece(`import { getSerializedSignal } from "../sig" with { type: "macro" };`);
    expect(PagesBundleBuilder.transformServerClientPieceSource(otherMacro)).toBe(otherMacro);
  });
});
