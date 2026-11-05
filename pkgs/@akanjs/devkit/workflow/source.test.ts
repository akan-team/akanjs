import { describe, expect, test } from "bun:test";
import {
  appendTopLevelTestCases,
  classMethodParameters,
  ensureImportDeclaration,
  ensureNamedImport,
  hasClassMethod,
  hasDictionaryEndpointEntry,
  hasSignalFactoryEntry,
  hasSourceParseErrors,
  insertClassMethod,
  insertDictionaryEndpointEntry,
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

describe("import editing", () => {
  const signal = `import { endpoint, internal, slice } from "akanjs/signal";

import * as srv from "../srv";
`;

  test("adds a name in Biome's order and keeps a type modifier", () => {
    const content = 'import { type Dayjs, dayjs } from "akanjs/base";\n';

    expect(ensureNamedImport(content, "akanjs/base", "ID")).toBe(
      'import { type Dayjs, dayjs, ID } from "akanjs/base";\n',
    );
    expect(ensureNamedImport(signal, "akanjs/signal", "None")).toContain(
      'import { endpoint, internal, None, slice } from "akanjs/signal";',
    );
  });

  test("never adds a value name to a type-only import", () => {
    const next = ensureNamedImport('import type { Guard } from "akanjs/signal";\n', "akanjs/signal", "Public");

    expect(next).toContain('import type { Guard } from "akanjs/signal";');
    expect(next).toContain('import { Public } from "akanjs/signal";');
  });

  test("puts a new declaration in its chunk, in source order", () => {
    const withPackages = ensureNamedImport(
      ensureNamedImport(signal, "akanjs/base", "ID"),
      "@libs/shared/srvkit",
      "Admin",
    );
    const withRelative = ensureImportDeclaration(withPackages, "../cnst", "* as cnst");

    expect(withRelative).toBe(`import { Admin } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";
`);
    expect(
      ensureImportDeclaration('import { serve } from "akanjs/service";\n\nexport {};\n', "../srv", "type * as srv"),
    ).toBe('import { serve } from "akanjs/service";\n\nimport type * as srv from "../srv";\n\nexport {};\n');
  });
});

describe("dictionary endpoint entries", () => {
  const dictionary = `export const dictionary = modelDictionary(["en", "ko"])
  .slice<TaskSlice>((fn) => ({}))
  .endpoint<TaskEndpoint>((fn) => ({}))
  .error({})
  .translate({});
`;

  test("inserts an entry into the endpoint stage and finds it again", () => {
    const next = insertDictionaryEndpointEntry(
      dictionary,
      "Task",
      "archiveTask",
      'archiveTask: fn(["Archive", "보관"]),',
    );

    expect(next).toContain('.endpoint<TaskEndpoint>((fn) => ({\n    archiveTask: fn(["Archive", "보관"]),\n  }))');
    expect(hasDictionaryEndpointEntry(next ?? "", "Task", "archiveTask")).toBe(true);
    expect(hasDictionaryEndpointEntry(dictionary, "Task", "archiveTask")).toBe(false);
  });

  test("answers null when the dictionary has no endpoint stage for the model", () => {
    expect(insertDictionaryEndpointEntry(dictionary, "Note", "pinNote", "pinNote: fn([]),")).toBeNull();
  });
});

describe("classMethodParameters", () => {
  test("reads names and which parameters a caller may leave out", () => {
    const content = `export class NoteService {
  async pushNote(taskId: string, note?: string, retries = 3) {}
}`;

    expect(classMethodParameters(content, "NoteService", "pushNote")).toEqual([
      { name: "taskId", optional: false },
      { name: "note", optional: true },
      { name: "retries", optional: true },
    ]);
    expect(classMethodParameters(content, "NoteService", "missing")).toBeNull();
  });
});

describe("appendTopLevelTestCases", () => {
  const render = (itName: string, indent: string) => [`${indent}${itName}.todo("archives");`];

  test("appends inside the outermost describe with the runner name the file imports", () => {
    const content = `import { describe, expect, test } from "bun:test";

describe("Task Signal", () => {
  test("creates", () => {
    expect(1).toBe(1);
  });
});
`;

    expect(
      appendTopLevelTestCases(content, "Task Signal", render),
    ).toBe(`import { describe, expect, test } from "bun:test";

describe("Task Signal", () => {
  test("creates", () => {
    expect(1).toBe(1);
  });
  test.todo("archives");
});
`);
  });

  test("adds a describe when the file has none", () => {
    const next = appendTopLevelTestCases('import { expect } from "bun:test";\n', "Task Signal", render);

    expect(next).toBe(`import { describe, expect, it } from "bun:test";

describe("Task Signal", () => {
  it.todo("archives");
});
`);
  });
});
