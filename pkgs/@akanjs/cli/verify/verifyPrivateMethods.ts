import { existsSync } from "node:fs";
import path from "node:path";
import type ts from "typescript";

type TypeScript = typeof ts;

interface Edit {
  start: number;
  end: number;
  text: string;
}

export class VerifyPrivateMethods {
  static readonly #moduleFile = /^(?:apps|libs)\/.+\.(?:constant|document|service|store)\.ts$/;
  static readonly #ignoredDirs = new Set(["node_modules", "dist", ".akan", "dump", "local"]);
  static #typescriptLoad: Promise<TypeScript> | undefined;

  static #loadTypescript(): Promise<TypeScript> {
    VerifyPrivateMethods.#typescriptLoad ??= import("typescript").then((mod) => (mod.default ?? mod) as TypeScript);
    return VerifyPrivateMethods.#typescriptLoad;
  }

  static async fix(root: string, dir: string, files: string[]): Promise<Map<string, string>> {
    const candidates = (files.length ? files : await VerifyPrivateMethods.#moduleFilesIn(root, dir)).filter(
      (file) =>
        VerifyPrivateMethods.#moduleFile.test(file) &&
        !VerifyPrivateMethods.#isIgnored(file) &&
        existsSync(path.join(root, file)),
    );
    const rewritten = new Map<string, string>();
    for (const file of candidates) {
      const absolute = path.join(root, file);
      const text = await Bun.file(absolute).text();
      if (!text.includes("#")) continue;
      const typescript = await VerifyPrivateMethods.#loadTypescript();
      if (!VerifyPrivateMethods.rewrite(typescript, file, text).renamed.length) continue;
      const beside = await VerifyPrivateMethods.#namesBeside(typescript, root, file);
      const result = VerifyPrivateMethods.rewrite(typescript, file, text, beside);
      if (!result.renamed.length) continue;
      await Bun.write(absolute, result.text);
      rewritten.set(file, result.text);
    }
    return rewritten;
  }

  static async #moduleFilesIn(root: string, dir: string): Promise<string[]> {
    if (!existsSync(path.join(root, dir))) return [];
    const files: string[] = [];
    for await (const file of new Bun.Glob("**/*.{constant,document,service,store}.ts").scan({
      cwd: path.join(root, dir),
    }))
      files.push(path.posix.join(dir, file.replaceAll("\\", "/")));
    return files;
  }

  static #isIgnored(file: string) {
    return file.split("/").some((segment) => VerifyPrivateMethods.#ignoredDirs.has(segment));
  }

  //? Every store's actions land on one merged object, and a lib's module file is mixed into the app's of the same
  //? name, so a name another of those classes declares would silently replace one or the other at runtime.
  static async #namesBeside(typescript: TypeScript, root: string, file: string): Promise<Set<string>> {
    const base = path.posix.basename(file);
    const pattern = base.endsWith(".store.ts") ? "{apps,libs}/**/*.store.ts" : `{apps,libs}/**/${base}`;
    const names = new Set<string>();
    for await (const found of new Bun.Glob(pattern).scan({ cwd: root })) {
      const other = found.replaceAll("\\", "/");
      if (other === file || VerifyPrivateMethods.#isIgnored(other)) continue;
      const text = await Bun.file(path.join(root, other)).text();
      const source = typescript.createSourceFile(other, text, typescript.ScriptTarget.Latest, false);
      const visit = (node: ts.Node) => {
        if (typescript.isClassLike(node))
          for (const { name } of node.members)
            if (name && (typescript.isIdentifier(name) || typescript.isPrivateIdentifier(name)))
              names.add(name.text.replace(/^#/, ""));
        typescript.forEachChild(node, visit);
      };
      visit(source);
    }
    return names;
  }

  //? `private name`, never `_name`: a service runs `_preCreate`-style names as lifecycle hooks.
  static rewrite(
    typescript: TypeScript,
    fileName: string,
    text: string,
    beside: ReadonlySet<string> = new Set(),
  ): { text: string; renamed: string[] } {
    const source = typescript.createSourceFile(
      fileName,
      text,
      typescript.ScriptTarget.Latest,
      true,
      typescript.ScriptKind.TS,
    );
    const edits: Edit[] = [];
    const renamed: string[] = [];
    const visit = (node: ts.Node) => {
      if (typescript.isClassLike(node))
        renamed.push(...VerifyPrivateMethods.#renameIn(typescript, source, node, edits, beside));
      typescript.forEachChild(node, visit);
    };
    visit(source);
    if (!edits.length) return { text, renamed };
    const ordered = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
    let rewritten = text;
    for (const edit of ordered) rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end);
    return { text: rewritten, renamed };
  }

  static #renameIn(
    typescript: TypeScript,
    source: ts.SourceFile,
    cls: ts.ClassLikeDeclaration,
    edits: Edit[],
    beside: ReadonlySet<string>,
  ): string[] {
    const methods = new Map<string, ts.MethodDeclaration[]>();
    const taken = new Set<string>(beside);
    for (const member of cls.members) {
      if (typescript.isConstructorDeclaration(member))
        for (const parameter of member.parameters)
          if (typescript.getModifiers(parameter)?.length && typescript.isIdentifier(parameter.name))
            taken.add(parameter.name.text);
      const name = member.name;
      if (!name) continue;
      if (typescript.isPrivateIdentifier(name)) {
        if (typescript.isMethodDeclaration(member)) methods.set(name.text, [...(methods.get(name.text) ?? []), member]);
      } else if (typescript.isIdentifier(name) || typescript.isStringLiteral(name)) taken.add(name.text);
    }
    if (!methods.size) return [];
    const references = new Map<string, ts.PrivateIdentifier[]>();
    const brandChecked = new Set<string>();
    const collect = (node: ts.Node, shadowed: ReadonlySet<string>) => {
      let inScope = shadowed;
      if (node !== cls && typescript.isClassLike(node)) {
        const own = node.members.flatMap((member) =>
          member.name && typescript.isPrivateIdentifier(member.name) ? [member.name.text] : [],
        );
        if (own.length) inScope = new Set([...shadowed, ...own]);
      }
      if (typescript.isPrivateIdentifier(node) && !inScope.has(node.text)) {
        const parent = node.parent;
        if (
          typescript.isBinaryExpression(parent) &&
          parent.left === node &&
          parent.operatorToken.kind === typescript.SyntaxKind.InKeyword
        )
          brandChecked.add(node.text);
        else if (typescript.isPropertyAccessExpression(parent) && parent.name === node)
          references.set(node.text, [...(references.get(node.text) ?? []), node]);
      }
      typescript.forEachChild(node, (child) => collect(child, inScope));
    };
    for (const member of cls.members) collect(member, new Set());
    const renamed: string[] = [];
    for (const [privateName, declarations] of methods) {
      const bare = privateName.slice(1);
      if (taken.has(bare) || brandChecked.has(privateName)) continue;
      for (const declaration of declarations) {
        const firstModifier = typescript.getModifiers(declaration)?.[0];
        const insertAt = (firstModifier ?? declaration.asteriskToken ?? declaration.name).getStart(source);
        edits.push({ start: insertAt, end: insertAt, text: "private " });
        edits.push({ start: declaration.name.getStart(source), end: declaration.name.getEnd(), text: bare });
      }
      for (const reference of references.get(privateName) ?? [])
        edits.push({ start: reference.getStart(source), end: reference.getEnd(), text: bare });
      renamed.push(privateName);
    }
    return renamed;
  }
}
