import { describe, expect, test } from "bun:test";
import { DictionaryKeys } from "./dictionaryKeys";

const read = (source: string, fileName = "apps/demo/lib/memo/Memo.Unit.tsx") => DictionaryKeys.read(source, fileName);

describe("DictionaryKeys", () => {
  test("follows a literal key, a template whose group is written, and a key chosen from a table the file holds", () => {
    const keys = read(`
      import { usePage } from "akanjs/client";
      const tabs = [{ id: "all", label: "memo.tab.all" }, { id: "mine", label: "comment.tab.mine" }] as const;
      export const MemoTitle = ({ field }: { field: "title" | "content" }) => {
        const { l } = usePage();
        return (
          <>
            {l("memo.modelName")}
            {l(\`memo.\${field}\`)}
            {tabs.map((tab) => l(tab.label))}
          </>
        );
      };
    `);
    expect(keys.unread).toEqual([]);
    expect(keys.anyModule).toBeNull();
    expect(keys.names).toEqual(expect.arrayContaining(["comment", "memo"]));
  });

  test("follows a key typed as a union of written keys, and a prop of such a type", () => {
    const keys = read(`
      type MemoKey = "memo.title" | "memo.content";
      interface Props { label: \`user.\${string}\`; fallback?: MemoKey }
      export const Label = ({ label, fallback }: Props) => {
        const { l } = usePage();
        return <>{l(label)}{fallback ? l(fallback) : null}</>;
      };
    `);
    expect(keys.unread).toEqual([]);
  });

  test("names the file's line and the reason for a key it cannot follow", () => {
    const keys = read(
      [
        `import { usePage } from "akanjs/client";`,
        `export const Any = ({ name }: { name: string }) => {`,
        `  const { l } = usePage();`,
        `  return <>{l(name)}</>;`,
        `};`,
      ].join("\n"),
    );
    expect(keys.unread).toEqual([{ line: 4, why: "name is a parameter or prop whose type names no key" }]);
  });

  test("reads a key built from data, a call's result and an import as unread", () => {
    const keys = read(`
      import { keyOf } from "./keys";
      export const View = ({ memo }: { memo: { status: string } }) => {
        const { l } = usePage();
        return <>{l(memo.status)}{l(keyOf(memo))}{l(keyOf)}</>;
      };
    `);
    expect(keys.unread.map(({ why }) => why)).toEqual([
      "memo.status is read from data at run time",
      "keyOf(memo) is a call's result",
      "keyOf is imported from another file",
    ]);
  });

  test("reads a translator handed to another function as unread, under any name it is destructured as", () => {
    const keys = read(`
      export const View = () => {
        const { l: t } = usePage();
        return <>{format(t, "memo.title")}</>;
      };
    `);
    expect(keys.unread.map(({ why }) => why)).toEqual(["t passes the translator on"]);
  });

  test("counts the property names of an object the file holds when a key is built from them", () => {
    const shapes = {
      keys: `Object.keys(tabs).map((name) => l(\`\${name}.modelName\`))`,
      entries: `Object.entries(tabs).map(([name]) => l(\`\${name}.modelName\`))`,
      forIn: `(() => { for (const name in tabs) return l(\`\${name}.modelName\`); })()`,
    };
    for (const [shape, use] of Object.entries(shapes)) {
      const keys = read(`
        const tabs = { order: BiBox, "refund": BiUndo, [\`note\`]: 1, 7: 2 };
        export const Nav = () => { const { l } = usePage(); return <>{${use}}</>; };
      `);
      expect(keys.unread, shape).toEqual([]);
      expect(keys.names, shape).toEqual(expect.arrayContaining(["order", "refund", "note"]));
    }
    const typed = read(`
      const tabs = { order: 1, refund: 2 };
      export const Nav = ({ name }: { name: keyof typeof tabs }) => { const { l } = usePage(); return l(\`\${name}.modelName\`); };
    `);
    expect(typed.unread).toEqual([]);
    expect(typed.names).toEqual(expect.arrayContaining(["order", "refund"]));
  });

  test("fails to the whole dictionary for property names it cannot count", () => {
    const wrap = (table: string, use: string) =>
      read(`
        import { other } from "./other";
        ${table}
        export const Nav = ({ name }: { name: keyof typeof tabs }) => { const { l } = usePage(); return <>{${use}}</>; };
      `);
    const use = `Object.keys(tabs).map((name) => l(\`\${name}.modelName\`))`;
    expect(wrap("const tabs = { [dynamic()]: 1 };", use).unread).toHaveLength(1);
    expect(wrap("const tabs = { ...other, order: 1 };", use).unread).toHaveLength(1);
    expect(wrap("const tabs = other;", use).unread).toHaveLength(1);
    expect(
      wrap("const tabs = { order: 1 };", `Object.keys(other).map((name) => l(\`\${name}.modelName\`))`).unread,
    ).toHaveLength(1);
    expect(
      wrap("const tabs = { a: { order: 1 } };", `Object.keys(tabs.a).map((name) => l(\`\${name}.modelName\`))`).unread,
    ).toHaveLength(1);
    expect(wrap("const tabs = { [dynamic()]: 1 };", `l(\`\${name}.modelName\`)`).unread).toHaveLength(1);
  });

  test("counts the literal head of a template type as its group, and fails a head with none", () => {
    const keys = read(`
      interface Props { label: \`memo.\${string}\` }
      export const Label = ({ label }: Props) => { const { l } = usePage(); return l(label); };
    `);
    expect(keys.unread).toEqual([]);
    expect(keys.names).toContain("memo");
    const headless = read(`
      export const Label = ({ label }: { label: \`\${string}.title\` }) => { const { l } = usePage(); return l(label); };
    `);
    expect(headless.unread).toHaveLength(1);
  });

  test("reads a translator used other than as a call or a member call it understands as unread", () => {
    const uses = [
      "const t = l; return t('memo.title');",
      "const page = usePage(); const t = page.l; return t('memo.title');",
      "return <Row t={l} />;",
      "return helper({ l });",
      "return [l];",
      "return l._ ? 1 : 0;",
    ];
    for (const use of uses) {
      const keys = read(`export const A = () => { const { l } = usePage(); ${use} };`);
      expect(keys.unread.length, use).toBeGreaterThan(0);
    }
    expect(read(`export const useT = () => { const { l } = usePage(); return l; };`).unread).toHaveLength(1);
    const understood = read(`
      export const A = ({ m }: { m: string }) => {
        const page = usePage();
        const { l } = page;
        return <>{l("memo.title")}{l._("memo.title")}{l.rich("memo.title")}{l.trans({ en: "a", ko: "b" })}{page.l("memo.title")}{l.field(m, "title")}{l.enum(m, "x")}</>;
      };
    `);
    expect(understood.unread).toEqual([]);
  });

  test("marks a framework surface that shows the texts of any module", () => {
    expect(read(`import { Signal } from "akanjs/ui";`).anyModule).toContain("Signal from akanjs/ui");
    expect(read(`import { Field } from "akanjs/ui/Constant";`).anyModule).toContain("Constant from akanjs/ui/Constant");
    expect(read(`import { Data, Field } from "akanjs/ui";`).anyModule).toBeNull();
    expect(read(`import type { Signal } from "akanjs/ui";`).anyModule).toBeNull();
  });

  test("collects the class names a constant table maps to groups, the one-name props, and the API keys", () => {
    const keys = read(`
      export const List = () => (
        <Data.Dashboard modelName="memo" sliceName="memoInAdmin" filter={MemoStatus} title={l("memo.signal.getMemo.desc")} />
      );
    `);
    expect(keys.classNames).toEqual(expect.arrayContaining(["MemoStatus"]));
    expect(keys.propNames).toEqual(["memo", "memoInAdmin", "summary"]);
    expect(keys.api).toBe(true);
  });
});
