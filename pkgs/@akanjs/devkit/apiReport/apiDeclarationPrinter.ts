import ts from "typescript";

export type ApiPrintMode = "export" | "declare";

export class ApiDeclarationPrinter {
  static readonly #reportedTags = ["deprecated", "internal"];
  static readonly #printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  static readonly #headPattern =
    "^((?:abstract |const )?(?:class|function|interface|type|enum|namespace|module|const|let|var) )";

  static isNamed(
    node: ts.Node,
  ): node is
    | ts.ClassDeclaration
    | ts.FunctionDeclaration
    | ts.InterfaceDeclaration
    | ts.TypeAliasDeclaration
    | ts.EnumDeclaration
    | ts.ModuleDeclaration {
    return (
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name))
    );
  }

  static prepared(statement: ts.Statement): ts.Statement {
    const kept = (ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : []).filter(
      (modifier) =>
        modifier.kind !== ts.SyntaxKind.ExportKeyword &&
        modifier.kind !== ts.SyntaxKind.DefaultKeyword &&
        modifier.kind !== ts.SyntaxKind.DeclareKeyword,
    );
    const stripped = ts.canHaveModifiers(statement)
      ? (ts.factory.replaceModifiers(statement as ts.HasModifiers, kept) as ts.Statement)
      : statement;
    return ts.isClassDeclaration(stripped) ? ApiDeclarationPrinter.#withoutPrivateMembers(stripped) : stripped;
  }

  static print(
    statement: ts.Statement,
    sourceFile: ts.SourceFile,
    { localName, name, mode }: { localName: string; name: string; mode: ApiPrintMode },
  ) {
    const tags = ApiDeclarationPrinter.#tagsOf(ts.getOriginalNode(statement));
    const node = ApiDeclarationPrinter.#withSortedUnions(ApiDeclarationPrinter.prepared(statement), sourceFile);
    const printed = ApiDeclarationPrinter.#printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
    const tagLine = tags.length ? `/** ${tags.map((tag) => `@${tag}`).join(" ")} */\n` : "";
    if (mode === "export" && name === "default") return `${tagLine}export default ${printed}`;
    const renamed =
      localName === name
        ? printed
        : printed.replace(
            new RegExp(`${ApiDeclarationPrinter.#headPattern}${ApiDeclarationPrinter.#escape(localName)}(?![\\w$])`),
            `$1${name}`,
          );
    const typeOnly = ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement);
    const keyword = mode === "export" ? (typeOnly ? "export " : "export declare ") : typeOnly ? "" : "declare ";
    return `${tagLine}${keyword}${renamed}`;
  }

  static printType(node: ts.TypeNode, sourceFile: ts.SourceFile) {
    return ApiDeclarationPrinter.#printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
  }

  //? A union's members print in the order the checker first met them, which moves when unrelated files change.
  static #withSortedUnions(statement: ts.Statement, sourceFile: ts.SourceFile) {
    const result = ts.transform(statement, [
      (context) => (root) => {
        const visit = (node: ts.Node): ts.Node => {
          const visited = ts.visitEachChild(node, visit, context);
          if (!ts.isUnionTypeNode(visited)) return visited;
          const sorted = visited.types
            .map((type) => ({ type, key: ApiDeclarationPrinter.printType(type, sourceFile) }))
            .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
            .map(({ type }) => type);
          return context.factory.updateUnionTypeNode(visited, context.factory.createNodeArray(sorted));
        };
        return ts.visitNode(root, visit) as ts.Statement;
      },
    ]);
    const [transformed = statement] = result.transformed;
    result.dispose();
    return transformed;
  }

  static #withoutPrivateMembers(declaration: ts.ClassDeclaration) {
    const members = declaration.members.filter(
      (member) =>
        ts.isConstructorDeclaration(member) ||
        !(
          (member.name && ts.isPrivateIdentifier(member.name)) ||
          (ts.canHaveModifiers(member) &&
            ts.getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword))
        ),
    );
    if (members.length === declaration.members.length) return declaration;
    return ts.factory.updateClassDeclaration(
      declaration,
      declaration.modifiers,
      declaration.name,
      declaration.typeParameters,
      declaration.heritageClauses,
      members,
    );
  }

  static #tagsOf(node: ts.Node) {
    const target = ts.isVariableStatement(node) ? (node.declarationList.declarations[0] ?? node) : node;
    const names = ts.getJSDocTags(target).map((tag) => tag.tagName.text);
    return ApiDeclarationPrinter.#reportedTags.filter((tag) => names.includes(tag));
  }

  static #escape(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
