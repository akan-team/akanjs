import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

type Lang = "en" | "ko";
type LocalizedText = Record<Lang, string>;
type Priority = "P0" | "P1" | "P2";

interface MenuMeta {
  category: string;
  title: LocalizedText;
}

interface Heading {
  id: string;
  title: string;
}

interface CodeBlock {
  title: string;
  language: string;
  code: string;
}

interface LlmsPage {
  href: string;
  mirrorHref: string;
  section: string;
  category: string;
  title: string;
  priority: Priority;
  headings: Heading[];
  body: string[];
  codeBlocks: CodeBlock[];
  emptySections: Heading[];
  sourceTexts: SourceText[];
}

interface TextMatcher {
  text: string;
  pattern: RegExp | null;
}

interface SourceText {
  label: string;
  matchers: TextMatcher[];
  row: boolean;
  readable: boolean;
}

interface Line {
  text: string;
  indent: string;
  scope: string;
  owner: ts.Node | null;
}

const appRoot = path.resolve(import.meta.dir, "..");
const docsRoot = path.join(appRoot, "page", "(docs)");
const publicRoot = path.join(appRoot, "public");
const pagesOutputRoot = path.join(publicRoot, "llms", "pages");
const llmsTxtPath = path.join(publicRoot, "llms.txt");
const llmsFullPath = path.join(publicRoot, "llms-full.txt");

const p0ExactHrefs = new Set([
  "/docs/intro/quickstart",
  "/docs/intro/fundamentals",
  "/docs/intro/practice",
  "/docs/core/runtime",
  "/docs/core/routing",
  "/docs/core/config",
  "/docs/core/folder-rule",
  "/docs/core/file-rule",
  "/docs/core/data-layer",
  "/docs/core/multi-client",
  "/docs/arch/overview",
  "/docs/arch/infra",
  "/docs/arch/frontend",
  "/docs/arch/ui-composition",
  "/docs/arch/backend",
  "/docs/arch/mobile",
  "/docs/arch/css",
  "/references/cli/overview",
  "/references/cli/workspace",
  "/references/cli/application",
  "/references/cli/library",
  "/references/cli/module",
  "/references/cli/scalar",
  "/references/cli/package",
  "/references/cli/page",
  "/references/cli/primitive",
  "/references/cli/workflow",
  "/references/cli/quality",
  "/references/cli/tunnel",
  "/references/cli/code",
  "/references/cli/cloud",
  "/references/cli/context",
  "/references/cli/agent",
  "/references/cli/guideline",
  "/references/akanjs/base",
  "/references/akanjs/common",
  "/references/akanjs/constant",
  "/references/akanjs/fetch",
  "/references/akanjs/signal",
  "/references/akanjs/server",
  "/references/akanjs/client",
  "/references/akanjs/webkit",
]);

const p1Prefixes = ["/conventions/", "/references/ui/", "/docs/tutorials/"];

const representativeHrefs = [
  "/docs/intro/quickstart",
  "/docs/intro/fundamentals",
  "/docs/core/folder-rule",
  "/docs/core/file-rule",
  "/docs/core/runtime",
  "/docs/core/config",
  "/docs/core/data-layer",
  "/references/cli/overview",
  "/references/akanjs/base",
  "/references/akanjs/signal",
  "/references/akanjs/server",
  "/conventions/module/overview",
  "/cheatsheet/interface/crud",
  "/cheatsheet/dev/test",
];

const flatten = (value: string) => value.replace(/\s+/g, " ").trim();

//? A line repeats only across scopes: a shared option row belongs under every command that lists it.
const unique = (lines: Pick<Line, "text" | "indent" | "scope">[]) => {
  const seen = new Set<string>();
  return lines.flatMap(({ text, indent, scope }) => {
    const flat = flatten(text);
    const key = `${scope}\u0000${indent}${flat}`;
    if (!flat || seen.has(key)) return [];
    seen.add(key);
    return [`${indent}${flat}`];
  });
};

const getProp = (object: ts.ObjectLiteralExpression, name: string) => {
  return object.properties.find((prop): prop is ts.PropertyAssignment => {
    if (!ts.isPropertyAssignment(prop)) return false;
    return propName(prop) === name;
  });
};

const propName = (prop: ts.PropertyAssignment) => {
  const name = prop.name;
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
};

const unwrap = (node: ts.Node): ts.Node => {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
    return unwrap(node.expression);
  return node;
};

const constCache = new WeakMap<ts.SourceFile, Map<string, ts.Expression>>();

//? The arguments of the local helper call being read, such as `aliasNote("sd")`, bound to its parameter names.
const frames: Map<string, ts.Expression>[] = [];

const localConst = (name: string, sourceFile?: ts.SourceFile): ts.Expression | undefined => {
  for (let idx = frames.length - 1; idx >= 0; idx -= 1) {
    const bound = frames[idx]?.get(name);
    if (bound) return bound;
  }
  if (!sourceFile) return undefined;
  let consts = constCache.get(sourceFile);
  if (!consts) {
    const found = new Map<string, ts.Expression>();
    walk(sourceFile, (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (!found.has(node.name.text)) found.set(node.name.text, node.initializer);
      }
    });
    consts = found;
    constCache.set(sourceFile, consts);
  }
  return consts.get(name);
};

const htmlEntities: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

//? JSX text rules: each line is trimmed, blank lines drop, and the rest join with one space.
const jsxTextOf = (node: ts.JsxText) => {
  const lines = node.text.split(/\r\n|\n|\r/);
  const text =
    lines.length === 1
      ? node.text
      : lines
          .map((line, idx) => {
            const start = idx > 0 ? line.trimStart() : line;
            return idx < lines.length - 1 ? start.trimEnd() : start;
          })
          .filter((line) => line.length > 0)
          .join(" ");
  return text.replace(/&(lt|gt|amp|quot|apos|nbsp);/g, (_, name: string) => htmlEntities[name] ?? "");
};

const jsxToText = (node: ts.Node, sourceFile?: ts.SourceFile): string => {
  if (ts.isJsxText(node)) return jsxTextOf(node);
  if (ts.isJsxExpression(node)) return node.expression ? (getLocalizedText(node.expression, sourceFile)?.en ?? "") : "";
  if (ts.isJsxFragment(node)) return node.children.map((child) => jsxToText(child, sourceFile)).join("");
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(sourceFile) === "br" ? " " : "";
  if (ts.isJsxElement(node)) {
    const tag = node.openingElement.tagName.getText(sourceFile);
    const inner = node.children.map((child) => jsxToText(child, sourceFile)).join("");
    if (tag === "code") return `\`${inner}\``;
    if (tag === "strong" || tag === "b") return `**${inner.trim()}**`;
    return inner;
  }
  return "";
};

const isJsxNode = (node: ts.Node) =>
  ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node);

const returnedOf = (fn: ts.ArrowFunction | ts.FunctionExpression) => {
  if (!ts.isBlock(fn.body)) return fn.body;
  const [statement] = fn.body.statements;
  return fn.body.statements.length === 1 && statement && ts.isReturnStatement(statement)
    ? statement.expression
    : undefined;
};

const resolving = new Set<ts.Node>();

interface HelperCall {
  fn: ts.Node;
  body: ts.Node;
  frame: Map<string, ts.Expression>;
}

const helperCallOf = (node: ts.Node, sourceFile?: ts.SourceFile): HelperCall | null => {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return null;
  const value = localConst(node.expression.text, sourceFile);
  const fn = value ? unwrap(value) : null;
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || resolving.has(fn)) return null;
  const body = returnedOf(fn);
  if (!body) return null;
  const frame = new Map<string, ts.Expression>();
  fn.parameters.forEach((param, idx) => {
    const arg = node.arguments[idx];
    if (ts.isIdentifier(param.name) && arg) frame.set(param.name.text, arg);
  });
  return { fn, body: unwrap(body), frame };
};

const withFrame = <T>({ fn, frame }: HelperCall, read: () => T) => {
  frames.push(frame);
  resolving.add(fn);
  try {
    return read();
  } finally {
    resolving.delete(fn);
    frames.pop();
  }
};

const resolveConst = <T>(name: string, sourceFile: ts.SourceFile | undefined, read: (value: ts.Node) => T | null) => {
  const value = localConst(name, sourceFile);
  if (!value || resolving.has(value)) return null;
  resolving.add(value);
  try {
    return read(value);
  } finally {
    resolving.delete(value);
  }
};

const getStringValue = (input: ts.Node, sourceFile?: ts.SourceFile): string | null => {
  const node = unwrap(input);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    //? A placeholder no local constant resolves (a function parameter such as `alias`) reads as `<alias>`.
    return node.templateSpans.reduce((text, span) => {
      const value = getLocalizedText(span.expression, sourceFile)?.en ?? `<${span.expression.getText(sourceFile)}>`;
      return `${text}${value}${span.literal.text}`;
    }, node.head.text);
  }
  if (isJsxNode(node)) return jsxToText(node, sourceFile).replace(/\s+/g, " ").trim() || null;
  if (ts.isIdentifier(node)) {
    return resolveConst(node.text, sourceFile, (value) => {
      const target = unwrap(value);
      const stringLike =
        ts.isStringLiteral(target) ||
        ts.isNoSubstitutionTemplateLiteral(target) ||
        ts.isTemplateExpression(target) ||
        ts.isIdentifier(target);
      return stringLike ? getStringValue(target, sourceFile) : null;
    });
  }
  const helper = helperCallOf(node, sourceFile);
  if (helper) return withFrame(helper, () => getStringValue(helper.body, sourceFile));
  return null;
};

const getLocalizedObject = (node: ts.Node, sourceFile?: ts.SourceFile): LocalizedText | null => {
  if (!ts.isObjectLiteralExpression(node)) return null;
  const en = getProp(node, "en")?.initializer;
  const ko = getProp(node, "ko")?.initializer;
  const enText = en ? getStringValue(en, sourceFile) : null;
  const koText = ko ? getStringValue(ko, sourceFile) : null;
  if (!enText && !koText) return null;
  return {
    en: enText ?? koText ?? "",
    ko: koText ?? enText ?? "",
  };
};

const isTransCall = (node: ts.Node, sourceFile?: ts.SourceFile): node is ts.CallExpression =>
  ts.isCallExpression(node) && node.expression.getText(sourceFile).endsWith(".trans") && !!node.arguments[0];

const getLocalizedText = (input: ts.Node, sourceFile?: ts.SourceFile): LocalizedText | null => {
  const node = unwrap(input);
  const literalText = getStringValue(node, sourceFile);
  if (literalText) return { en: literalText, ko: literalText };
  if (isTransCall(node, sourceFile)) return getLocalizedObject(unwrap(node.arguments[0] as ts.Node), sourceFile);
  if (ts.isObjectLiteralExpression(node)) return getLocalizedObject(node, sourceFile);
  if (ts.isJsxExpression(node) && node.expression) return getLocalizedText(node.expression, sourceFile);
  if (ts.isIdentifier(node)) return resolveConst(node.text, sourceFile, (value) => getLocalizedText(value, sourceFile));
  const helper = helperCallOf(node, sourceFile);
  if (helper) return withFrame(helper, () => getLocalizedText(helper.body, sourceFile));
  return null;
};

const getJsxAttribute = (node: ts.JsxOpeningLikeElement, name: string) => {
  return node.attributes.properties.find((attr): attr is ts.JsxAttribute => {
    return ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name;
  });
};

const getJsxAttributeText = (node: ts.JsxOpeningLikeElement, name: string, sourceFile: ts.SourceFile) => {
  const attr = getJsxAttribute(node, name);
  if (!attr?.initializer) return null;
  return getLocalizedText(attr.initializer, sourceFile);
};

const getJsxAttributeString = (node: ts.JsxOpeningLikeElement, name: string, sourceFile: ts.SourceFile) => {
  const attr = getJsxAttribute(node, name);
  if (!attr?.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    return getStringValue(attr.initializer.expression, sourceFile);
  }
  return null;
};

const walk = (node: ts.Node, visitor: (node: ts.Node) => boolean | undefined) => {
  if (visitor(node) === false) return;
  node.forEachChild((child) => walk(child, visitor));
};

const arrayMethods = new Set(["map", "flatMap", "filter", "slice"]);

//? The rows a table or a list renders: `rows={x}`, `items={x.map(…)}` or `{x.map(…)}` over a local array of objects.
const renderedArrayOf = (expression: ts.Expression, sourceFile: ts.SourceFile) => {
  let target = unwrap(expression);
  while (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression)) {
    if (!arrayMethods.has(target.expression.name.text)) return null;
    target = unwrap(target.expression.expression);
  }
  if (!ts.isIdentifier(target)) return null;
  const value = localConst(target.text, sourceFile);
  const array = value ? unwrap(value) : null;
  if (!array || !ts.isArrayLiteralExpression(array)) return null;
  return array.elements.some(
    (element) => ts.isObjectLiteralExpression(unwrap(element)) || isTransCall(unwrap(element), sourceFile),
  )
    ? array
    : null;
};

const renderedExpressionOf = (node: ts.Node) => {
  if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer))
    return node.initializer.expression;
  if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)))
    return node.expression;
  return undefined;
};

const resolveObject = (node: ts.Node, sourceFile: ts.SourceFile) => {
  const target = unwrap(node);
  if (ts.isObjectLiteralExpression(target)) return target;
  if (!ts.isIdentifier(target)) return null;
  const value = localConst(target.text, sourceFile);
  const resolved = value ? unwrap(value) : null;
  return resolved && ts.isObjectLiteralExpression(resolved) ? resolved : null;
};

const arrayElementsOf = (node: ts.Node, sourceFile: ts.SourceFile) => {
  const target = unwrap(node);
  if (ts.isArrayLiteralExpression(target)) return target.elements;
  if (!ts.isIdentifier(target)) return null;
  const value = localConst(target.text, sourceFile);
  const resolved = value ? unwrap(value) : null;
  return resolved && ts.isArrayLiteralExpression(resolved) ? resolved.elements : null;
};

const isStringList = (elements: readonly ts.Expression[]) =>
  elements.length > 0 &&
  elements.every(
    (element) => ts.isStringLiteral(unwrap(element)) || ts.isNoSubstitutionTemplateLiteral(unwrap(element)),
  );

//? A row's own properties with `...spread` rows merged in, later keys winning as they do at runtime.
const rowEntries = (row: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile, seen = new Set<ts.Node>()) => {
  const entries = new Map<string, ts.Expression>();
  seen.add(row);
  for (const prop of row.properties) {
    if (ts.isSpreadAssignment(prop)) {
      const spread = resolveObject(prop.expression, sourceFile);
      if (!spread || seen.has(spread)) continue;
      for (const [key, value] of rowEntries(spread, sourceFile, seen)) entries.set(key, value);
      continue;
    }
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propName(prop);
    if (name) entries.set(name, prop.initializer);
  }
  return entries;
};

type RowEntries = Map<string, ts.Expression>;

const nameKeys = ["name", "key"];
const metaKeys = ["type", "defaultValue", "default", "enumOrFlag", "required", "tags"];
const skippedRowKeys = new Set(["icon", "image", "href", "className", "marks", "codeTitle"]);
const isSkippedKey = (key: string) => skippedRowKeys.has(key) || key === "ko" || key.endsWith("Ko");

const cellText = (value: ts.Expression, sourceFile: ts.SourceFile) => {
  const elements = arrayElementsOf(value, sourceFile);
  if (elements) return isStringList(elements) ? elements.map((element) => getStringValue(element)).join(", ") : null;
  return getLocalizedText(value, sourceFile)?.en ?? null;
};

const nameOf = (entries: RowEntries, sourceFile: ts.SourceFile) => {
  for (const key of nameKeys) {
    const value = entries.get(key);
    const text = value ? cellText(value, sourceFile) : null;
    if (text) return text;
  }
  return null;
};

const descOf = (entries: RowEntries, sourceFile: ts.SourceFile) => {
  const value = entries.get("desc") ?? entries.get("en");
  return value ? cellText(value, sourceFile) : null;
};

//? `{ key, label }` with no description is a table's column, not one of its rows.
const isColumnDefinition = (entries: RowEntries) =>
  entries.has("key") && entries.has("label") && !entries.has("desc") && !entries.has("en");

const isRowLike = (entries: RowEntries, sourceFile: ts.SourceFile) =>
  !isColumnDefinition(entries) && !!nameOf(entries, sourceFile) && !!descOf(entries, sourceFile);

const inlineCode = (code: string) => (code.includes("`") ? `\`\` ${code} \`\`` : `\`${code}\``);

const metaOf = (entries: RowEntries, sourceFile: ts.SourceFile) =>
  metaKeys.flatMap((key) => {
    const value = entries.get(key);
    const text = value ? cellText(value, sourceFile) : null;
    if (key === "required") return text === "yes" ? ["required"] : [];
    if (!text || text === "-") return [];
    return [key === "default" || key === "defaultValue" ? `default ${text}` : text];
  });

interface RowText {
  line: string | null;
  codeBlocks: CodeBlock[];
}

const rowTextOf = (entries: RowEntries, sourceFile: ts.SourceFile): RowText => {
  const name = nameOf(entries, sourceFile);
  const desc = descOf(entries, sourceFile);
  const reference = !!name && !!desc && !isColumnDefinition(entries);
  const codeBlocks: CodeBlock[] = [];
  const parts: string[] = [];
  for (const [key, value] of entries) {
    if (isSkippedKey(key)) continue;
    if (reference && (nameKeys.includes(key) || key === "desc" || key === "en" || metaKeys.includes(key))) continue;
    if (key === "code" || key === "example") {
      const code = getLocalizedText(value, sourceFile)?.en.trim();
      if (!code) continue;
      const codeTitle = key === "code" ? entries.get("codeTitle") : undefined;
      const title = (codeTitle ? cellText(codeTitle, sourceFile) : null) ?? name;
      if (code.includes("\n")) codeBlocks.push({ title: title ?? "Code", language: "ts", code });
      else parts.push(key === "example" ? `Example: ${inlineCode(code)}` : inlineCode(code));
      continue;
    }
    const text = cellText(value, sourceFile);
    if (text) parts.push(text);
  }
  if (reference) {
    const meta = metaOf(entries, sourceFile);
    return {
      line: `- ${name}${meta.length ? ` (${meta.join(", ")})` : ""}: ${[desc, ...parts].join(" — ")}`,
      codeBlocks,
    };
  }
  return { line: parts.length ? `- ${parts.join(" — ")}` : null, codeBlocks };
};

const collectFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return await collectFiles(fullPath);
      if (!entry.isFile() || !entry.name.endsWith(".tsx")) return [];
      if (entry.name.startsWith("_")) return [];
      return [fullPath];
    }),
  );
  return files.flat().sort();
};

const collectLayoutFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return await collectLayoutFiles(fullPath);
      if (entry.isFile() && entry.name === "_layout.tsx") return [fullPath];
      return [];
    }),
  );
  return files.flat();
};

const hrefFromFile = (filePath: string) => {
  const relative = path
    .relative(docsRoot, filePath)
    .replace(/\\/g, "/")
    .replace(/\.tsx$/, "");
  return `/${relative.replace(/\/index$/, "")}`;
};

const mirrorHrefFromHref = (href: string) => `/llms/pages${href}.md`;
const outputPathFromHref = (href: string) => path.join(pagesOutputRoot, `${href.replace(/^\//, "")}.md`);
const sectionFromHref = (href: string) => href.split("/").filter(Boolean)[0] ?? "docs";

const titleFromHref = (href: string) => {
  const segment = href.split("/").filter(Boolean).at(-1) ?? "Akan.js";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const priorityFromHref = (href: string): Priority => {
  if (p0ExactHrefs.has(href)) return "P0";
  if (p1Prefixes.some((prefix) => href.startsWith(prefix))) return "P1";
  return "P2";
};

const agentNotesForPage = (page: LlmsPage) => {
  const notes = [
    "Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.",
  ];
  if (page.href.includes("/core/") || page.href.includes("/conventions/")) {
    notes.push("Treat convention and generated-file rules as stronger than local style guesses.");
  }
  if (page.href.includes("/references/cli/")) {
    notes.push("Use commands from the workspace root unless a page explicitly says otherwise.");
  }
  if (page.href.includes("/references/akanjs/")) {
    notes.push("Respect server/client subpath boundaries when importing Akan APIs.");
  }
  if (page.href.includes("/cheatsheet/")) {
    notes.push("Use this page as a task recipe, then verify with the relevant lint, test, or build command.");
  }
  return notes;
};

const extractMenuMeta = async () => {
  const meta = new Map<string, MenuMeta>();
  const layoutFiles = await collectLayoutFiles(docsRoot);

  for (const filePath of layoutFiles) {
    const sourceText = await readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    walk(sourceFile, (node) => {
      if (!ts.isObjectLiteralExpression(node)) return;
      const subMenus = getProp(node, "subMenus")?.initializer;
      if (!subMenus || !ts.isArrayLiteralExpression(subMenus)) return;

      const categoryText = getProp(node, "name")?.initializer;
      const category = (categoryText ? getLocalizedText(categoryText, sourceFile) : null)?.en ?? "";

      for (const element of subMenus.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        const hrefInitializer = getProp(element, "href")?.initializer;
        const nameInitializer = getProp(element, "name")?.initializer;
        if (!hrefInitializer || !nameInitializer) continue;

        const href = getStringValue(hrefInitializer, sourceFile);
        const title = getLocalizedText(nameInitializer, sourceFile);
        if (!href || !title) continue;
        meta.set(href, { category, title });
      }
    });
  }

  return meta;
};

const uniqueCode = (blocks: CodeBlock[]) => {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (seen.has(block.code)) return false;
    seen.add(block.code);
    return true;
  });
};

const bindingNames = (name: ts.BindingName, names: Set<string>) => {
  if (ts.isIdentifier(name)) names.add(name.text);
  else
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) bindingNames(element.name, names);
    }
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//? Inside a helper such as `aliasNote(alias)`, a `<alias>` placeholder stands for whatever each call passes.
const matcherOf = (text: string, node: ts.Node): TextMatcher => {
  const params = new Set<string>();
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current) || ts.isFunctionDeclaration(current))
      for (const param of current.parameters) bindingNames(param.name, params);
  }
  const placeholders = [...params].filter((param) => text.includes(`<${param}`));
  if (!placeholders.length) return { text, pattern: null };
  const placeholder = new RegExp(`<(?:${placeholders.map(escapeRegExp).join("|")})(?:[.[][^<>]*)?>`, "g");
  const source = text
    .split(placeholder)
    .map((part) => escapeRegExp(part))
    .join(".+?");
  return { text, pattern: new RegExp(source) };
};

//? What the mirror must hold: every English text of the page, and each row as one line holding its name and its
//? description. Rows are read here on their own terms, so a row the generator drops or cannot read is counted.
const sourceTextsOf = (sourceFile: ts.SourceFile) => {
  const texts = new Map<string, SourceText>();
  const addText = (text: string | null | undefined, node: ts.Node) => {
    const flat = text ? flatten(text) : "";
    if (flat && !texts.has(flat))
      texts.set(flat, { label: flat, matchers: [matcherOf(flat, node)], row: false, readable: true });
  };
  const addRow = (node: ts.ObjectLiteralExpression) => {
    const entries = rowEntries(node, sourceFile);
    const nameValue = entries.get("name") ?? entries.get("key");
    const descValue = entries.get("desc") ?? entries.get("en");
    if (!nameValue || !descValue || entries.has("signature")) return;
    const name = cellText(nameValue, sourceFile);
    if (!name) return;
    const desc = cellText(descValue, sourceFile);
    const label = `${flatten(name)}: ${desc ? flatten(desc) : "(description not readable)"}`;
    if (texts.has(label)) return;
    const matchers = [name, desc ?? ""].map((text) => matcherOf(flatten(text), node));
    texts.set(label, { label, matchers, row: true, readable: !!desc });
  };
  walk(sourceFile, (node) => {
    if (isTransCall(node, sourceFile)) {
      addText(getLocalizedText(node, sourceFile)?.en, node);
      return false;
    }
    if (!ts.isObjectLiteralExpression(node)) return true;
    if (getProp(node, "en") && getProp(node, "ko")) addText(getLocalizedObject(node, sourceFile)?.en, node);
    addRow(node);
    return true;
  });
  return [...texts.values()];
};

const isInMirror = (source: SourceText, markdown: string) => {
  if (!source.readable) return false;
  const holds = (target: string) =>
    source.matchers.every(({ text, pattern }) => (pattern ? pattern.test(target) : target.includes(text)));
  return source.row ? markdown.split("\n").some((line) => holds(flatten(line))) : holds(flatten(markdown));
};

const extractPage = async (filePath: string, menuMeta: Map<string, MenuMeta>): Promise<LlmsPage> => {
  const href = hrefFromFile(filePath);
  const sourceText = await readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: Line[] = [];
  const headings: Heading[] = [];
  const codeBlocks: CodeBlock[] = [];
  const emptySections: Heading[] = [];
  const consumed = new Set<ts.Node>();
  let section: (Heading & { textNum: number }) | null = null;
  let scope = "";
  let owner: ts.Node | null = null;

  const closeSection = () => {
    if (section && section.textNum === 0) emptySections.push({ id: section.id, title: section.title });
  };
  const pushText = (text: string, depth = 0) => {
    lines.push({ text, indent: "  ".repeat(depth), scope, owner });
    if (section && text.trim() !== section.title) section.textNum += 1;
  };
  const pushCode = (blocks: CodeBlock[]) => {
    codeBlocks.push(...blocks);
    if (section && blocks.length) section.textNum += 1;
  };
  const owned = (node: ts.Node, emit: () => void) => {
    const previous = owner;
    owner = node;
    emit();
    owner = previous;
  };

  const renderedArrays = new Set<ts.ArrayLiteralExpression>();
  walk(sourceFile, (node) => {
    const expression = renderedExpressionOf(node);
    const array = expression ? renderedArrayOf(expression, sourceFile) : null;
    if (array) renderedArrays.add(array);
  });

  const emitCommand = (entries: RowEntries) => {
    const name = nameOf(entries, sourceFile);
    const signatureValue = entries.get("signature");
    const signature = signatureValue ? getStringValue(signatureValue, sourceFile) : null;
    const previous = scope;
    scope = `command:${signature ?? name ?? ""}`;
    if (signature) pushText(`\`${signature}\``);
    for (const [key, value] of entries) {
      if (key === "name" || key === "signature") continue;
      if (key === "examples") {
        const code = getStringValue(value, sourceFile);
        if (code) pushCode([{ title: name ?? "Examples", language: "bash", code: code.trim() }]);
        continue;
      }
      const elements = arrayElementsOf(value, sourceFile);
      if (elements) {
        emitElements(elements, 0);
        continue;
      }
      const text = cellText(value, sourceFile);
      if (text) pushText(text);
    }
    scope = previous;
  };

  const emitRow = (row: ts.ObjectLiteralExpression, depth: number) => {
    const entries = rowEntries(row, sourceFile);
    if (entries.has("signature")) return emitCommand(entries);
    if (isColumnDefinition(entries)) {
      const [label, caption] = ["label", "caption"].map((key) => {
        const value = entries.get(key);
        return value ? cellText(value, sourceFile) : null;
      });
      const text = [label, caption].filter(Boolean).join(" — ");
      if (text) pushText(depth ? `- ${text}` : text, depth);
      return;
    }
    const { line, codeBlocks: rowCode } = rowTextOf(entries, sourceFile);
    if (line) pushText(line, depth);
    pushCode(rowCode);
    for (const [key, value] of entries) {
      if (isSkippedKey(key)) continue;
      const elements = arrayElementsOf(value, sourceFile);
      if (!elements || isStringList(elements)) continue;
      emitElements(elements, line ? depth + 1 : depth);
    }
  };

  const emitHelperRow = (element: ts.Node, depth: number) => {
    const helper = helperCallOf(unwrap(element), sourceFile);
    if (!helper || !ts.isObjectLiteralExpression(helper.body)) return false;
    const row = helper.body;
    consumed.add(row);
    withFrame(helper, () => emitRow(row, depth));
    return true;
  };

  const emitElements = (elements: readonly ts.Expression[], depth: number) => {
    for (const element of elements) {
      if (ts.isSpreadElement(element)) {
        const spread = arrayElementsOf(element.expression, sourceFile);
        if (spread) emitElements(spread, depth);
        continue;
      }
      if (emitHelperRow(element, depth)) continue;
      const row = resolveObject(element, sourceFile);
      if (row) {
        consumed.add(row);
        emitRow(row, depth);
        continue;
      }
      const text = getLocalizedText(element, sourceFile)?.en;
      if (!text) continue;
      consumed.add(unwrap(element));
      pushText(depth ? `- ${text}` : text, depth);
    }
  };

  const visit = (node: ts.Node): boolean => {
    if (ts.isArrayLiteralExpression(node)) {
      if (renderedArrays.has(node)) return false;
      for (const element of node.elements) {
        if (emitHelperRow(element, 0)) continue;
        const row = ts.isIdentifier(unwrap(element)) ? resolveObject(element, sourceFile) : null;
        if (row && isRowLike(rowEntries(row, sourceFile), sourceFile)) {
          consumed.add(row);
          emitRow(row, 0);
          continue;
        }
        owned(unwrap(element), () => walk(element, visit));
      }
      return false;
    }

    const rendered = renderedExpressionOf(node);
    const array = rendered ? renderedArrayOf(rendered, sourceFile) : null;
    if (array) {
      emitElements(array.elements, 0);
      return true;
    }

    if (ts.isObjectLiteralExpression(node)) {
      const entries = rowEntries(node, sourceFile);
      if (entries.has("signature")) {
        emitCommand(entries);
        return false;
      }
      if (isRowLike(entries, sourceFile)) {
        owned(node, () => emitRow(node, 0));
        return false;
      }
    }

    if (isTransCall(node, sourceFile)) {
      const text = getLocalizedText(node, sourceFile);
      if (text?.en) pushText(text.en);
      return false;
    }

    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return true;

    const tagName = node.tagName.getText(sourceFile);
    if (tagName === "Scroll.Slide") {
      const id = getJsxAttributeString(node, "id", sourceFile);
      const title = getJsxAttributeText(node, "title", sourceFile)?.en;
      if (id && title) {
        closeSection();
        headings.push({ id, title });
        section = { id, title, textNum: 0 };
        lines.push({ text: title, indent: "", scope, owner });
      }
      return true;
    }

    if (tagName === "Code.Snippet") {
      const code = getJsxAttributeString(node, "code", sourceFile);
      if (!code) return true;
      pushCode([
        {
          title: getJsxAttributeString(node, "title", sourceFile) ?? "Code",
          language: getJsxAttributeString(node, "language", sourceFile) ?? "ts",
          code: code.trim(),
        },
      ]);
    }
    return true;
  };

  walk(sourceFile, visit);
  closeSection();

  const meta = menuMeta.get(href);
  const title = meta?.title.en ?? headings[0]?.title ?? titleFromHref(href);
  //? A row written where the page lists it drops the copy written where it was declared.
  const kept = lines.filter((line) => !line.owner || !consumed.has(line.owner));

  return {
    href,
    mirrorHref: mirrorHrefFromHref(href),
    section: sectionFromHref(href),
    category: meta?.category ?? sectionFromHref(href),
    title,
    priority: priorityFromHref(href),
    headings,
    body: unique([{ text: title, indent: "", scope: "" }, ...kept]),
    codeBlocks: uniqueCode(codeBlocks),
    emptySections,
    sourceTexts: sourceTextsOf(sourceFile),
  };
};

const renderPageMarkdown = (page: LlmsPage) => {
  const lines = [
    `# ${page.title}`,
    "",
    `- Source: ${page.href}`,
    `- Mirror: ${page.mirrorHref}`,
    `- Section: ${page.section}`,
    `- Category: ${page.category}`,
    `- Priority: ${page.priority}`,
    "",
    "## Headings",
    "",
    ...(page.headings.length
      ? page.headings.map((heading) => `- ${heading.title} (#${heading.id})`)
      : ["- No explicit slide headings were extracted."]),
    "",
    "## Content",
    "",
    ...page.body.map((paragraph) => `${paragraph}\n`),
    "## Code Examples",
    "",
    ...(page.codeBlocks.length
      ? page.codeBlocks.flatMap((block) => [`### ${block.title}`, "", `\`\`\`${block.language}`, block.code, "```", ""])
      : ["No code snippets were extracted from this page.", ""]),
    "## Agent Notes",
    "",
    ...agentNotesForPage(page).map((note) => `- ${note}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
};

const renderLlmsTxt = (pages: LlmsPage[]) => {
  const byHref = new Map(pages.map((page) => [page.href, page]));
  const representativePages = representativeHrefs
    .map((href) => byHref.get(href))
    .filter((page): page is LlmsPage => !!page);
  const p0Pages = pages.filter((page) => page.priority === "P0");

  return [
    "# Akan.js",
    "",
    "Akan.js is a Bun-first full-stack TypeScript framework where business definitions drive web, app, server, data, and deployment surfaces.",
    "",
    "## Start Here",
    "",
    "- Full LLM context: /llms-full.txt",
    "- Quick start: /llms/pages/docs/intro/quickstart.md",
    "- Fundamentals: /llms/pages/docs/intro/fundamentals.md",
    "- Agent workspace rules: /llms/pages/docs/core/folder-rule.md",
    "",
    "## Recommended Reading Order",
    "",
    ...representativePages.map((page) => `- ${page.title}: ${page.mirrorHref}`),
    "",
    "## P0 Documentation Mirrors",
    "",
    ...p0Pages.map((page) => `- ${page.title}: ${page.mirrorHref}`),
    "",
    "## Agent Notes",
    "",
    "- Prefer Markdown mirrors for context loading and source docs for visual examples.",
    "- Respect Akan generated-file boundaries before editing application code.",
    "- Start feature work from domain intent: constants, signals, services, stores, then UI.",
    "- Verify changes with the relevant `akan lint`, `akan test`, or `akan build` command.",
    "",
  ].join("\n");
};

const renderFullPageSummary = (page: LlmsPage) => {
  const body = page.body.slice(0, page.priority === "P0" ? 30 : 12);
  return [
    `## ${page.title}`,
    "",
    `Source: ${page.href}`,
    `Mirror: ${page.mirrorHref}`,
    `Priority: ${page.priority}`,
    "",
    ...(page.headings.length ? ["Headings:", ...page.headings.map((heading) => `- ${heading.title}`), ""] : []),
    ...body.map((paragraph) => `${paragraph}\n`),
  ].join("\n");
};

const renderLlmsFull = (pages: LlmsPage[]) => {
  const includedPages = pages.filter((page) => page.priority !== "P2" || page.href.startsWith("/cheatsheet/"));
  const p2Pages = pages.filter((page) => page.priority === "P2");

  return [
    "# Akan.js LLM Context",
    "",
    "Akan.js is a convention-driven, Bun-first full-stack TypeScript framework. The important authoring unit is business intent: pages, domain modules, signals, services, stores, and UI live in predictable places so humans and coding agents can extend projects without re-deriving architecture.",
    "",
    "## How To Use This File",
    "",
    "- Use this file for broad context.",
    "- Use `/llms/pages/**/*.md` mirrors for page-specific context.",
    "- Use source docs under `/docs`, `/references`, `/conventions`, and `/cheatsheet` for the rendered website.",
    "- Generated files and generated indexes should not be hand-edited unless the docs say so.",
    "",
    "## Core Workflow For Agents",
    "",
    "1. Read the relevant convention page before adding files.",
    "2. Keep business logic near the domain module that owns it.",
    "3. Prefer Akan CLI generation and scan workflows over hand-writing generated surfaces.",
    "4. Respect server/client import boundaries.",
    "5. Run the smallest relevant lint, test, or build command after changes.",
    "",
    ...includedPages.map(renderFullPageSummary),
    "## Additional P2 Mirrors",
    "",
    ...p2Pages.map((page) => `- ${page.title}: ${page.mirrorHref}`),
    "",
  ].join("\n");
};

const prioritySortValue = (priority: Priority) => ({ P0: 0, P1: 1, P2: 2 })[priority];

const run = async () => {
  const [files, menuMeta] = await Promise.all([collectFiles(docsRoot), extractMenuMeta()]);
  const pages = (await Promise.all(files.map((file) => extractPage(file, menuMeta)))).sort((a, b) => {
    const priorityDiff = prioritySortValue(a.priority) - prioritySortValue(b.priority);
    return priorityDiff || a.href.localeCompare(b.href);
  });

  await rm(pagesOutputRoot, { recursive: true, force: true });
  await mkdir(pagesOutputRoot, { recursive: true });

  const missing = await Promise.all(
    pages.map(async (page) => {
      const outputPath = outputPathFromHref(page.href);
      const markdown = renderPageMarkdown(page);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, markdown);
      return page.sourceTexts
        .filter((source) => !isInMirror(source, markdown))
        .map(({ label }) => `${page.href}: ${label}`);
    }),
  );

  //? The generator reads literals, `l.trans` values (JSX included), local rows and one-expression helpers; text a
  //? page renders any other way (a computed value, a shared component's own copy) is counted here, not dropped.
  const lost = missing.flat();
  if (lost.length)
    console.warn(
      `${lost.length} source texts are missing from their mirror:\n${lost.map((line) => `  ${line.slice(0, 160)}`).join("\n")}`,
    );
  const empty = pages.flatMap((page) =>
    page.emptySections.map((heading) => `${page.href}#${heading.id} (${heading.title})`),
  );
  if (empty.length)
    console.warn(
      `${empty.length} sections yield no text beyond their heading:\n${empty.map((line) => `  ${line}`).join("\n")}`,
    );

  await writeFile(llmsTxtPath, renderLlmsTxt(pages));
  await writeFile(llmsFullPath, renderLlmsFull(pages));

  console.info(
    `Generated ${pages.length} LLM docs pages, ${path.relative(appRoot, llmsTxtPath)}, and ${path.relative(
      appRoot,
      llmsFullPath,
    )}`,
  );
};

void run();
