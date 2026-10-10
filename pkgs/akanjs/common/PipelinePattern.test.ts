import { describe, expect, test } from "bun:test";
import { PipelinePattern } from "./PipelinePattern";

describe("PipelinePattern", () => {
  test("`*` stays inside one segment, `**` crosses them", () => {
    expect(PipelinePattern.matches("release/*", "release/1.0")).toBe(true);
    expect(PipelinePattern.matches("release/*", "release/1.0/hotfix")).toBe(false);
    expect(PipelinePattern.matches("release/**", "release/1.0/hotfix")).toBe(true);
    expect(PipelinePattern.matches("apps/**", "apps/web/page/_index.tsx")).toBe(true);
    expect(PipelinePattern.matches("apps/*", "apps/web/page/_index.tsx")).toBe(false);
  });

  test("`**/` also matches no segment", () => {
    expect(PipelinePattern.matches("**/*.md", "README.md")).toBe(true);
    expect(PipelinePattern.matches("**/*.md", "docs/a/b.md")).toBe(true);
    expect(PipelinePattern.matches("apps/**/test.ts", "apps/test.ts")).toBe(true);
    expect(PipelinePattern.matches("apps/**/test.ts", "apps/web/lib/test.ts")).toBe(true);
  });

  test("`?` is one character but `/`", () => {
    expect(PipelinePattern.matches("v?", "v1")).toBe(true);
    expect(PipelinePattern.matches("v?", "v10")).toBe(false);
    expect(PipelinePattern.matches("a?b", "a/b")).toBe(false);
  });

  test("everything else is literal and case-sensitive", () => {
    expect(PipelinePattern.matches("main", "main")).toBe(true);
    expect(PipelinePattern.matches("main", "Main")).toBe(false);
    expect(PipelinePattern.matches("a.b", "aXb")).toBe(false);
    expect(PipelinePattern.matches("a+b", "a+b")).toBe(true);
  });

  test("`!` excludes, and a list of exclusions alone admits everything else", () => {
    expect(PipelinePattern.matches(["*", "!edge"], "web")).toBe(true);
    expect(PipelinePattern.matches(["*", "!edge"], "edge")).toBe(false);
    expect(PipelinePattern.matches(["!docs/**"], "apps/web/x.ts")).toBe(true);
    expect(PipelinePattern.matches(["!docs/**"], "docs/intro.md")).toBe(false);
    expect(PipelinePattern.matches(["main", "develop"], "debug")).toBe(false);
  });

  test("matchesAny reads `changed`: one matching path is enough", () => {
    expect(PipelinePattern.matchesAny(["!docs/**"], ["docs/a.md", "apps/web/x.ts"])).toBe(true);
    expect(PipelinePattern.matchesAny(["!docs/**"], ["docs/a.md"])).toBe(false);
    expect(PipelinePattern.matchesAny("apps/web/**", [])).toBe(false);
  });

  test("validate refuses what it does not give a meaning", () => {
    expect(PipelinePattern.validate(["apps/**", "!**/*.md"])).toBeNull();
    expect(PipelinePattern.validate([])).toContain("empty");
    expect(PipelinePattern.validate("!")).toContain("matches nothing");
    expect(PipelinePattern.validate("!!main")).toContain("negates twice");
    expect(PipelinePattern.validate("apps/{web,api}/**")).toContain("braces");
    expect(PipelinePattern.validate("v[0-9]")).toContain("character class");
    expect(PipelinePattern.validate("a\\*b")).toContain("backslash");
    expect(PipelinePattern.validate("x".repeat(300))).toContain("longer than");
  });
});
