import { describe, expect, test } from "bun:test";
import { StyleGuard, type StyleGuardRule } from "./styleGuard";

const guard = new StyleGuard();
const scan = (content: string, path = "Demo.tsx") => guard.run([{ path, content }]);
const rules = (content: string): StyleGuardRule[] => scan(content).map((v) => v.rule);

describe("StyleGuard raw-palette", () => {
  test("flags raw Tailwind palette utilities", () => {
    expect(rules('<div className="bg-blue-500 text-gray-700" />')).toEqual(["raw-palette", "raw-palette"]);
  });

  test("flags palette with variant prefix and opacity", () => {
    expect(rules('<div className="hover:bg-red-500/50" />')).toContain("raw-palette");
  });

  test("flags numeric neutral but allows bare semantic neutral", () => {
    expect(rules('<div className="bg-neutral-500" />')).toEqual(["raw-palette"]);
    expect(scan('<div className="bg-neutral text-neutral-foreground" />')).toHaveLength(0);
  });

  test("does not flag semantic tokens or black/white", () => {
    expect(scan('<div className="bg-primary text-muted-foreground border-border" />')).toHaveLength(0);
    expect(scan('<div className="bg-black text-white bg-white/30 bg-black/50" />')).toHaveLength(0);
  });

  test("does not flag non-color numeric utilities", () => {
    expect(scan('<div className="gap-4 mt-2 grid-cols-3 w-500" />')).toHaveLength(0);
  });
});

describe("StyleGuard arbitrary-color", () => {
  test("flags hex and color-function arbitrary values", () => {
    expect(rules('<div className="bg-[#3b82f6]" />')).toEqual(["arbitrary-color"]);
    expect(rules('<div className="text-[rgb(0,0,0)]" />')).toEqual(["arbitrary-color"]);
  });

  test("allows arbitrary CSS variable references", () => {
    expect(scan('<div className="bg-[--brand] text-[var(--fg)]" />')).toHaveLength(0);
  });
});

describe("StyleGuard inline-color", () => {
  test("flags hardcoded color in style object", () => {
    expect(rules("<div style={{ color: '#fff', background: 'rgb(0,0,0)' }} />")).toEqual([
      "inline-color",
      "inline-color",
    ]);
  });

  test("flags color literal inside <style> tag", () => {
    expect(rules("<style>{`.x { color: #abcdef; }`}</style>")).toEqual(["inline-color"]);
  });

  test("allows var() references in style object", () => {
    expect(scan("<div style={{ color: 'var(--primary)', width: '100%' }} />")).toHaveLength(0);
  });
});

describe("StyleGuard daisyui-legacy", () => {
  test("flags high-signal daisyUI compound classes", () => {
    expect(rules('<button className="btn-primary" />')).toEqual(["daisyui-legacy"]);
    expect(rules('<span className="badge-success" />')).toEqual(["daisyui-legacy"]);
    expect(rules('<div className="modal-box card-body" />')).toEqual(["daisyui-legacy", "daisyui-legacy"]);
  });

  test("does not flag bare ambiguous names that collide with Tailwind", () => {
    expect(scan('<div className="card input badge btn" />')).toHaveLength(0);
  });

  test("flags daisyUI colour slots the vocabulary dropped", () => {
    expect(rules('<div className="bg-base-100" />')).toEqual(["daisyui-legacy"]);
    expect(rules('<div className="text-base-content/70" />')).toEqual(["daisyui-legacy"]);
    expect(rules('<div className="border-t-base-300" />')).toEqual(["daisyui-legacy"]);
    expect(rules('<div className="text-primary-content" />')).toEqual(["daisyui-legacy"]);
    expect(rules('<div className="border-error/30 bg-error/5" />')).toEqual(["daisyui-legacy", "daisyui-legacy"]);
  });

  test("does not flag colour slots that survived into the semantic vocabulary", () => {
    expect(scan('<div className="bg-primary text-primary-foreground" />')).toHaveLength(0);
    expect(scan('<div className="bg-neutral text-info border-warning" />')).toHaveLength(0);
    expect(scan('<div className="bg-destructive/10 text-destructive" />')).toHaveLength(0);
    expect(scan('<div className="content-center justify-content" />')).toHaveLength(0);
  });
});

// The fixtures below must contain a literal `${`. Writing it inside a plain string trips biome's
// noTemplateCurlyInString, so the placeholder is assembled from `D` — that keeps the rule on for real code
// instead of scattering suppressions through the fixtures.
const D = "$";
const INTERPOLATED = {
  size: `<div className={\`min-h-[${D}{minHeight}px] flex\`} />`,
  color: `<div className={\`bg-[${D}{color}] w-full\`} />`,
  brokenBracket: `<div className={\`min-h-[ w-full${D}{minHeight}px] flex\`} />`,
  outsideBrackets: `<div className={\`flex gap-2 ${D}{isOpen ? "opacity-50" : ""}\`} />`,
  styleProp: `<div style={{ minHeight }} className={\`flex ${D}{extra}\`} />`,
};

describe("StyleGuard interpolated-arbitrary", () => {
  test("flags an arbitrary value assembled from a runtime expression", () => {
    expect(rules(INTERPOLATED.size)).toEqual(["interpolated-arbitrary"]);
    expect(rules(INTERPOLATED.color)).toEqual(["interpolated-arbitrary"]);
  });

  test("flags the broken-bracket typo that swallows the next class", () => {
    expect(rules(INTERPOLATED.brokenBracket)).toEqual(["interpolated-arbitrary"]);
  });

  test("allows a literal arbitrary value, and interpolation outside brackets", () => {
    expect(scan('<div className="min-h-[300px] flex" />')).toHaveLength(0);
    expect(scan(INTERPOLATED.outsideBrackets)).toHaveLength(0);
    expect(scan(INTERPOLATED.styleProp)).toHaveLength(0);
  });
});

describe("StyleGuard violation shape", () => {
  test("reports 1-based line and trimmed snippet with a suggestion", () => {
    const content = ['<div className="ok" />', '  <div className="bg-blue-500" />'].join("\n");
    const [v] = scan(content);
    expect(v.line).toBe(2);
    expect(v.snippet).toBe('<div className="bg-blue-500" />');
    expect(v.severity).toBe("error");
    expect(v.suggestion.length).toBeGreaterThan(0);
  });
});

describe("StyleGuard comment handling", () => {
  test("does not flag class names inside line or block comments", () => {
    expect(scan('// iconClassName="btn-primary bg-blue-500"')).toHaveLength(0);
    expect(scan("/** legacy: toggle-accent / bg-red-500 */")).toHaveLength(0);
    expect(scan("{/* <div className='bg-blue-500' /> */}")).toHaveLength(0);
  });

  test("still flags real code on a line that also contains a string with //", () => {
    expect(rules('<a href="https://x.io" className="bg-blue-500" />')).toEqual(["raw-palette"]);
  });
});

describe("StyleGuard escape hatch", () => {
  test("styleguard-disable-next-line suppresses the following line only", () => {
    const content = [
      "// styleguard-disable-next-line raw-palette",
      '<div className="bg-blue-500" />',
      '<div className="bg-red-500" />',
    ].join("\n");
    const found = scan(content);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(3);
  });

  test("file-level styleguard-disable suppresses the named rule everywhere", () => {
    const content = ["// styleguard-disable raw-palette", '<div className="bg-blue-500 bg-[#fff]" />'].join("\n");
    // raw-palette suppressed, arbitrary-color still reported.
    expect(rules(content)).toEqual(["arbitrary-color"]);
  });

  test("bare styleguard-disable suppresses all rules in the file", () => {
    const content = ["/* styleguard-disable */", '<div className="bg-blue-500 btn-primary bg-[#fff]" />'].join("\n");
    expect(scan(content)).toHaveLength(0);
  });
});

describe("StyleGuard.countNamedComponentClasses", () => {
  test("counts named classes declared inside @layer components", () => {
    const css = `
      @layer components {
        .foo { color: var(--primary); }
        .bar-baz { padding: 1rem; }
      }
      .outside { color: red; }
    `;
    const metric = StyleGuard.countNamedComponentClasses(css);
    expect(metric.count).toBe(2);
    expect(metric.names).toEqual(["bar-baz", "foo"]);
  });

  test("returns zero when no component layer exists", () => {
    expect(StyleGuard.countNamedComponentClasses(".a { color: red; }").count).toBe(0);
  });
});
