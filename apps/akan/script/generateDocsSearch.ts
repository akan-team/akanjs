import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

type Lang = "en" | "ko";
type LocalizedText = Record<Lang, string>;

interface DocsSearchHeading {
  id: string;
  title: LocalizedText;
}

interface DocsSearchItem {
  href: string;
  section: string;
  category: string;
  title: LocalizedText;
  headings: DocsSearchHeading[];
  body: LocalizedText;
}

interface MenuMeta {
  category: string;
  title: LocalizedText;
}

const appRoot = process.cwd();
const docsRoot = path.join(appRoot, "page", "(docs)");
const outputPath = path.join(appRoot, "public", "docs-search-index.json");

const mergeText = (...texts: Partial<LocalizedText>[]): LocalizedText => ({
  en: texts
    .map((text) => text.en)
    .filter(Boolean)
    .join(" ")
    .trim(),
  ko: texts
    .map((text) => text.ko)
    .filter(Boolean)
    .join(" ")
    .trim(),
});

const uniqText = (texts: Partial<LocalizedText>[]): LocalizedText => {
  const byLang = { en: new Set<string>(), ko: new Set<string>() };
  for (const text of texts) {
    if (text.en) byLang.en.add(text.en.trim());
    if (text.ko) byLang.ko.add(text.ko.trim());
  }
  return {
    en: [...byLang.en].filter(Boolean).join(" ").trim(),
    ko: [...byLang.ko].filter(Boolean).join(" ").trim(),
  };
};

const getProp = (object: ts.ObjectLiteralExpression, name: string) => {
  return object.properties.find((prop): prop is ts.PropertyAssignment => {
    if (!ts.isPropertyAssignment(prop)) return false;
    const propName = prop.name;
    return ts.isIdentifier(propName) ? propName.text === name : ts.isStringLiteral(propName) && propName.text === name;
  });
};

const getStringValue = (node: ts.Node): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
};

const getLocalizedObject = (node: ts.Node): LocalizedText | null => {
  if (!ts.isObjectLiteralExpression(node)) return null;
  const en = getProp(node, "en")?.initializer;
  const ko = getProp(node, "ko")?.initializer;
  const enText = en ? getStringValue(en) : null;
  const koText = ko ? getStringValue(ko) : null;
  if (!enText && !koText) return null;
  return {
    en: enText ?? koText ?? "",
    ko: koText ?? enText ?? "",
  };
};

const getLocalizedText = (node: ts.Node): LocalizedText | null => {
  const literalText = getStringValue(node);
  if (literalText) return { en: literalText, ko: literalText };

  if (ts.isCallExpression(node)) {
    const expression = node.expression.getText();
    if (expression.endsWith(".trans") && node.arguments[0]) return getLocalizedObject(node.arguments[0]);
  }

  if (ts.isObjectLiteralExpression(node)) return getLocalizedObject(node);
  if (ts.isJsxExpression(node) && node.expression) return getLocalizedText(node.expression);
  return null;
};

const getJsxAttribute = (node: ts.JsxOpeningLikeElement, name: string) => {
  return node.attributes.properties.find((attr): attr is ts.JsxAttribute => {
    return ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name;
  });
};

const getJsxAttributeText = (node: ts.JsxOpeningLikeElement, name: string): LocalizedText | null => {
  const attr = getJsxAttribute(node, name);
  if (!attr?.initializer) return null;
  return getLocalizedText(attr.initializer);
};

const getJsxAttributeString = (node: ts.JsxOpeningLikeElement, name: string): string | null => {
  const attr = getJsxAttribute(node, name);
  if (!attr?.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    return getStringValue(attr.initializer.expression);
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
  return files.flat();
};

const hrefFromFile = (filePath: string) => {
  const relative = path
    .relative(docsRoot, filePath)
    .replace(/\\/g, "/")
    .replace(/\.tsx$/, "");
  return `/${relative.replace(/\/index$/, "")}`;
};

const sectionFromHref = (href: string) => href.split("/").filter(Boolean)[0] ?? "docs";

const titleFromHref = (href: string): LocalizedText => {
  const segment = href.split("/").filter(Boolean).at(-1) ?? href;
  const title = segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return { en: title, ko: title };
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
      const category = (categoryText ? getLocalizedText(categoryText) : null)?.en ?? "";

      for (const element of subMenus.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        const hrefInitializer = getProp(element, "href")?.initializer;
        const nameInitializer = getProp(element, "name")?.initializer;
        if (!hrefInitializer || !nameInitializer) continue;

        const href = getStringValue(hrefInitializer);
        const title = getLocalizedText(nameInitializer);
        if (!href || !title) continue;
        meta.set(href, { category, title });
      }
    });
  }

  return meta;
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

const extractDocItem = async (filePath: string, menuMeta: Map<string, MenuMeta>): Promise<DocsSearchItem> => {
  const href = hrefFromFile(filePath);
  const sourceText = await readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const texts: LocalizedText[] = [];
  const headings: DocsSearchHeading[] = [];

  walk(sourceFile, (node) => {
    if (ts.isCallExpression(node)) {
      const text = getLocalizedText(node);
      if (text) texts.push(text);
    }

    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    if (node.tagName.getText(sourceFile) !== "Scroll.Slide") return;

    const id = getJsxAttributeString(node, "id");
    const title = getJsxAttributeText(node, "title");
    if (!id || !title) return;
    headings.push({ id, title });
    texts.push(title);
  });

  const meta = menuMeta.get(href);
  const fallbackTitle = headings[0]?.title ?? titleFromHref(href);
  const body = uniqText(texts);

  return {
    href,
    section: sectionFromHref(href),
    category: meta?.category ?? sectionFromHref(href),
    title: meta?.title ?? fallbackTitle,
    headings,
    body: mergeText(meta?.title ?? fallbackTitle, body),
  };
};

const run = async () => {
  const [files, menuMeta] = await Promise.all([collectFiles(docsRoot), extractMenuMeta()]);
  const items = await Promise.all(files.map((file) => extractDocItem(file, menuMeta)));
  const index = {
    generatedAt: new Date().toISOString(),
    items: items.sort((a, b) => a.href.localeCompare(b.href)),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);
  console.info(`Generated ${items.length} docs search items at ${path.relative(appRoot, outputPath)}`);
};

void run();
