import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliError } from "../commandDecorators/cliError";
import { ClientServerBoundary } from "./clientServerBoundary";

const plugin = "no-import-server-in-client.grit";
const lintDir = path.join(import.meta.dir, "../lint");

describe("ClientServerBoundary", () => {
  test("holds the patterns and messages of the lint plugin", async () => {
    const grit = await Bun.file(path.join(lintDir, plugin)).text();
    const patterns = [...grit.matchAll(/r"\\"(.+?)\\""/g)].map(([, inner]) => inner);
    const messages = [...grit.matchAll(/message = "(.+)",$/gm)].map(([, message]) => message);
    expect(ClientServerBoundary.rules.flatMap((rule) => rule.patterns)).toEqual(patterns);
    expect(ClientServerBoundary.rules.map((rule) => rule.hint)).toEqual(messages);
  });

  test("checks the files the lint plugin covers", async () => {
    const base = (await Bun.file(path.join(import.meta.dir, "../biome.base.json")).json()) as {
      overrides: { includes?: string[]; plugins?: string[] }[];
    };
    const includes = base.overrides.find((each) => each.plugins?.some((file) => file.endsWith(`/${plugin}`)))?.includes;
    if (!includes) throw new Error(`biome.base.json has no override running ${plugin}`);
    const covered = (file: string) =>
      includes.some((glob) => !glob.startsWith("!") && new Bun.Glob(glob).match(file)) &&
      !includes.some((glob) => glob.startsWith("!") && new Bun.Glob(glob.slice(1)).match(file));
    const files = [
      "page/_index.tsx",
      "page/(main)/books/_layout.ts",
      "ui/Card.tsx",
      "ui/Recipe/card.ts",
      "webkit/useThing.ts",
      "common/format.ts",
      "lib/book/book.store.ts",
      "lib/book/book.constant.ts",
      "lib/book/Book.Unit.tsx",
      "lib/book/book.service.ts",
      "lib/book/book.signal.ts",
      "lib/book/book.store.test.ts",
      "page/_index.test.tsx",
      "srvkit/bookApi.ts",
      "env/env.server.ts",
      "main.ts",
      "client.ts",
    ];
    for (const file of files)
      expect([file, ClientServerBoundary.isClientFile(file)]).toEqual([file, covered(`apps/a/${file}`)]);
  });

  test("names a value import of server code, and lets a type-only import through", () => {
    const found = ClientServerBoundary.serverImportsOf(
      "apps/a/page/_index.tsx",
      [
        'import type { BookApi } from "../srvkit";',
        'import { fetch } from "@apps/a/client";',
        'import { BookApi } from "../srvkit";',
        'import { cnst, type Book } from "../lib/book/book.service";',
        'import "akanjs/server";',
        'import * as srv from "../lib/srv";',
        'import { useServer } from "../lib/useServer";',
      ].join("\n"),
    );
    expect(found.map(({ line, specifier }) => [line, specifier])).toEqual([
      [3, "../srvkit"],
      [4, "../lib/book/book.service"],
      [5, "akanjs/server"],
      [6, "../lib/srv"],
      [7, "../lib/useServer"],
    ]);
  });

  test("honours the suppressions the lint plugin honours", () => {
    const silencedImport = [
      'import { fetch } from "@apps/a/client";',
      "// biome-ignore lint/plugin: reads the build id the server stamps",
      'import { buildId } from "../srvkit/buildId";',
      'import { BookApi } from "../srvkit";',
    ].join("\n");
    expect(ClientServerBoundary.serverImportsOf("apps/a/ui/A.tsx", silencedImport).map(({ line }) => line)).toEqual([
      4,
    ]);
    const silencedFile = ["// biome-ignore-all lint/plugin: quotes banned imports", 'import "../srvkit";'].join("\n");
    expect(ClientServerBoundary.serverImportsOf("apps/a/ui/A.tsx", silencedFile)).toEqual([]);
  });

  describe("on disk", () => {
    let root = "";
    afterAll(async () => {
      if (root) await rm(root, { recursive: true, force: true });
    });

    test("fails a build naming each import, and passes one that imports none", async () => {
      root = await mkdtemp(path.join(tmpdir(), "akan-boundary-"));
      const app = path.join(root, "apps", "a");
      await Bun.write(path.join(app, "page", "_index.tsx"), 'import { BookApi } from "../srvkit";\n');
      await Bun.write(path.join(app, "page", "books.test.tsx"), 'import { BookApi } from "../srvkit";\n');
      await Bun.write(path.join(app, "srvkit", "index.ts"), 'export { BookApi } from "./bookApi";\n');
      await Bun.write(path.join(app, "lib", "book", "book.service.ts"), 'import * as db from "../db";\n');
      const lib = path.join(root, "libs", "l");
      await Bun.write(path.join(lib, "webkit", "useThing.ts"), 'import { srv } from "../lib/srv";\n');
      const error = await ClientServerBoundary.assert([app, lib], root).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe("checkFailed");
      expect((error as CliError).message).toContain('apps/a/page/_index.tsx:1 "../srvkit"');
      expect((error as CliError).message).toContain('libs/l/webkit/useThing.ts:1 "../lib/srv"');
      expect((error as CliError).message).not.toContain("books.test.tsx");
      expect((error as CliError).message).not.toContain("book.service.ts");
      await Bun.write(path.join(app, "page", "_index.tsx"), 'import type { BookApi } from "../srvkit";\n');
      await Bun.write(path.join(lib, "webkit", "useThing.ts"), 'import { st } from "../lib/st";\n');
      expect(await ClientServerBoundary.assert([app, lib], root)).toBe(2);
    });
  });
});
