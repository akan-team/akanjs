import ts from "typescript";
import type { QualityWarning, SourceFileInfo } from "./qualityScanner";
import { RenderMutationScanner } from "./renderMutationScanner";
import { SignalMutationIndex } from "./signalMutationIndex";

/** Server/client render split for one app or lib, measured in JSX elements rather than files. */
export interface SsrBalanceEntry {
  scope: string;
  serverMass: number;
  clientMass: number;
  serverShare: number;
}

export interface SsrScanResult {
  warnings: QualityWarning[];
  balance: SsrBalanceEntry[];
}

interface ComponentInfo {
  name: string;
  line: number;
  mass: number;
  touches: string[];
  vendorTags: boolean;
}

// A component with no client-only touch is worth moving even when small; a mostly-static one only once its static
// subtree is large enough to matter.
const STATIC_COMPONENT_MIN_MASS = 4;
const MIXED_COMPONENT_MIN_MASS = 10;
const MIXED_COMPONENT_MAX_TOUCHES = 2;
const MODULE_SERVER_VIEW_MIN_CLIENT_MASS = 12;

export const fileWarning = (
  rule: string,
  scope: QualityWarning["scope"],
  file: string,
  message: string,
  line?: number,
): QualityWarning =>
  line === undefined
    ? { rule, scope, severity: "warning", file, message }
    : { rule, scope, severity: "warning", file, line, message };

export class SsrScanner {
  // `usePage` and `getSelf` read request-scoped server context, which server components may do.
  static #serverSafeCalls = new Set(["usePage", "getSelf", "useServer"]);
  static #clientGlobals = new Set(
    "window document navigator localStorage sessionStorage location history screen matchMedia IntersectionObserver"
      .split(" ")
      .concat("ResizeObserver MutationObserver requestAnimationFrame WebSocket".split(" ")),
  );
  // Runtime singletons that only exist in the client bundle; importing either is what forces the directive.
  static #clientRuntimeImports = new Set(["st", "fetch"]);
  static #mountWriteFix =
    "Send the write from an explicit user action, such as a button that calls a store action. Do not move it into the route: a write there runs for anyone who opens a link to the page.";

  scan(sourceFiles: SourceFileInfo[]): SsrScanResult {
    const mutations = new SignalMutationIndex(sourceFiles);
    const componentFiles = sourceFiles.filter((sourceFile) => this.#isBalancedFile(sourceFile.file));
    return {
      warnings: [
        ...componentFiles.flatMap((sourceFile) => this.#scanFile(sourceFile, mutations)),
        ...this.#scanModules(componentFiles),
        ...new RenderMutationScanner(mutations).scan(sourceFiles),
      ],
      balance: this.#measureBalance(componentFiles),
    };
  }

  #scanFile(sourceFile: SourceFileInfo, mutations: SignalMutationIndex): QualityWarning[] {
    if (!this.#hasUseClient(sourceFile.sourceFile)) return [];
    const vendorNames = this.#getVendorNames(sourceFile.sourceFile);
    const hasVendorImport = this.#hasVendorImport(sourceFile.sourceFile);
    const importsClientRuntime = this.#importsClientRuntime(sourceFile.sourceFile);
    const components = this.#getComponents(sourceFile, vendorNames);
    const warnings: QualityWarning[] = [];

    if (
      !hasVendorImport &&
      !importsClientRuntime &&
      this.#getTouches(sourceFile.sourceFile, sourceFile.sourceFile).length === 0 &&
      !this.#isConventionClientFile(sourceFile.file)
    ) {
      warnings.push(
        fileWarning(
          "akan.ssr.unnecessary-use-client",
          "ssr",
          sourceFile.file,
          `"use client" is declared but the file uses no client-only capability (hook, event handler, store, or browser API).`,
          1,
        ),
      );
    }

    for (const component of components) {
      if (component.vendorTags) continue;
      if (component.touches.length === 0 && component.mass >= STATIC_COMPONENT_MIN_MASS) {
        warnings.push(
          fileWarning(
            "akan.ssr.client-static-component",
            "ssr",
            sourceFile.file,
            `Client component "${component.name}" renders ${component.mass} JSX elements with no client-only capability. It is server-renderable markup sitting in the client bundle.`,
            component.line,
          ),
        );
        continue;
      }
      if (
        component.touches.length >= 1 &&
        component.touches.length <= MIXED_COMPONENT_MAX_TOUCHES &&
        component.mass >= MIXED_COMPONENT_MIN_MASS
      ) {
        warnings.push(
          fileWarning(
            "akan.ssr.client-static-markup",
            "ssr",
            sourceFile.file,
            `Client component "${component.name}" renders ${component.mass} JSX elements around only ${component.touches.length} client-only touch (${[...new Set(component.touches)].join(", ")}). Most of this subtree does not need the client bundle.`,
            component.line,
          ),
        );
      }
    }

    warnings.push(...this.#getMountLoadWarnings(sourceFile, mutations));
    warnings.push(...this.#getTemplateStateWarnings(sourceFile));
    return warnings;
  }

  // A module rendered only from Template/Zone/Util makes every consumer pay for hydration just to display it.
  #scanModules(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    const modules = new Map<string, { clientMass: number; serverFiles: number; line: string }>();
    for (const sourceFile of sourceFiles) {
      const moduleDir = this.#getModuleDir(sourceFile.file);
      if (!moduleDir) continue;
      const entry = modules.get(moduleDir) ?? { clientMass: 0, serverFiles: 0, line: sourceFile.file };
      if (this.#hasUseClient(sourceFile.sourceFile)) entry.clientMass += this.#getMass(sourceFile.sourceFile);
      else if (/\.(Unit|View)\.tsx$/.test(sourceFile.file)) entry.serverFiles += 1;
      modules.set(moduleDir, entry);
    }
    return [...modules]
      .filter(([, entry]) => entry.serverFiles === 0 && entry.clientMass >= MODULE_SERVER_VIEW_MIN_CLIENT_MASS)
      .map(([moduleDir, entry]) =>
        fileWarning(
          "akan.ssr.module-missing-server-view",
          "ssr",
          entry.line,
          `Module "${moduleDir}" renders ${entry.clientMass} JSX elements from client files only; it declares no Unit or View server component.`,
        ),
      );
  }

  // Only an empty-dependency effect is a finding: a reactive effect answers client state and has no server equivalent.
  #getMountLoadWarnings(sourceFile: SourceFileInfo, mutations: SignalMutationIndex): QualityWarning[] {
    const warnings: QualityWarning[] = [];
    SsrScanner.#walk(sourceFile.sourceFile, (node) => {
      if (!this.#isMountEffect(sourceFile.sourceFile, node)) return;
      for (const load of this.#getLoadCalls(sourceFile.sourceFile, node)) {
        const line = this.#getLine(sourceFile.sourceFile, load.node);
        warnings.push(
          load.callee.startsWith("fetch.") && mutations.isMutation(sourceFile.file, load.callee.slice("fetch.".length))
            ? {
                ...fileWarning(
                  "akan.ssr.client-mount-load",
                  "ssr",
                  sourceFile.file,
                  `Mount-only effect sends the mutation ${load.callee}() each time the component mounts. A write is not data the route can load.`,
                  line,
                ),
                fix: SsrScanner.#mountWriteFix,
              }
            : fileWarning(
                "akan.ssr.client-mount-load",
                "ssr",
                sourceFile.file,
                `Mount-only effect loads server data with ${load.callee}(). The route can fetch this before the first byte instead.`,
                line,
              ),
        );
      }
    });
    return warnings;
  }

  #isMountEffect(sourceFile: ts.SourceFile, node: ts.Node) {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression.getText(sourceFile);
    if (callee !== "useEffect" && callee !== "useLayoutEffect") return false;
    const deps = node.arguments[1];
    return !!deps && ts.isArrayLiteralExpression(deps) && deps.elements.length === 0;
  }

  #getLoadCalls(sourceFile: ts.SourceFile, node: ts.Node) {
    const calls: Array<{ callee: string; node: ts.Node }> = [];
    SsrScanner.#walk(node, (child) => {
      if (!ts.isCallExpression(child)) return;
      const callee = child.expression.getText(sourceFile);
      if (/^fetch\.[a-z]/.test(callee) || /^st\.do\.(init|get|view|load|list|count|insight)[A-Z]/.test(callee))
        calls.push({ callee, node: child });
    });
    return calls;
  }

  #getTemplateStateWarnings(sourceFile: SourceFileInfo): QualityWarning[] {
    if (!sourceFile.file.endsWith(".Template.tsx")) return [];
    const warnings: QualityWarning[] = [];
    SsrScanner.#walk(sourceFile.sourceFile, (node) => {
      if (ts.isCallExpression(node) && node.expression.getText(sourceFile.sourceFile) === "useState")
        warnings.push(
          fileWarning(
            "akan.ssr.template-client-state",
            "ssr",
            sourceFile.file,
            "Template holds form state in useState. Templates are store-driven and carry no local state.",
            this.#getLine(sourceFile.sourceFile, node),
          ),
        );
    });
    return warnings;
  }

  #measureBalance(sourceFiles: SourceFileInfo[]): SsrBalanceEntry[] {
    const scopes = new Map<string, { serverMass: number; clientMass: number }>();
    for (const sourceFile of sourceFiles) {
      const segments = sourceFile.file.split("/");
      const scope = `${segments[0]}/${segments[1]}`;
      const entry = scopes.get(scope) ?? { serverMass: 0, clientMass: 0 };
      const mass = this.#getMass(sourceFile.sourceFile);
      if (this.#hasUseClient(sourceFile.sourceFile)) entry.clientMass += mass;
      else entry.serverMass += mass;
      scopes.set(scope, entry);
    }
    const entries = [...scopes]
      .map(([scope, mass]) => ({ scope, ...mass, serverShare: getShare(mass.serverMass, mass.clientMass) }))
      .sort((a, b) => a.scope.localeCompare(b.scope));
    if (entries.length < 2) return entries;
    const serverMass = entries.reduce((sum, entry) => sum + entry.serverMass, 0);
    const clientMass = entries.reduce((sum, entry) => sum + entry.clientMass, 0);
    return [...entries, { scope: "workspace", serverMass, clientMass, serverShare: getShare(serverMass, clientMass) }];
  }

  #getComponents(sourceFile: SourceFileInfo, vendorNames: Set<string>): ComponentInfo[] {
    const components: ComponentInfo[] = [];
    for (const statement of sourceFile.sourceFile.statements) {
      for (const { name, node } of this.#getComponentNodes(statement)) {
        if (!/^[A-Z]/.test(name)) continue;
        components.push({
          name,
          line: this.#getLine(sourceFile.sourceFile, node),
          mass: this.#getMass(node),
          touches: this.#getTouches(sourceFile.sourceFile, node),
          vendorTags: [...this.#getTagNames(sourceFile.sourceFile, node)].some((tag) => vendorNames.has(tag)),
        });
      }
    }
    return components;
  }

  #getComponentNodes(statement: ts.Statement): Array<{ name: string; node: ts.Node }> {
    if (ts.isFunctionDeclaration(statement) && statement.body)
      return [{ name: statement.name?.text ?? "default", node: statement.body }];
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.flatMap((declaration) => {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return [];
      if (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer)) return [];
      return [{ name: declaration.name.text, node: declaration.initializer }];
    });
  }

  #getTouches(sourceFile: ts.SourceFile, node: ts.Node): string[] {
    const touches: string[] = [];
    SsrScanner.#walk(node, (child) => {
      if (ts.isCallExpression(child)) {
        const callee = child.expression.getText(sourceFile);
        const bareName = callee.split(".").pop() ?? callee;
        if (callee === "createContext" || callee === "lazy") touches.push(callee);
        else if (/^use[A-Z]/.test(bareName) && !SsrScanner.#serverSafeCalls.has(bareName)) touches.push(bareName);
      }
      if (ts.isJsxAttribute(child) && /^on[A-Z]/.test(child.name.getText(sourceFile)))
        touches.push(child.name.getText(sourceFile));
      if (ts.isPropertyAccessExpression(child)) {
        const root = getAccessRoot(child);
        if (root === "st") touches.push("st");
        else if (SsrScanner.#clientGlobals.has(root)) touches.push(root);
      }
    });
    return touches;
  }

  #getTagNames(sourceFile: ts.SourceFile, node: ts.Node): Set<string> {
    const tags = new Set<string>();
    SsrScanner.#walk(node, (child) => {
      if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child))
        tags.add(child.tagName.getText(sourceFile).split(".")[0]);
    });
    return tags;
  }

  #getMass(node: ts.Node) {
    let mass = 0;
    SsrScanner.#walk(node, (child) => {
      if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) mass += 1;
    });
    return mass;
  }

  static #walk(node: ts.Node, visit: (descendant: ts.Node) => void) {
    const walk = (child: ts.Node) => {
      visit(child);
      ts.forEachChild(child, walk);
    };
    ts.forEachChild(node, walk);
  }

  #hasUseClient(sourceFile: ts.SourceFile) {
    const first = sourceFile.statements[0];
    if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression)) return false;
    return first.expression.text === "use client";
  }

  // A third-party package may be client-only, a legitimate reason for the directive no AST reading can rule out.
  #hasVendorImport(sourceFile: ts.SourceFile) {
    return sourceFile.statements.some(
      (statement) => ts.isImportDeclaration(statement) && isVendorSpecifier(getSpecifier(statement)),
    );
  }

  #getVendorNames(sourceFile: ts.SourceFile) {
    const names = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !isVendorSpecifier(getSpecifier(statement))) continue;
      const clause = statement.importClause;
      if (clause?.name) names.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings))
        names.add(clause.namedBindings.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const element of clause.namedBindings.elements) names.add(element.name.text);
    }
    return names;
  }

  #importsClientRuntime(sourceFile: ts.SourceFile) {
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      if (bindings.elements.some((element) => SsrScanner.#clientRuntimeImports.has(element.name.text))) return true;
    }
    return false;
  }

  // Zone/Template/Util carry the directive by file role, and `index_.tsx` is the declared lazy() boundary.
  #isConventionClientFile(file: string) {
    if (file.endsWith("/index_.tsx")) return true;
    return /\.(Zone|Template|Util)\.tsx$/.test(file) && this.#getModuleDir(file) !== null;
  }

  #isBalancedFile(file: string) {
    if (!file.endsWith(".tsx") || file.endsWith(".test.tsx") || file.endsWith(".spec.tsx")) return false;
    const segments = file.split("/");
    if (segments[0] !== "apps" && segments[0] !== "libs") return false;
    return segments[2] === "ui" || segments[2] === "lib";
  }

  #getModuleDir(file: string) {
    const segments = file.split("/");
    const libIndex = segments.indexOf("lib");
    if (libIndex < 1 || segments.length <= libIndex + 2) return null;
    const moduleName = segments[libIndex + 1];
    if (moduleName.startsWith("_")) return null;
    return segments.slice(0, libIndex + 2).join("/");
  }

  #getLine(sourceFile: ts.SourceFile, node: ts.Node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }
}

/** Share of component rendering an app or lib should keep on the server before the split needs a reason. */
export const SSR_SERVER_SHARE_TARGET = 0.5;

export function formatSsrBalance(balance: SsrBalanceEntry[]) {
  if (balance.length === 0) return ["No component files found."];
  return balance.map((entry) => {
    const total = entry.serverMass + entry.clientMass;
    const share = `${Math.round(entry.serverShare * 100)}% server`;
    const counts = `${entry.serverMass} of ${total} JSX elements, ${entry.clientMass} client`;
    const flag =
      entry.serverShare < SSR_SERVER_SHARE_TARGET
        ? `  <- below the ${Math.round(SSR_SERVER_SHARE_TARGET * 100)}% target`
        : "";
    return `  ${entry.scope}: ${share} (${counts})${flag}`;
  });
}

function getShare(serverMass: number, clientMass: number) {
  const total = serverMass + clientMass;
  return total === 0 ? 1 : serverMass / total;
}

function getSpecifier(statement: ts.ImportDeclaration) {
  return ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "";
}

function isVendorSpecifier(specifier: string) {
  if (specifier === "" || specifier.startsWith(".") || specifier.startsWith("/")) return false;
  if (specifier === "react" || specifier === "react-dom" || specifier.startsWith("react/")) return false;
  if (specifier.startsWith("node:")) return false;
  return !/^(akanjs|@akanjs|@libs|@apps|@contract)(\/|$)/.test(specifier);
}

function getAccessRoot(node: ts.PropertyAccessExpression) {
  let current: ts.Expression = node;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : "";
}
