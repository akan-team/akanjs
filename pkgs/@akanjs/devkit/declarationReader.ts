import path from "node:path";
import ts from "typescript";

export interface MemberFilter {
  only?: string[];
  omit?: string[];
  prefix?: string;
}

const nodeFlags =
  ts.NodeBuilderFlags.NoTruncation |
  ts.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope |
  ts.NodeBuilderFlags.OmitParameterModifiers;
const typeFlags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

export class DeclarationReader {
  static readonly #printer = ts.createPrinter({ removeComments: true, omitTrailingSemicolon: true });
  readonly #dir: string;
  readonly #program: ts.Program;
  readonly #checker: ts.TypeChecker;
  readonly #entries: Map<string, string>;
  readonly #scratch: ts.SourceFile;

  constructor(akanjsDir: string) {
    this.#dir = akanjsDir;
    const configPath = path.join(akanjsDir, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, akanjsDir, undefined, configPath);
    this.#entries = DeclarationReader.#entryFiles(akanjsDir);
    this.#program = ts.createProgram({
      rootNames: [...new Set(this.#entries.values())],
      options: { ...parsed.options, noEmit: true },
    });
    this.#checker = this.#program.getTypeChecker();
    this.#scratch = ts.createSourceFile("reference.ts", "", ts.ScriptTarget.Latest);
  }

  static #entryFiles(akanjsDir: string) {
    const manifest = JSON.parse(ts.sys.readFile(path.join(akanjsDir, "package.json")) ?? "{}") as {
      exports: Record<string, unknown>;
    };
    const entries = new Map<string, string>();
    for (const [key, value] of Object.entries(manifest.exports)) {
      const target = typeof value === "string" ? value : (value as { types?: string; import?: string }).types;
      if (key.includes("*") || typeof target !== "string" || !/\.tsx?$/.test(target)) continue;
      entries.set(key === "." ? "akanjs" : `akanjs/${key.slice(2)}`, path.join(akanjsDir, target));
    }
    return entries;
  }

  exported(from: string, name: string): ts.Symbol {
    const file = this.#entries.get(from);
    const source = file ? this.#program.getSourceFile(file) : undefined;
    const module = source ? this.#checker.getSymbolAtLocation(source) : undefined;
    const symbol = module ? this.#checker.getExportsOfModule(module).find((each) => each.name === name) : undefined;
    if (!symbol) throw new Error(`${name} is not exported from ${from}: update the API reference manifest`);
    return symbol.flags & ts.SymbolFlags.Alias ? this.#checker.getAliasedSymbol(symbol) : symbol;
  }

  declared(file: string, name: string): ts.Symbol {
    const source = this.#program.getSourceFile(path.join(this.#dir, file));
    const statement = source?.statements.find(
      (each) =>
        (ts.isClassDeclaration(each) || ts.isInterfaceDeclaration(each) || ts.isTypeAliasDeclaration(each)) &&
        each.name?.text === name,
    ) as ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined;
    const symbol = statement?.name ? this.#checker.getSymbolAtLocation(statement.name) : undefined;
    if (!symbol) throw new Error(`${name} is not declared in ${file}: update the API reference manifest`);
    return symbol;
  }

  declaredType(symbol: ts.Symbol): ts.Type {
    return this.#checker.getDeclaredTypeOfSymbol(symbol);
  }

  instanceType(symbol: ts.Symbol): ts.Type {
    if (symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))
      return this.declaredType(symbol);
    const type = this.#checker.getTypeOfSymbol(symbol);
    const [signature] = type.getCallSignatures();
    return signature ? signature.getReturnType() : type;
  }

  declarationText(symbol: ts.Symbol): string {
    const [declaration] = symbol.declarations ?? [];
    if (!declaration) throw new Error(`${symbol.name} has no declaration`);
    return DeclarationReader.#print(declaration, declaration.getSourceFile()).replace(/^export /, "");
  }

  signatures(symbol: ts.Symbol, name: string): string[] {
    const type = this.#checker.getTypeOfSymbol(symbol);
    const signatures = type.getCallSignatures();
    if (signatures.length === 0) throw new Error(`${name} is not callable`);
    return signatures.map((signature) => `${name}${this.#checker.signatureToString(signature, undefined, typeFlags)}`);
  }

  props(type: ts.Type, omit: string[] = []): string[] {
    const lines: string[] = [];
    const properties = this.#checker.getPropertiesOfType(type);
    DeclarationReader.#assertNamed(properties, omit);
    for (const property of properties) {
      if (omit.includes(property.name) || DeclarationReader.#isInternalName(property.name)) continue;
      const [declaration] = property.declarations ?? [];
      if (declaration && !this.#isOwn(declaration)) continue;
      const optional = property.flags & ts.SymbolFlags.Optional ? "?" : "";
      const propertyType = declaration
        ? this.#checker.getTypeOfSymbolAtLocation(property, declaration)
        : this.#checker.getTypeOfSymbol(property);
      const shown = this.#checker.typeToString(
        optional ? this.#checker.getNonNullableType(propertyType) : propertyType,
        undefined,
        typeFlags,
      );
      const doc = this.#firstSentence(property);
      if (doc) lines.push(`/** ${doc} */`);
      lines.push(`${property.name}${optional}: ${shown};`);
    }
    return lines;
  }

  members(type: ts.Type, { only, omit = [], prefix = "." }: MemberFilter): [string, string][] {
    const properties = this.#checker.getPropertiesOfType(type);
    DeclarationReader.#assertNamed(properties, [...(only ?? []), ...omit]);
    const found: [string, string][] = [];
    for (const property of properties) {
      const name = property.name;
      if ((only && !only.includes(name)) || omit.includes(name) || DeclarationReader.#isInternalName(name)) continue;
      const [declaration] = property.declarations ?? [];
      if (!declaration || DeclarationReader.#isHidden(declaration)) continue;
      const signatures = this.#checker.getTypeOfSymbolAtLocation(property, declaration).getCallSignatures();
      for (const signature of signatures)
        found.push([name, `${prefix}${name}${this.#withoutReturn(signature, declaration)}`]);
    }
    return found;
  }

  static #assertNamed(properties: ts.Symbol[], names: string[]) {
    for (const name of names)
      if (!properties.some((property) => property.name === name))
        throw new Error(`${name} is not a member any more: update the API reference manifest`);
  }

  static #isInternalName(name: string) {
    return name.startsWith("_") || name.startsWith("#");
  }

  #isOwn(declaration: ts.Declaration) {
    return !path.relative(this.#dir, declaration.getSourceFile().fileName).startsWith("..");
  }

  static #isHidden(declaration: ts.Declaration) {
    const flags = ts.getCombinedModifierFlags(declaration);
    return (
      (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Static)) !== 0 ||
      (ts.isPropertyDeclaration(declaration) && !declaration.type && !declaration.initializer) ||
      ts.isConstructorDeclaration(declaration)
    );
  }

  #withoutReturn(signature: ts.Signature, enclosing: ts.Declaration) {
    const node = this.#checker.signatureToSignatureDeclaration(
      signature,
      ts.SyntaxKind.MethodSignature,
      enclosing,
      nodeFlags,
    ) as ts.MethodSignature | undefined;
    if (!node) throw new Error(`${this.#checker.signatureToString(signature)} cannot be printed`);
    const typeParameters = node.typeParameters?.filter((each) => !each.name.text.startsWith("_"));
    const parameters = node.parameters.map((parameter) =>
      parameter.questionToken && parameter.type && ts.isUnionTypeNode(parameter.type)
        ? ts.factory.updateParameterDeclaration(
            parameter,
            parameter.modifiers,
            parameter.dotDotDotToken,
            parameter.name,
            parameter.questionToken,
            DeclarationReader.#withoutUndefined(parameter.type),
            parameter.initializer,
          )
        : parameter,
    );
    const stripped = ts.factory.createMethodSignature(
      undefined,
      "x",
      undefined,
      typeParameters?.length ? typeParameters : undefined,
      parameters,
      undefined,
    );
    return DeclarationReader.#print(stripped, this.#scratch)
      .replace(/^x/, "")
      .replace(/;$/, "")
      .replaceAll(" & Record<never, never>", "");
  }

  static #print(node: ts.Node, source: ts.SourceFile) {
    return DeclarationReader.#printer.printNode(ts.EmitHint.Unspecified, node, source).replace(/\s+/g, " ");
  }

  static #withoutUndefined(type: ts.UnionTypeNode): ts.TypeNode {
    const kept = type.types.filter((each) => each.kind !== ts.SyntaxKind.UndefinedKeyword);
    return kept.length === 1 ? kept[0] : ts.factory.createUnionTypeNode(kept);
  }

  #firstSentence(symbol: ts.Symbol) {
    const text = ts.displayPartsToString(symbol.getDocumentationComment(this.#checker)).replace(/\s+/g, " ").trim();
    if (!text) return "";
    const end = text.search(/\.(\s|$)/);
    return (end === -1 ? text : text.slice(0, end + 1)).replace(/\*\//g, "*\\/");
  }
}
