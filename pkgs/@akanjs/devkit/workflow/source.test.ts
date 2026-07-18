import { describe, expect, test } from "bun:test";
import {
  hasClassMethod,
  hasSignalFactoryEntry,
  hasSourceParseErrors,
  insertClassMethod,
  insertSignalFactoryEntry,
  inspectDictionaryStructure,
} from "./source";

describe("inspectDictionaryStructure", () => {
  test("preserves protected dictionary chain order around the model object", () => {
    const structure = inspectDictionaryStructure(
      `
import { modelDictionary } from "akanjs/dictionary";
import type { Article, ArticleSlice } from "./article.constant";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Article", "Article"]))
  .model<Article>((t) => ({
    title: t(["Title", "제목"]),
  }))
  .slice<ArticleSlice>((fn) => ({
    inPublic: fn(["Article In Public", "Article 공개"]),
  }))
  .enum<ArticleStatus>("articleStatus", (t) => ({}))
  .error({})
  .translate({});
`,
      "Article",
    );

    expect(structure).toMatchObject({
      parseValid: true,
      modelObjectFound: true,
      chainOrderValid: true,
      fields: ["title"],
    });
    expect(structure.chainMethods).toEqual(["modelDictionary", "of", "model", "slice", "enum", "error", "translate"]);
  });

  test("reports broken dictionary chain order even when the field remains inside model", () => {
    const structure = inspectDictionaryStructure(
      `
import { modelDictionary } from "akanjs/dictionary";
import type { Article, ArticleSlice } from "./article.constant";

export const dictionary = modelDictionary(["en", "ko"])
  .slice<ArticleSlice>((fn) => ({
    inPublic: fn(["Article In Public", "Article 공개"]),
  }))
  .model<Article>((t) => ({
    title: t(["Title", "제목"]),
  }))
  .translate({})
  .error({});
`,
      "Article",
    );

    expect(structure).toMatchObject({
      parseValid: true,
      modelObjectFound: true,
      chainOrderValid: false,
      fields: ["title"],
    });
    expect(structure.chainMethods).toEqual(["modelDictionary", "slice", "model", "translate", "error"]);
  });
});

describe("insertClassMethod", () => {
  test("inserts a method into an empty service class body", () => {
    const content = `import { serve } from "akanjs/service";
import * as db from "../db";
export class BannerService extends serve(db.banner, () => ({})) {}
`;
    const next = insertClassMethod(content, "BannerService", "  async archive() {\n    return true;\n  }");
    expect(next).not.toBeNull();
    expect(hasSourceParseErrors(next as string, "service.ts")).toBe(false);
    expect(hasClassMethod(next as string, "BannerService", "archive")).toBe(true);
  });

  test("inserts a method into a populated service class body", () => {
    const content = `import { serve } from "akanjs/service";
import * as db from "../db";
export class NotificationService extends serve(db.notification, () => ({})) {
  async subscribe(token: string) {
    return token;
  }
}
`;
    const next = insertClassMethod(content, "NotificationService", "  async archive() {\n    return true;\n  }");
    expect(next).not.toBeNull();
    expect(hasSourceParseErrors(next as string, "service.ts")).toBe(false);
    expect(hasClassMethod(next as string, "NotificationService", "archive")).toBe(true);
    expect(hasClassMethod(next as string, "NotificationService", "subscribe")).toBe(true);
  });

  test("returns null when the class is not found", () => {
    expect(insertClassMethod("export class Other {}", "MissingService", "  x() {}")).toBeNull();
  });
});

describe("insertSignalFactoryEntry", () => {
  const mutationEntry =
    "archive: mutation(Boolean)\n    .exec(async function () {\n      return await this.bannerService.archive();\n    }),";

  test("adds mutation param when the endpoint factory has no params", () => {
    const content = `import { endpoint } from "akanjs/signal";
import * as srv from "../srv";
export class BannerEndpoint extends endpoint(srv.banner, () => ({})) {}
`;
    const next = insertSignalFactoryEntry(content, "BannerEndpoint", "archive", mutationEntry, {
      mode: "destructure",
      name: "mutation",
    });
    expect(next).not.toBeNull();
    expect(hasSourceParseErrors(next as string, "signal.ts")).toBe(false);
    expect(hasSignalFactoryEntry(next as string, "BannerEndpoint", "archive")).toBe(true);
    expect(next as string).toContain("{ mutation }");
  });

  test("extends an existing destructured param without dropping siblings", () => {
    const content = `import { endpoint } from "akanjs/signal";
import * as srv from "../srv";
export class BannerEndpoint extends endpoint(srv.banner, ({ pubsub, query }) => ({
  existing: query(String).exec(async function () {
    return "x";
  }),
})) {}
`;
    const next = insertSignalFactoryEntry(content, "BannerEndpoint", "archive", mutationEntry, {
      mode: "destructure",
      name: "mutation",
    });
    expect(next).not.toBeNull();
    expect(hasSourceParseErrors(next as string, "signal.ts")).toBe(false);
    expect(next as string).toContain("{ pubsub, query, mutation }");
    expect(hasSignalFactoryEntry(next as string, "BannerEndpoint", "archive")).toBe(true);
    expect(hasSignalFactoryEntry(next as string, "BannerEndpoint", "existing")).toBe(true);
  });

  test("adds the init param to a slice factory and inserts the slice entry", () => {
    const content = `import { slice, Admin, Public } from "akanjs/signal";
import * as srv from "../srv";
export class BannerSlice extends slice(srv.banner, { guards: { root: Admin, get: Public, cru: Admin } }, () => ({})) {}
`;
    const sliceEntry =
      "inPublic: init()\n    .exec(function () {\n      return this.bannerService.queryInPublic();\n    }),";
    const next = insertSignalFactoryEntry(content, "BannerSlice", "inPublic", sliceEntry, {
      mode: "positional",
      name: "init",
    });
    expect(next).not.toBeNull();
    expect(hasSourceParseErrors(next as string, "signal.ts")).toBe(false);
    expect(next as string).toContain("(init) =>");
    expect(hasSignalFactoryEntry(next as string, "BannerSlice", "inPublic")).toBe(true);
  });

  test("is idempotent when the entry already exists", () => {
    const content = `import { endpoint } from "akanjs/signal";
import * as srv from "../srv";
export class BannerEndpoint extends endpoint(srv.banner, ({ mutation }) => ({
  archive: mutation(Boolean).exec(async function () {
    return true;
  }),
})) {}
`;
    const next = insertSignalFactoryEntry(content, "BannerEndpoint", "archive", mutationEntry, {
      mode: "destructure",
      name: "mutation",
    });
    expect(next).toBe(content);
  });
});
