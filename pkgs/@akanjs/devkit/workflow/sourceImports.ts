import ts from "typescript";
import { sourceFileFor } from "./sourceAst";
import { lineEndAt, lineStartAt, spliceText } from "./sourceText";

//? Biome's organizeImports order: case-insensitive, an uppercase name before its lowercase twin.
const importOrder = (a: string, b: string) => {
  const [lowerA, lowerB] = [a.toLowerCase(), b.toLowerCase()];
  if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

export const ensureNamedImport = (content: string, moduleSpecifier: string, name: string) => {
  const source = sourceFileFor("source.ts", content);
  const namedImport = findNamedImport(source, moduleSpecifier, { valueOnly: true });
  if (!namedImport) return ensureImportDeclaration(content, moduleSpecifier, `{ ${name} }`);
  if (namedImport.names.includes(name)) return content;
  const nextElements = [...namedImport.elements, { name, text: name }].sort((a, b) => importOrder(a.name, b.name));
  return spliceText(
    content,
    namedImport.namedBindingsStart,
    namedImport.namedBindingsEnd,
    `{ ${nextElements.map((element) => element.text).join(", ")} }`,
  );
};

export const ensureImportDeclaration = (content: string, moduleSpecifier: string, clause: string) => {
  const line = `import ${clause} from "${moduleSpecifier}";`;
  if (content.includes(line)) return content;
  const source = sourceFileFor("source.ts", content);
  const imports = source.statements
    .filter((statement): statement is ts.ImportDeclaration => ts.isImportDeclaration(statement))
    .flatMap((statement) =>
      ts.isStringLiteral(statement.moduleSpecifier)
        ? [{ specifier: statement.moduleSpecifier.text, start: statement.getStart(source), end: statement.getEnd() }]
        : [],
    );
  const isRelative = (specifier: string) => specifier.startsWith(".");
  const peers = imports.filter((entry) => isRelative(entry.specifier) === isRelative(moduleSpecifier));
  const before = peers.find((entry) => importOrder(entry.specifier, moduleSpecifier) > 0);
  if (before) {
    const insertAt = lineStartAt(content, before.start);
    return spliceText(content, insertAt, insertAt, `${line}\n`);
  }
  const after = peers.at(-1) ?? (isRelative(moduleSpecifier) ? imports.at(-1) : undefined);
  if (after) {
    const insertAt = lineEndAt(content, after.end);
    return spliceText(content, insertAt, insertAt, peers.length ? `${line}\n` : `\n${line}\n`);
  }
  const insertAt = imports[0] ? lineStartAt(content, imports[0].start) : 0;
  return spliceText(content, insertAt, insertAt, `${line}\n\n`);
};

export const ensureBaseImport = (content: string, name: string) => ensureNamedImport(content, "akanjs/base", name);

interface NamedImportLocator {
  names: string[];
  elements: { name: string; text: string }[];
  namedBindingsStart: number;
  namedBindingsEnd: number;
}

export const findNamedImport = (
  source: ts.SourceFile,
  moduleSpecifier: string,
  { valueOnly = false }: { valueOnly?: boolean } = {},
): NamedImportLocator | null => {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== moduleSpecifier) continue;
    if (valueOnly && statement.importClause?.isTypeOnly) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    return {
      names: namedBindings.elements.map((element) => element.name.text),
      elements: namedBindings.elements.map((element) => ({ name: element.name.text, text: element.getText(source) })),
      namedBindingsStart: namedBindings.getStart(source),
      namedBindingsEnd: namedBindings.getEnd(),
    };
  }
  return null;
};

export const ensureEnumImport = (content: string) => {
  if (content.includes("enumOf")) return content;
  const baseImport = /import \{ ([^{}]+) \} from "akanjs\/base";/.exec(content);
  if (baseImport) {
    const names = baseImport[1]?.split(",").map((name) => name.trim()) ?? [];
    return content.replace(baseImport[0], `import { ${[...names, "enumOf"].sort().join(", ")} } from "akanjs/base";`);
  }
  return `import { enumOf } from "akanjs/base";\n${content}`;
};

export const ensureConstantTypeImport = (content: string, constantPath: string, typeName: string) => {
  if (new RegExp(`import type \\{[^}]*\\b${typeName}\\b[^}]*\\} from "${constantPath}";`).test(content)) return content;
  const importPattern = new RegExp(`import type \\{ ([^}]+) \\} from "${constantPath}";`);
  const existingImport = content.match(importPattern);
  if (existingImport !== null) {
    const names = existingImport[1]?.split(",").map((name) => name.trim()) ?? [];
    return content.replace(
      existingImport[0],
      `import type { ${[...names, typeName].sort().join(", ")} } from "${constantPath}";`,
    );
  }
  return `import type { ${typeName} } from "${constantPath}";\n${content}`;
};
