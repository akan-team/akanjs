import path from "node:path";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";

type ServiceMethod = [service: string, method: string];

//? Only `endpoint(…)` and `slice(…)` answer a caller who waits; an `internal(…)` job (cron, interval, queue) works
//? per item on purpose, so that one failing item leaves the rest done.
export class EndpointReach {
  static readonly #requestBuilders = new Set(["endpoint", "slice"]);
  readonly #reached = new Set<string>();

  constructor(
    signalFiles: Pick<SourceFileInfo, "sourceFile">[],
    serviceFiles: Pick<SourceFileInfo, "file" | "sourceFile">[],
  ) {
    const methodsByService = new Map<string, Map<string, ts.MethodDeclaration>>();
    for (const { file, sourceFile } of serviceFiles) {
      const methods = methodsByService.get(EndpointReach.serviceOf(file)) ?? new Map<string, ts.MethodDeclaration>();
      for (const cls of sourceFile.statements.filter(ts.isClassDeclaration))
        for (const member of cls.members)
          if (
            ts.isMethodDeclaration(member) &&
            member.body &&
            (ts.isIdentifier(member.name) || ts.isPrivateIdentifier(member.name))
          )
            methods.set(member.name.text, member);
      methodsByService.set(EndpointReach.serviceOf(file), methods);
    }
    const pending: ServiceMethod[] = [];
    const reach = ([service, method]: ServiceMethod) => {
      const key = `${service}.${method}`;
      if (this.#reached.has(key) || !methodsByService.get(service)?.has(method)) return;
      this.#reached.add(key);
      pending.push([service, method]);
    };
    for (const { sourceFile } of signalFiles)
      for (const cls of sourceFile.statements.filter(ts.isClassDeclaration)) {
        const base = cls.heritageClauses?.[0]?.types[0]?.expression;
        if (
          base &&
          ts.isCallExpression(base) &&
          ts.isIdentifier(base.expression) &&
          EndpointReach.#requestBuilders.has(base.expression.text)
        )
          EndpointReach.#serviceCallsIn(base, null).forEach(reach);
      }
    for (let next = pending.pop(); next; next = pending.pop()) {
      const [service, method] = next;
      const declaration = methodsByService.get(service)?.get(method);
      if (declaration) EndpointReach.#serviceCallsIn(declaration, service).forEach(reach);
    }
  }

  static serviceOf(file: string) {
    return path.posix.basename(file).replace(/\.service\.ts$/, "");
  }

  reaches(service: string, method: string) {
    return this.#reached.has(`${service}.${method}`);
  }

  static #serviceCallsIn(node: ts.Node, ownService: string | null) {
    const calls: ServiceMethod[] = [];
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)) {
        const { expression: owner, name } = child.expression;
        if (owner.kind === ts.SyntaxKind.ThisKeyword && ownService) calls.push([ownService, name.text]);
        else if (ts.isPropertyAccessExpression(owner) && owner.expression.kind === ts.SyntaxKind.ThisKeyword) {
          const field = owner.name.text;
          if (field.length > "Service".length && field.endsWith("Service"))
            calls.push([field.slice(0, -"Service".length), name.text]);
        }
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    return calls;
  }
}
