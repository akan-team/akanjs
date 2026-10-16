import { describe, expect, test } from "bun:test";
import { type CssBlock, CssBlockParser, type CssNode } from "./cssBlockParser";

const blocksOf = (block: CssBlock) => block.nodes.filter((node): node is CssBlock => node.kind === "block");
const declarationsOf = (block: CssBlock) =>
  block.nodes.flatMap((node) => (node.kind === "declaration" ? [[node.property, node.value]] : []));

const expectLinear = (run: () => unknown) => {
  const started = performance.now();
  run();
  expect(performance.now() - started).toBeLessThan(1000);
};

describe("CssBlockParser.parse", () => {
  test("reads consecutive blocks with their preludes and declarations", () => {
    const root = CssBlockParser.parse(`a { --x: 1; } b { --y: 2 } c{--z:3}`);
    expect(blocksOf(root).map((block) => block.prelude)).toEqual(["a", "b", "c"]);
    expect(blocksOf(root).map(declarationsOf)).toEqual([[["--x", "1"]], [["--y", "2"]], [["--z", "3"]]]);
  });

  test("nests at-rules and nested rules, keeping a block's own declarations apart from its children's", () => {
    const root = CssBlockParser.parse(
      `@media (min-width: 1px) { :root { --a: 1; } } .card { color: red; &:hover { color: blue; } --b: 2; }`,
    );
    const [media, card] = blocksOf(root);
    expect(media.atRule).toBe("@media");
    expect(media.prelude).toBe("@media (min-width: 1px)");
    expect(declarationsOf(blocksOf(media)[0])).toEqual([["--a", "1"]]);
    expect(card.atRule).toBeNull();
    expect(declarationsOf(card)).toEqual([
      ["color", "red"],
      ["--b", "2"],
    ]);
    expect(blocksOf(card).map((block) => block.prelude)).toEqual(["&:hover"]);
  });

  test("treats at-rule statements as neither blocks nor declarations", () => {
    const root = CssBlockParser.parse(
      `@source "./**/*";\n@import "tailwindcss";\n@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));\n:root { --a: 1; }`,
    );
    expect(root.nodes).toEqual([
      { kind: "block", prelude: ":root", atRule: null, nodes: [{ kind: "declaration", property: "--a", value: "1" }] },
    ]);
  });

  test("ignores braces, semicolons and comment markers inside strings, comments and escapes", () => {
    const root = CssBlockParser.parse(
      [
        `/* :root { --commented: 1; } */`,
        `.a::before { content: "} ; /* {"; --q: 'x;y'; }`,
        `.w-\\[10px\\]\\{ { --escaped: 1; }`,
        `.b { background: url(data:image/png;base64,AAAA); --after: 2; }`,
      ].join("\n"),
    );
    expect(blocksOf(root).map((block) => block.prelude)).toEqual([".a::before", ".w-\\[10px\\]\\{", ".b"]);
    expect(blocksOf(root).map(declarationsOf)).toEqual([
      [
        ["content", `"} ; /* {"`],
        ["--q", "'x;y'"],
      ],
      [["--escaped", "1"]],
      [
        ["background", "url(data:image/png;base64,AAAA)"],
        ["--after", "2"],
      ],
    ]);
  });

  test("drops comments from preludes and values", () => {
    const root = CssBlockParser.parse(`/* lead */ :root /* mid */ , [data-theme="dark"] { --a: /* x */ #fff; }`);
    const [block] = blocksOf(root);
    expect(block.prelude).toBe(`:root  , [data-theme="dark"]`);
    expect(declarationsOf(block)).toEqual([["--a", "#fff"]]);
  });

  test("closes what the input leaves open and tolerates a stray closing brace", () => {
    const root = CssBlockParser.parse(`} :root { --a: 1; .x { --b: 2`);
    const [rootBlock] = blocksOf(root);
    expect(declarationsOf(rootBlock)).toEqual([["--a", "1"]]);
    expect(declarationsOf(blocksOf(rootBlock)[0])).toEqual([["--b", "2"]]);
    expect(CssBlockParser.parse(`.a { content: "unterminated\n--b: 2; }`).nodes).toHaveLength(1);
    expect(CssBlockParser.parse(`.a { --b: 1 } /* unterminated`).nodes).toHaveLength(1);
  });
});

describe("CssBlockParser.walk", () => {
  test("visits in source order, passing each block's context to its children", () => {
    const root = CssBlockParser.parse(
      `.a { --x: 1; @media m { --y: 2; } --z: 3; } @theme { --skipped: 1; } .b { --w: 4 }`,
    );
    const visited: string[] = [];
    CssBlockParser.walk(root, "", (node: CssNode, path: string) => {
      if (node.kind === "declaration") {
        visited.push(`${path}${node.property}`);
        return null;
      }
      return node.atRule === "@theme" ? null : `${path}${node.prelude}>`;
    });
    expect(visited).toEqual([".a>--x", ".a>@media m>--y", ".a>--z", ".b>--w"]);
  });

  test("walks a deeply nested tree without recursion", () => {
    const root = CssBlockParser.parse(`${"@media x{".repeat(100_000)}:root{--deep:1}`);
    let found = "";
    CssBlockParser.walk(root, true, (node) => {
      if (node.kind === "declaration") found = node.property;
      return true;
    });
    expect(found).toBe("--deep");
  });
});

describe("CssBlockParser linear time", () => {
  test("adversarial runs finish well under a second", () => {
    expectLinear(() => CssBlockParser.parse(`}${" ".repeat(100_000)}`));
    expectLinear(() => CssBlockParser.parse(`:root{${"--".repeat(100_000)}`));
    expectLinear(() => CssBlockParser.parse("@theme".repeat(100_000)));
    expectLinear(() => CssBlockParser.parse("/*".repeat(100_000)));
    expectLinear(() => CssBlockParser.parse(`"${"\\".repeat(100_000)}`));
    expectLinear(() => CssBlockParser.parse("(".repeat(100_000)));
    expectLinear(() => CssBlockParser.parse(":root{--a:#fff}".repeat(100_000)));
  });
});
