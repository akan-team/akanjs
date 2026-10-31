import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";

interface EndpointShape {
  kind: "query" | "mutation";
  argCount: number;
}

export class SignalMutationIndex {
  //? As the client generates them: `update<Model>(id, data, option?)`, `add<Model>Files(files, parentId?, option?)`.
  static #generatedArgCounts = { create: 1, update: 2, remove: 1, merge: 2 } as const;
  static #argMethods = new Set(["param", "body", "search", "room", "msg"]);
  readonly #shapesByOwner = new Map<string, Map<string, EndpointShape>>();

  constructor(sourceFiles: SourceFileInfo[]) {
    for (const { file, sourceFile } of sourceFiles) {
      if (!/^(apps|libs)\/[^/]+\/lib\/.+\.signal\.ts$/.test(file)) continue;
      const owner = file.split("/").slice(0, 2).join("/");
      const shapes = this.#shapesByOwner.get(owner) ?? new Map<string, EndpointShape>();
      SignalMutationIndex.#collect(sourceFile, shapes);
      this.#shapesByOwner.set(owner, shapes);
    }
  }

  isMutation(consumerFile: string, name: string) {
    return this.#shapeOf(consumerFile, name)?.kind === "mutation";
  }

  /** Where a call to the mutation passes its `FetchPolicy`: the argument right after the ones it declares. */
  policyIndexOf(consumerFile: string, name: string): number | null {
    const shape = this.#shapeOf(consumerFile, name);
    return shape?.kind === "mutation" ? shape.argCount : null;
  }

  #shapeOf(consumerFile: string, name: string) {
    const [root, owner] = consumerFile.split("/");
    const own = this.#shapesByOwner.get(`${root}/${owner}`)?.get(name);
    if (own) return own;
    for (const [key, shapes] of this.#shapesByOwner) {
      const shape = shapes.get(name);
      if (key.startsWith("libs/") && shape?.kind === "mutation") return shape;
    }
    return undefined;
  }

  static #collect(sourceFile: ts.SourceFile, kinds: Map<string, EndpointShape>) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === "slice") SignalMutationIndex.#collectGenerated(node, kinds);
        else if (node.expression.text === "endpoint") SignalMutationIndex.#collectEndpoints(node, kinds);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  static #collectGenerated(slice: ts.CallExpression, kinds: Map<string, EndpointShape>) {
    let service: ts.Expression | undefined = slice.arguments[0];
    while (service && ts.isCallExpression(service) && ts.isPropertyAccessExpression(service.expression))
      service = service.expression.expression;
    if (!service || !ts.isPropertyAccessExpression(service) || !SignalMutationIndex.#isNamed(service.expression, "srv"))
      return;
    const model = service.name.text;
    const capModel = `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
    for (const [verb, argCount] of Object.entries(SignalMutationIndex.#generatedArgCounts))
      kinds.set(`${verb}${capModel}`, { kind: "mutation", argCount });
    kinds.set(`add${capModel}Files`, { kind: "mutation", argCount: 2 });
  }

  static #collectEndpoints(endpoint: ts.CallExpression, kinds: Map<string, EndpointShape>) {
    const builder = endpoint.arguments[1];
    if (!builder || (!ts.isArrowFunction(builder) && !ts.isFunctionExpression(builder))) return;
    const map = SignalMutationIndex.#returnedObjectOf(builder);
    if (!map) return;
    const verbOf = SignalMutationIndex.#verbReaderOf(builder.parameters[0]);
    for (const property of map.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
      const { root, argCount } = SignalMutationIndex.#chainOf(property.initializer);
      const verb = verbOf(root);
      //? A socket message writes with the visitor's credential as a mutation does, and the client refuses it alike.
      const kind = verb === "message" ? "mutation" : verb;
      if (kind === "query" || kind === "mutation") kinds.set(property.name.text, { kind, argCount });
    }
  }

  static #returnedObjectOf(builder: ts.ArrowFunction | ts.FunctionExpression) {
    let body: ts.Node | undefined = builder.body;
    if (ts.isBlock(body)) body = body.statements.find(ts.isReturnStatement)?.expression;
    while (body && ts.isParenthesizedExpression(body)) body = body.expression;
    return body && ts.isObjectLiteralExpression(body) ? body : null;
  }

  static #verbReaderOf(parameter: ts.ParameterDeclaration | undefined) {
    const verbs = new Map<string, string>();
    if (parameter && ts.isObjectBindingPattern(parameter.name))
      for (const element of parameter.name.elements) {
        const verb = element.propertyName ?? element.name;
        if (ts.isIdentifier(verb) && ts.isIdentifier(element.name)) verbs.set(element.name.text, verb.text);
      }
    const holder = parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : null;
    return (callee: ts.Expression | undefined) => {
      if (callee && ts.isIdentifier(callee)) return verbs.get(callee.text);
      if (callee && ts.isPropertyAccessExpression(callee) && SignalMutationIndex.#isNamed(callee.expression, holder))
        return callee.name.text;
      return undefined;
    };
  }

  static #isNamed(expression: ts.Expression, name: string | null) {
    return ts.isIdentifier(expression) && expression.text === name;
  }

  static #chainOf(initializer: ts.Expression) {
    let root = initializer;
    let argCount = 0;
    while (
      ts.isCallExpression(root) &&
      ts.isPropertyAccessExpression(root.expression) &&
      ts.isCallExpression(root.expression.expression)
    ) {
      if (SignalMutationIndex.#argMethods.has(root.expression.name.text)) argCount += 1;
      root = root.expression.expression;
    }
    return { root: ts.isCallExpression(root) ? root.expression : undefined, argCount };
  }
}
