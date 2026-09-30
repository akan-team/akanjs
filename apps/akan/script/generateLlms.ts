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

const unique = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
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

const localConst = (name: string, sourceFile?: ts.SourceFile) => {
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
  if (ts.isJsxExpression(node)) return node.expression ? (getStringValue(node.expression, sourceFile) ?? "") : "";
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

const getStringValue = (input: ts.Node, sourceFile?: ts.SourceFile): string | null => {
  const node = unwrap(input);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    //? A placeholder no local constant resolves (a function parameter such as `alias`) reads as `<alias>`.
    return node.templateSpans.reduce((text, span) => {
      const value = getStringValue(span.expression, sourceFile) ?? `<${span.expression.getText(sourceFile)}>`;
      return `${text}${value}${span.literal.text}`;
    }, node.head.text);
  }
  if (isJsxNode(node)) return jsxToText(node, sourceFile).replace(/\s+/g, " ").trim() || null;
  if (ts.isIdentifier(node)) {
    const value = localConst(node.text, sourceFile);
    if (!value) return null;
    const target = unwrap(value);
    return ts.isStringLiteral(target) || ts.isNoSubstitutionTemplateLiteral(target) ? target.text : null;
  }
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

//? The rows a table or a list renders: `rows={x}`, `items={x.map(…)}` or `{x.map(…)}` over a local array of objects.
const renderedArrayOf = (expression: ts.Expression, sourceFile: ts.SourceFile) => {
  let target = unwrap(expression);
  if (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression)) {
    const method = target.expression.name.text;
    if (method !== "map" && method !== "flatMap") return null;
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

const skippedRowKeys = new Set(["key", "ko", "code", "icon", "image", "href", "className"]);

const rowLine = (row: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile) => {
  const parts = row.properties.flatMap((prop) => {
    if (!ts.isPropertyAssignment(prop)) return [];
    const name = propName(prop);
    if (!name || skippedRowKeys.has(name)) return [];
    const text = getLocalizedText(prop.initializer, sourceFile)?.en;
    return text ? [text] : [];
  });
  return parts.length ? `- ${parts.join(" — ")}` : null;
};

const referenceRowLine = (row: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile) => {
  const nameProp = getProp(row, "name");
  const descProp = getProp(row, "desc");
  if (!nameProp || !descProp) return null;
  const name = getLocalizedText(nameProp.initializer, sourceFile)?.en;
  const desc = getLocalizedText(descProp.initializer, sourceFile)?.en;
  if (!name || !desc) return null;
  const meta = ["type", "defaultValue", "enumOrFlag"].flatMap((key) => {
    const value = getProp(row, key);
    const text = value ? getStringValue(value.initializer, sourceFile) : null;
    if (!text || text === "-") return [];
    return [key === "defaultValue" ? `default ${text}` : text];
  });
  return `- ${name}${meta.length ? ` (${meta.join(", ")})` : ""}: ${desc}`;
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

const extractPage = async (filePath: string, menuMeta: Map<string, MenuMeta>): Promise<LlmsPage> => {
  const href = hrefFromFile(filePath);
  const sourceText = await readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const texts: string[] = [];
  const headings: Heading[] = [];
  const codeBlocks: CodeBlock[] = [];
  const emptySections: Heading[] = [];
  let section: (Heading & { textNum: number }) | null = null;

  const closeSection = () => {
    if (section && section.textNum === 0) emptySections.push({ id: section.id, title: section.title });
  };
  const pushText = (text: string) => {
    texts.push(text);
    if (section && text.trim() !== section.title) section.textNum += 1;
  };

  const renderedArrays = new Set<ts.ArrayLiteralExpression>();
  walk(sourceFile, (node) => {
    const expression =
      ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
          ? node.expression
          : undefined;
    const array = expression ? renderedArrayOf(expression, sourceFile) : null;
    if (array) renderedArrays.add(array);
  });

  const visit = (node: ts.Node): boolean => {
    if (ts.isArrayLiteralExpression(node) && renderedArrays.has(node)) return false;

    const rendered =
      ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
          ? node.expression
          : undefined;
    const array = rendered ? renderedArrayOf(rendered, sourceFile) : null;
    if (array) {
      for (const element of array.elements) {
        const row = unwrap(element);
        if (!ts.isObjectLiteralExpression(row)) {
          const text = getLocalizedText(row, sourceFile)?.en;
          if (text) pushText(text);
          continue;
        }
        if (getProp(row, "signature")) {
          walk(row, visit);
          continue;
        }
        const line = referenceRowLine(row, sourceFile) ?? rowLine(row, sourceFile);
        if (line) pushText(line);
      }
      return true;
    }

    if (ts.isObjectLiteralExpression(node) && !getProp(node, "signature")) {
      const line = referenceRowLine(node, sourceFile);
      if (line) {
        pushText(line);
        return false;
      }
    }

    if (isTransCall(node, sourceFile)) {
      const text = getLocalizedText(node, sourceFile);
      if (text?.en) pushText(text.en);
      return false;
    }

    if (ts.isPropertyAssignment(node) && propName(node) === "signature") {
      const signature = getStringValue(node.initializer, sourceFile);
      if (signature) pushText(`\`${signature}\``);
    }

    if (ts.isPropertyAssignment(node) && propName(node) === "examples" && ts.isObjectLiteralExpression(node.parent)) {
      const code = getStringValue(node.initializer, sourceFile);
      const nameProp = getProp(node.parent, "name");
      const name = nameProp ? getStringValue(nameProp.initializer, sourceFile) : null;
      if (code) codeBlocks.push({ title: name ?? "Examples", language: "bash", code: code.trim() });
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
        texts.push(title);
      }
      return true;
    }

    if (tagName === "Code.Snippet") {
      const code = getJsxAttributeString(node, "code", sourceFile);
      if (!code) return true;
      codeBlocks.push({
        title: getJsxAttributeString(node, "title", sourceFile) ?? "Code",
        language: getJsxAttributeString(node, "language", sourceFile) ?? "ts",
        code: code.trim(),
      });
      if (section) section.textNum += 1;
    }
    return true;
  };

  walk(sourceFile, visit);
  closeSection();

  const meta = menuMeta.get(href);
  const title = meta?.title.en ?? headings[0]?.title ?? titleFromHref(href);

  return {
    href,
    mirrorHref: mirrorHrefFromHref(href),
    section: sectionFromHref(href),
    category: meta?.category ?? sectionFromHref(href),
    title,
    priority: priorityFromHref(href),
    headings,
    body: unique([title, ...texts]),
    codeBlocks,
    emptySections,
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

  await Promise.all(
    pages.map(async (page) => {
      const outputPath = outputPathFromHref(page.href);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, renderPageMarkdown(page));
    }),
  );

  //? The generator reads string literals, `l.trans` values (JSX included) and local row arrays; a section that
  //? renders its text any other way (a shared component, a computed value) reaches the mirror as its heading only.
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
