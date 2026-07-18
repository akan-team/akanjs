import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AkanModuleContext } from "../akanContext";
import type { Workspace } from "../commandDecorators";
import { buildAkanModuleContextIndex } from "./moduleIndex";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeWorkspace = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-module-index-"));
  tempRoots.push(root);
  return {
    root,
    workspace: { workspaceRoot: root } as Workspace,
  };
};

const writeText = async (filePath: string, content: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
};

const moduleContext = (files: string[], name = "post"): AkanModuleContext => ({
  kind: "domain",
  name,
  folderName: name,
  sysName: "demo",
  sysType: "app",
  path: `apps/demo/lib/${name}`,
  abstract: { path: `apps/demo/lib/${name}/${name}.abstract.md`, exists: true, headings: [] },
  files,
});

describe("buildAkanModuleContextIndex", () => {
  test("indexes constant, dictionary model, projection, spans, and partial presence without source bodies", async () => {
    const { root, workspace } = await makeWorkspace();
    const modulePath = path.join(root, "apps/demo/lib/post");
    await writeText(
      path.join(modulePath, "post.constant.ts"),
      `
import { Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class PostInput extends via((_field) => ({
  title: _field(String),
  count: _field(Int, { default: 0 }),
  metadata: _field({ nested: ["secret"] }),
})) {}

export class PostObject extends via(PostInput, (field) => ({})) {}
export class LightPost extends via(PostObject, ["title"] as const, (resolve) => ({})) {}
export class Post extends via(PostObject, LightPost, (resolve) => ({})) {}
`,
    );
    await writeText(
      path.join(modulePath, "post.dictionary.ts"),
      `
import { modelDictionary } from "akanjs/dictionary";
import type { Post } from "./post.constant";

export const dictionary = modelDictionary(["en", "ko"])
  .model<Post>((t) => ({
    title: t(["Title", "제목"]),
  }))
  .slice<PostSlice>((fn) => ({
    inPublic: fn(["Post In Public", "Post 공개"]).arg((t) => ({
      ignored: t(["Ignored", "Ignored"]),
    })),
  }))
  .translate({});
`,
    );

    const index = await buildAkanModuleContextIndex(
      workspace,
      moduleContext(["post.abstract.md", "post.constant.ts", "post.dictionary.ts"]),
      { field: "count" },
    );

    expect(index).toMatchObject({
      schemaVersion: 1,
      app: "demo",
      module: "post",
      moduleClassName: "Post",
      constant: { inputClassName: "PostInput", builderName: "_field" },
      dictionary: { modelClassName: "Post", translatorName: "t" },
    });
    expect(index.constant?.fields.map((field) => [field.name, field.order, field.typeSummary])).toEqual([
      ["title", 0, "_field(String)"],
      ["count", 1, "_field(Int)"],
      ["metadata", 2, "_field(object-literal)"],
    ]);
    expect(index.dictionary?.fields.map((field) => field.name)).toEqual(["title"]);
    expect(index.dictionary?.fields.map((field) => field.name)).not.toContain("ignored");
    expect(index.constant?.lightProjection?.fields.map((field) => field.name)).toEqual(["title"]);
    expect(index.constant?.fields[0]?.sourceSpan).toMatchObject({
      file: "apps/demo/lib/post/post.constant.ts",
      startLine: expect.any(Number),
      endLine: expect.any(Number),
      startOffset: expect.any(Number),
      endOffset: expect.any(Number),
    });
    expect(index.fieldPresence.find((field) => field.name === "count")).toMatchObject({
      requested: true,
      constant: true,
      dictionary: false,
      lightProjection: false,
    });
    expect(index.diagnostics.map((diagnostic) => diagnostic.code)).toContain("module-index-field-presence-partial");
    expect(JSON.stringify(index)).not.toContain("export class");
    expect(JSON.stringify(index)).not.toContain("modelDictionary");
    expect(JSON.stringify(index)).not.toContain("secret");
    expect(JSON.stringify(index)).not.toContain("제목");
  });

  test("reports missing and casing mismatch diagnostics with expected and actual paths", async () => {
    const { root, workspace } = await makeWorkspace();
    const modulePath = path.join(root, "apps/demo/lib/post");
    await writeText(path.join(modulePath, "Post.Constant.ts"), "export class PostInput {}\n");

    const index = await buildAkanModuleContextIndex(workspace, moduleContext(["Post.Constant.ts"]));

    expect(index.files.find((file) => file.kind === "constant")).toMatchObject({
      path: "apps/demo/lib/post/Post.Constant.ts",
      expectedPath: "apps/demo/lib/post/post.constant.ts",
      casing: "mismatch",
      present: true,
    });
    expect(index.files.find((file) => file.kind === "dictionary")).toMatchObject({
      expectedPath: "apps/demo/lib/post/post.dictionary.ts",
      casing: "missing",
      present: false,
    });
    expect(index.diagnostics.map((diagnostic) => diagnostic.code)).toContain("module-index-file-casing-mismatch");
    expect(index.diagnostics.map((diagnostic) => diagnostic.code)).toContain("module-index-file-missing");
    expect(index.diagnostics.flatMap((diagnostic) => diagnostic.context?.paths ?? [])).not.toContain(
      "apps/demo/lib/post/Post.Template.tsx",
    );
    expect(index.diagnostics.flatMap((diagnostic) => diagnostic.context?.paths ?? [])).not.toContain(
      "apps/demo/lib/post/post.service.ts",
    );
  });

  test("indexes field builder callbacks, dictionary block returns, and pascal module names", async () => {
    const { root, workspace } = await makeWorkspace();
    const modulePath = path.join(root, "apps/demo/lib/blog-post");
    await writeText(
      path.join(modulePath, "blog-post.constant.ts"),
      `
import { via } from "akanjs/constant";

export class BlogPostInput extends via((field) => ({
  title: field(String),
})) {}

export class BlogPostObject extends via(BlogPostInput, (field) => ({})) {}
export class LightBlogPost extends via(BlogPostObject, ["title"] as const, (resolve) => ({})) {}
export class BlogPost extends via(BlogPostObject, LightBlogPost, (resolve) => ({})) {}
`,
    );
    await writeText(
      path.join(modulePath, "blog-post.dictionary.ts"),
      `
import { modelDictionary } from "akanjs/dictionary";
import type { BlogPost } from "./blog-post.constant";

export const dictionary = modelDictionary(["en"]).model<BlogPost>((t) => {
  return {
    title: t(["Title"]),
  };
});
`,
    );

    const index = await buildAkanModuleContextIndex(
      workspace,
      moduleContext(["blog-post.abstract.md", "blog-post.constant.ts", "blog-post.dictionary.ts"], "blog-post"),
      { field: "title" },
    );

    expect(index.moduleClassName).toBe("BlogPost");
    expect(index.constant).toMatchObject({ inputClassName: "BlogPostInput", builderName: "field" });
    expect(index.constant?.fields.map((field) => [field.name, field.typeSummary])).toEqual([
      ["title", "field(String)"],
    ]);
    expect(index.dictionary).toMatchObject({ modelClassName: "BlogPost", translatorName: "t" });
    expect(index.dictionary?.fields.map((field) => field.name)).toEqual(["title"]);
    expect(index.constant?.lightProjection?.fields.map((field) => field.name)).toEqual(["title"]);
    expect(index.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "module-index-dictionary-model-missing",
    );
    expect(JSON.stringify(index)).not.toContain("return {");
  });

  test("reports parse and unsupported constant shape diagnostics", async () => {
    const validDictionary = `
import { modelDictionary } from "akanjs/dictionary";
import type { Post } from "./post.constant";

export const dictionary = modelDictionary(["en"]).model<Post>((t) => ({}));
`;
    const cases = [
      {
        name: "invalid-typescript",
        constant: "export class PostInput extends via((field) => ({ title: field(String), })) {\n",
        expectedCode: "module-index-typescript-parse-error",
      },
      {
        name: "missing-input",
        constant: "export class Post extends via(() => ({})) {}\n",
        expectedCode: "module-index-constant-input-missing",
      },
      {
        name: "missing-via",
        constant: "export class PostInput {}\n",
        expectedCode: "module-index-constant-via-missing",
      },
      {
        name: "malformed-via",
        constant: "export class PostInput extends via(PostObject) {}\n",
        expectedCode: "module-index-constant-builder-missing",
      },
      {
        name: "missing-builder-object",
        constant: "export class PostInput extends via((field) => field(String)) {}\n",
        expectedCode: "module-index-constant-builder-object-missing",
      },
    ];

    for (const item of cases) {
      const { root, workspace } = await makeWorkspace();
      const modulePath = path.join(root, "apps/demo/lib/post");
      await writeText(path.join(modulePath, "post.constant.ts"), item.constant);
      await writeText(path.join(modulePath, "post.dictionary.ts"), validDictionary);

      const index = await buildAkanModuleContextIndex(
        workspace,
        moduleContext(["post.abstract.md", "post.constant.ts", "post.dictionary.ts"]),
      );

      expect(
        index.diagnostics.map((diagnostic) => diagnostic.code),
        item.name,
      ).toContain(item.expectedCode);
      expect(JSON.stringify(index), item.name).not.toContain(item.constant.trim());
    }
  });

  test("reports unsupported dictionary model callback shapes", async () => {
    const validConstant = `
import { via } from "akanjs/constant";

export class PostInput extends via((field) => ({})) {}
`;
    const cases = [
      {
        name: "missing-callback",
        dictionary: 'export const dictionary = modelDictionary(["en"]).model<Post>();\n',
        expectedCode: "module-index-dictionary-builder-missing",
      },
      {
        name: "missing-object-return",
        dictionary: 'export const dictionary = modelDictionary(["en"]).model<Post>((t) => t(["Title"]));\n',
        expectedCode: "module-index-dictionary-builder-object-missing",
      },
    ];

    for (const item of cases) {
      const { root, workspace } = await makeWorkspace();
      const modulePath = path.join(root, "apps/demo/lib/post");
      await writeText(path.join(modulePath, "post.constant.ts"), validConstant);
      await writeText(path.join(modulePath, "post.dictionary.ts"), item.dictionary);

      const index = await buildAkanModuleContextIndex(
        workspace,
        moduleContext(["post.abstract.md", "post.constant.ts", "post.dictionary.ts"]),
      );

      expect(
        index.diagnostics.map((diagnostic) => diagnostic.code),
        item.name,
      ).toContain(item.expectedCode);
      expect(
        index.diagnostics.map((diagnostic) => diagnostic.code),
        item.name,
      ).not.toContain("module-index-dictionary-model-missing");
      expect(JSON.stringify(index), item.name).not.toContain(item.dictionary.trim());
    }
  });
});
