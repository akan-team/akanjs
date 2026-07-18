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
    const propName = prop.name;
    return ts.isIdentifier(propName) ? propName.text === name : ts.isStringLiteral(propName) && propName.text === name;
  });
};

const getStringValue = (node: ts.Node, sourceFile?: ts.SourceFile): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    const raw = node.getText(sourceFile);
    return raw.startsWith("`") && raw.endsWith("`") ? raw.slice(1, -1) : raw;
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

const getLocalizedText = (node: ts.Node, sourceFile?: ts.SourceFile): LocalizedText | null => {
  const literalText = getStringValue(node, sourceFile);
  if (literalText) return { en: literalText, ko: literalText };

  if (ts.isCallExpression(node)) {
    const expression = node.expression.getText(sourceFile);
    if (expression.endsWith(".trans") && node.arguments[0]) return getLocalizedObject(node.arguments[0], sourceFile);
  }

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

const walk = (node: ts.Node, visitor: (node: ts.Node) => void) => {
  visitor(node);
  node.forEachChild((child) => walk(child, visitor));
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

  walk(sourceFile, (node) => {
    if (ts.isCallExpression(node)) {
      const text = getLocalizedText(node, sourceFile);
      if (text?.en) texts.push(text.en);
    }

    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;

    const tagName = node.tagName.getText(sourceFile);
    if (tagName === "Scroll.Slide") {
      const id = getJsxAttributeString(node, "id", sourceFile);
      const title = getJsxAttributeText(node, "title", sourceFile)?.en;
      if (id && title) {
        headings.push({ id, title });
        texts.push(title);
      }
      return;
    }

    if (tagName === "Code.Snippet") {
      const code = getJsxAttributeString(node, "code", sourceFile);
      if (!code) return;
      codeBlocks.push({
        title: getJsxAttributeString(node, "title", sourceFile) ?? "Code",
        language: getJsxAttributeString(node, "language", sourceFile) ?? "ts",
        code: code.trim(),
      });
    }
  });

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
    body: unique([title, ...texts]).slice(0, 160),
    codeBlocks,
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
