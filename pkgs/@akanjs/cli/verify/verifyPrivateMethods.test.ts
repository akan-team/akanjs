import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeText } from "@akanjs/devkit/testHelpers";
import ts from "typescript";
import { VerifyPrivateMethods } from "./verifyPrivateMethods";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const rewrite = (text: string) => VerifyPrivateMethods.rewrite(ts, "post.service.ts", text);

describe("VerifyPrivateMethods", () => {
  test("turns each #private method into a TypeScript private one and renames every reference to it", () => {
    const { text, renamed } = rewrite(`export class PostService {
  #cache = new Map<string, number>();
  async #load(id: string) { return this.#cache.get(id) ?? (await this.#fetch(id)); }
  static #make() { return new PostService(); }
  *#ids() { yield 1; }
  #fetch(id: string) { return Promise.resolve(id.length); }
  run() { return [this.#load("a"), PostService.#make(), [...this.#ids()], this.#fetch.bind(this)]; }
}
`);

    expect(renamed.sort((left, right) => left.localeCompare(right))).toEqual(["#fetch", "#ids", "#load", "#make"]);
    expect(text).toBe(`export class PostService {
  #cache = new Map<string, number>();
  private async load(id: string) { return this.#cache.get(id) ?? (await this.fetch(id)); }
  private static make() { return new PostService(); }
  private *ids() { yield 1; }
  private fetch(id: string) { return Promise.resolve(id.length); }
  run() { return [this.load("a"), PostService.make(), [...this.ids()], this.fetch.bind(this)]; }
}
`);
  });

  test("leaves a method alone when its plain name is taken or a brand check reads it", () => {
    const source = `export class PostService {
  load() { return this.#load(); }
  #load() { return 1; }
  #check() { return 2; }
  is(value: object) { return #check in value; }
  constructor(private readonly size: number) {}
  #size() { return this.size; }
}
`;
    expect(rewrite(source)).toEqual({ text: source, renamed: [] });
  });

  test("renames a nested class's own #method only inside that class", () => {
    const { text } = rewrite(`export class Outer {
  #name() { return "outer"; }
  make() {
    return class Inner {
      #name() { return "inner"; }
      read(outer: Outer) { return this.#name(); }
    };
  }
  read() { return this.#name(); }
}
`);

    expect(text).toBe(`export class Outer {
  private name() { return "outer"; }
  make() {
    return class Inner {
      private name() { return "inner"; }
      read(outer: Outer) { return this.name(); }
    };
  }
  read() { return this.name(); }
}
`);
  });

  test("fixes module files only, across a whole target when no file is named", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verify-private-"));
    roots.push(root);
    const body = "export class A { #go() { return 1; } run() { return this.#go(); } }\n";
    await writeText(path.join(root, "apps/demo/lib/post/post.service.ts"), body);
    await writeText(path.join(root, "apps/demo/lib/post/post.store.ts"), body);
    await writeText(path.join(root, "apps/demo/srvkit/postApi.ts"), body);
    await writeText(path.join(root, "apps/demo/lib/post/Post.Unit.tsx"), body);

    const rewritten = await VerifyPrivateMethods.fix(root, "apps/demo", []);

    expect([...rewritten.keys()].sort((left, right) => left.localeCompare(right))).toEqual([
      "apps/demo/lib/post/post.service.ts",
      "apps/demo/lib/post/post.store.ts",
    ]);
    expect(await Bun.file(path.join(root, "apps/demo/lib/post/post.service.ts")).text()).toBe(
      "export class A { private go() { return 1; } run() { return this.go(); } }\n",
    );
    expect(await Bun.file(path.join(root, "apps/demo/srvkit/postApi.ts")).text()).toBe(body);
    expect([...(await VerifyPrivateMethods.fix(root, "apps/demo", ["apps/demo/srvkit/postApi.ts"])).keys()]).toEqual(
      [],
    );
  });

  test("leaves a name another store or the same-named lib module declares, and skips what Biome ignores", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verify-private-"));
    roots.push(root);
    const store = "export class PostStore { #reset() { return 1; } #mark() { return 2; } }\n";
    const service = "export class PostService { #load() { return 1; } #cache() { return 2; } }\n";
    await writeText(path.join(root, "apps/demo/lib/post/post.store.ts"), store);
    await writeText(path.join(root, "libs/shared/lib/comment/comment.store.ts"), "export class C { #reset() {} }\n");
    await writeText(path.join(root, "apps/demo/lib/post/post.service.ts"), service);
    await writeText(path.join(root, "libs/shared/lib/post/post.service.ts"), "export class P { load() {} }\n");
    await writeText(path.join(root, "apps/demo/lib/user/user.service.ts"), "export class U { cache() {} }\n");
    await writeText(path.join(root, "apps/demo/local/old/old.service.ts"), service);

    await VerifyPrivateMethods.fix(root, "apps/demo", []);

    expect(await Bun.file(path.join(root, "apps/demo/lib/post/post.store.ts")).text()).toBe(
      "export class PostStore { #reset() { return 1; } private mark() { return 2; } }\n",
    );
    expect(await Bun.file(path.join(root, "apps/demo/lib/post/post.service.ts")).text()).toBe(
      "export class PostService { #load() { return 1; } private cache() { return 2; } }\n",
    );
    expect(await Bun.file(path.join(root, "apps/demo/local/old/old.service.ts")).text()).toBe(service);
  });
});
