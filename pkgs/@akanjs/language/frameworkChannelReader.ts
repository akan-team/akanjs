import type { AkanGraphLocation } from "akanjs/common/akanGraph.ts";
import type { FrameworkChannel, FrameworkMessage, FrameworkSite } from "akanjs/common/frameworkMap.ts";
import type * as TS from "typescript";
import type { Ts } from "./ast";

export interface FrameworkChannelSpec {
  file: string;
  union: string;
  label: string;
  /** Classes that route the channel's messages by `type` on their way to the handlers, who sit beyond the reader. */
  relays?: string[];
}

interface MemberShape {
  at: AkanGraphLocation;
  keys: Set<string>;
  required: Set<string>;
}

interface UnionShape {
  file: string;
  name: string;
  at: AkanGraphLocation;
  members: Map<string, MemberShape>;
  typeNames: Set<string>;
  channel: ChannelState | null;
}

interface ChannelState {
  spec: FrameworkChannelSpec;
  union: UnionShape;
  senders: Map<string, FrameworkSite[]>;
  handlers: Map<string, FrameworkSite[]>;
}

type Role = "senders" | "handlers";

interface Site {
  role: Role;
  literal: string;
  source: TS.SourceFile;
  node: TS.Node;
}

interface SendContext {
  names: Set<string>;
  parameter: TS.ParameterDeclaration | null;
}

interface Chain {
  literals: [string, TS.Node][];
  hint: Set<string> | null;
  parameter: TS.ParameterDeclaration | null;
}

//? "ready", "error" and "redirect" also sit in non-channel unions, so a site is weighed against every union.
export class FrameworkChannelReader {
  readonly #ts: Ts;
  readonly #unions: UnionShape[] = [];
  readonly #channels: ChannelState[] = [];
  readonly #missing: string[] = [];
  readonly #deferred: (Site & { channels: ChannelState[] })[] = [];
  readonly #spoken = new Map<string, Set<ChannelState>>();
  readonly #sendParameters = new Set<TS.ParameterDeclaration>();

  constructor(ts: Ts, specs: FrameworkChannelSpec[], sources: Map<string, TS.SourceFile>) {
    this.#ts = ts;
    for (const source of sources.values()) this.#unions.push(...this.#unionsIn(source));
    const parts = new Set(
      this.#unions.flatMap((union) =>
        [...union.typeNames].filter((name) => name !== union.name).map((name) => `${union.file}\n${name}`),
      ),
    );
    this.#unions.splice(
      0,
      this.#unions.length,
      ...this.#unions.filter((union) => !parts.has(`${union.file}\n${union.name}`)),
    );
    for (const spec of specs) {
      const union = this.#unions.find(({ file, name }) => file === spec.file && name === spec.union);
      if (!union) {
        this.#missing.push(`${spec.union} in ${spec.file}`);
        continue;
      }
      union.channel = { spec, union, senders: new Map(), handlers: new Map() };
      this.#channels.push(union.channel);
    }
    for (const source of sources.values()) this.#read(source);
    for (const { channels, ...site } of this.#deferred) {
      const spoken = this.#spoken.get(site.source.fileName);
      for (const channel of channels) if (spoken?.has(channel)) this.#record(channel, site);
    }
  }

  get missing() {
    return [...this.#missing];
  }

  channels(): FrameworkChannel[] {
    return this.#channels.map(({ spec, union, senders, handlers }) => ({
      name: spec.union,
      label: spec.label,
      at: union.at,
      messages: [...union.members].map(
        ([type, member]): FrameworkMessage => ({
          type,
          at: member.at,
          senders: FrameworkChannelReader.#grouped(senders.get(type) ?? []),
          handlers: FrameworkChannelReader.#grouped(handlers.get(type) ?? []),
        }),
      ),
    }));
  }

  static #grouped(sites: FrameworkSite[]): FrameworkSite[] {
    const byOwner = new Map<string, FrameworkSite>();
    const ordered = [...sites].sort((a, b) =>
      a.at.file === b.at.file ? a.at.line - b.at.line : a.at.file < b.at.file ? -1 : 1,
    );
    for (const site of ordered) {
      const existing = byOwner.get(site.owner);
      if (existing) existing.count += 1;
      else byOwner.set(site.owner, { ...site, count: 1 });
    }
    return [...byOwner.values()].sort((a, b) => (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0));
  }

  #location(source: TS.SourceFile, node: TS.Node): AkanGraphLocation {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { file: source.fileName, line: line + 1, column: character + 1 };
  }

  #unionsIn(source: TS.SourceFile): UnionShape[] {
    const ts = this.#ts;
    const declarations = new Map<string, TS.TypeAliasDeclaration | TS.InterfaceDeclaration>();
    for (const statement of source.statements)
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))
        declarations.set(statement.name.text, statement);
    return [...declarations.values()].flatMap((declaration) => {
      if (!ts.isTypeAliasDeclaration(declaration) || !ts.isUnionTypeNode(declaration.type)) return [];
      const members = new Map<string, MemberShape>();
      const typeNames = new Set([declaration.name.text]);
      const isShaped = this.#collect(source, declaration.type, declarations, members, typeNames);
      if (!isShaped || members.size < 2) return [];
      return [
        {
          file: source.fileName,
          name: declaration.name.text,
          at: this.#location(source, declaration.name),
          members,
          typeNames,
          channel: null,
        },
      ];
    });
  }

  #collect(
    source: TS.SourceFile,
    type: TS.TypeNode,
    declarations: Map<string, TS.TypeAliasDeclaration | TS.InterfaceDeclaration>,
    members: Map<string, MemberShape>,
    typeNames: Set<string>,
  ): boolean {
    const ts = this.#ts;
    if (ts.isParenthesizedTypeNode(type)) return this.#collect(source, type.type, declarations, members, typeNames);
    if (ts.isUnionTypeNode(type))
      return type.types.every((member) => this.#collect(source, member, declarations, members, typeNames));
    if (ts.isTypeLiteralNode(type)) return this.#addMember(source, type.members, members);
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return false;
    const name = type.typeName.text;
    const declaration = declarations.get(name);
    if (!declaration) return false;
    if (typeNames.has(name)) return true;
    typeNames.add(name);
    return ts.isTypeAliasDeclaration(declaration)
      ? this.#collect(source, declaration.type, declarations, members, typeNames)
      : this.#addMember(source, declaration.members, members);
  }

  #addMember(source: TS.SourceFile, elements: readonly TS.TypeElement[], members: Map<string, MemberShape>) {
    const ts = this.#ts;
    const typeProperty = elements.find(
      (element): element is TS.PropertySignature =>
        ts.isPropertySignature(element) && this.#nameOf(element.name) === "type",
    );
    const literal =
      typeProperty?.type && ts.isLiteralTypeNode(typeProperty.type) && ts.isStringLiteral(typeProperty.type.literal)
        ? typeProperty.type.literal.text
        : null;
    if (!typeProperty || literal === null) return false;
    const keys = new Set<string>();
    const required = new Set<string>();
    for (const element of elements) {
      const name = ts.isPropertySignature(element) ? this.#nameOf(element.name) : null;
      if (!name) continue;
      keys.add(name);
      if (ts.isPropertySignature(element) && !element.questionToken) required.add(name);
    }
    const existing = members.get(literal);
    if (!existing) {
      members.set(literal, { at: this.#location(source, typeProperty), keys, required });
      return true;
    }
    for (const key of keys) existing.keys.add(key);
    for (const key of existing.required) if (!required.has(key)) existing.required.delete(key);
    return true;
  }

  #nameOf(name: TS.PropertyName | TS.BindingName) {
    const ts = this.#ts;
    return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
  }

  #literalOf(expression: TS.Expression | undefined) {
    const ts = this.#ts;
    return expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
      ? expression.text
      : null;
  }

  #record(channel: ChannelState, { role, literal, source, node }: Site) {
    const sites = channel[role];
    const site = { owner: this.#ownerOf(source, node), count: 1, at: this.#location(source, node) };
    const relayed = role === "handlers" && !!site.owner && !!channel.spec.relays?.includes(site.owner);
    if (!relayed) sites.set(literal, [...(sites.get(literal) ?? []), site]);
    const spoken = this.#spoken.get(source.fileName) ?? new Set();
    spoken.add(channel);
    this.#spoken.set(source.fileName, spoken);
  }

  //? On a tie the site's own file wins: `RscRenderer` compares its local `RenderControl`, not `RscInMsg`.
  #settle(candidates: UnionShape[], site: Site) {
    const local = candidates.filter(({ file }) => file === site.source.fileName);
    const unions = candidates.length > 1 && local.length ? local : candidates;
    const channels = unions.flatMap(({ channel }) => (channel ? [channel] : []));
    if (unions.length === 1 && channels.length === 1) this.#record(channels[0], site);
    else if (channels.length) this.#deferred.push({ ...site, channels });
  }

  #ownerOf(source: TS.SourceFile, node: TS.Node) {
    const ts = this.#ts;
    let top: TS.Node = node;
    for (let current: TS.Node | undefined = node; current; current = current.parent) {
      if ((ts.isClassDeclaration(current) || ts.isClassExpression(current)) && current.name) return current.name.text;
      if (current.parent && !ts.isSourceFile(current.parent)) top = current.parent;
    }
    if (ts.isFunctionDeclaration(top) && top.name) return top.name.text;
    if (ts.isVariableStatement(top)) {
      const declaration = top.declarationList.declarations.find(
        ({ initializer, pos, end }) =>
          !!initializer &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          pos <= node.pos &&
          node.end <= end,
      );
      if (declaration && ts.isIdentifier(declaration.name)) return declaration.name.text;
    }
    const classes = source.statements.filter(ts.isClassDeclaration);
    const only = classes.length === 1 ? classes[0].name?.text : undefined;
    return only ?? source.fileName.slice(source.fileName.lastIndexOf("/") + 1).replace(/\.tsx?$/, "");
  }

  #namesIn(type: TS.Node | undefined) {
    const ts = this.#ts;
    const names = new Set<string>();
    const visit = (node: TS.Node) => {
      if (ts.isTypeReferenceNode(node))
        names.add(ts.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.right.text);
      if (!ts.isTypeLiteralNode(node)) ts.forEachChild(node, visit);
    };
    if (type) visit(type);
    return names;
  }

  #literalTypesIn(type: TS.Node | undefined) {
    const ts = this.#ts;
    const literals = new Set<string>();
    const visit = (node: TS.Node) => {
      if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) literals.add(node.literal.text);
      ts.forEachChild(node, visit);
    };
    if (type) visit(type);
    return literals;
  }

  #hinted(names: Set<string>) {
    return this.#unions.filter((union) => [...names].some((name) => union.typeNames.has(name)));
  }

  #read(source: TS.SourceFile) {
    const ts = this.#ts;
    const comparisons = new Map<string, Chain>();
    const switches: Chain[] = [];
    const visit = (node: TS.Node) => {
      if (ts.isObjectLiteralExpression(node)) this.#readSend(source, node);
      else if (ts.isNewExpression(node)) this.#readRouteSet(source, node);
      else if (ts.isSwitchStatement(node)) {
        const chain = this.#switchChain(node);
        if (chain) switches.push(chain);
      } else if (ts.isBinaryExpression(node)) {
        const compared = this.#comparedType(node);
        if (compared) {
          const key = `${this.#scopeOf(node)?.pos ?? -1}:${compared.receiver.getText(source)}`;
          const chain = comparisons.get(key) ?? {
            literals: [],
            hint: this.#declaredTypeNames(compared.receiver),
            parameter: this.#parameterOf(compared.receiver),
          };
          chain.literals.push([compared.literal, compared.at]);
          comparisons.set(key, chain);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const chain of [...switches, ...comparisons.values()])
      if (!chain.parameter || !this.#sendParameters.has(chain.parameter)) this.#readChain(source, chain);
  }

  #readSend(source: TS.SourceFile, object: TS.ObjectLiteralExpression) {
    const ts = this.#ts;
    const typeProperty = object.properties.find(
      (property): property is TS.PropertyAssignment =>
        ts.isPropertyAssignment(property) && this.#nameOf(property.name) === "type",
    );
    const literal = this.#literalOf(typeProperty?.initializer);
    if (!typeProperty || literal === null) return;
    const context = this.#sendContextOf(object, literal);
    if (!context) return;
    const site: Site = { role: "senders", literal, source, node: typeProperty };
    const hinted = this.#hinted(context.names).filter((union) => union.members.has(literal));
    const candidates = hinted.length ? hinted : this.#fitting(object, literal);
    if (context.parameter && candidates.some(({ channel }) => channel)) this.#sendParameters.add(context.parameter);
    this.#settle(candidates, site);
  }

  #fitting(object: TS.ObjectLiteralExpression, literal: string) {
    const ts = this.#ts;
    const isLoose = object.properties.some((property) => ts.isSpreadAssignment(property));
    const keys = new Set(
      object.properties.flatMap((property) => {
        const name = ts.isSpreadAssignment(property) ? null : this.#nameOf(property.name);
        return name === null ? [] : [name];
      }),
    );
    return this.#unions.filter((union) => {
      const member = union.members.get(literal);
      return (
        !!member &&
        [...keys].every((key) => member.keys.has(key)) &&
        (isLoose || [...member.required].every((key) => keys.has(key)))
      );
    });
  }

  //? A function that takes the message it returns, narrowed to the same `type`, rewrites one it received.
  #sendContextOf(object: TS.ObjectLiteralExpression, literal: string | null): SendContext | null {
    const ts = this.#ts;
    const hint = new Set<string>();
    let node: TS.Node = object;
    while (node.parent) {
      const parent: TS.Node = node.parent;
      if (ts.isParenthesizedExpression(parent) || ts.isConditionalExpression(parent)) node = parent;
      else if (ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
        for (const name of this.#namesIn(parent.type)) hint.add(name);
        node = parent;
      } else if (ts.isCallExpression(parent) && this.#calleeName(parent) === "stringify") node = parent;
      else if (ts.isArrowFunction(parent) && parent.body === node && !parent.type) node = parent;
      else break;
    }
    const parent = node.parent;
    if (!parent) return null;
    const scope = this.#scopeOf(object);
    if (literal !== null && scope?.parameters.some(({ type }) => this.#literalTypesIn(type).has(literal))) return null;
    const context = (names: Set<string>, parameter: TS.ParameterDeclaration | null = null) => ({
      names: new Set([...hint, ...names]),
      parameter,
    });
    if (ts.isCallExpression(parent)) {
      const index = parent.arguments.indexOf(node as TS.Expression);
      if (index < 0) return null;
      const parameter = this.#calleeOf(parent)?.parameters[index] ?? null;
      return context(this.#namesIn(parameter?.type), parameter);
    }
    if (ts.isVariableDeclaration(parent) && parent.type) return context(this.#namesIn(parent.type));
    if (ts.isPropertyAssignment(parent) && ts.isObjectLiteralExpression(parent.parent)) {
      const outer = this.#sendContextOf(parent.parent, null);
      const property = this.#nameOf(parent.name);
      const names = outer && property ? this.#propertyTypeNames(object.getSourceFile(), outer.names, property) : null;
      return names?.size ? context(names) : null;
    }
    const fn = ts.isReturnStatement(parent) ? this.#scopeOf(parent) : ts.isArrowFunction(parent) ? parent : null;
    if (fn?.type) return context(this.#namesIn(fn.type));
    return hint.size ? context(new Set()) : null;
  }

  #propertyTypeNames(source: TS.SourceFile, typeNames: Set<string>, property: string) {
    const ts = this.#ts;
    for (const statement of source.statements) {
      if (!(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))) continue;
      if (!typeNames.has(statement.name.text)) continue;
      const members: readonly TS.TypeElement[] = ts.isInterfaceDeclaration(statement)
        ? statement.members
        : ts.isTypeLiteralNode(statement.type)
          ? statement.type.members
          : [];
      const signature = members.find(
        (member): member is TS.PropertySignature =>
          ts.isPropertySignature(member) && this.#nameOf(member.name) === property,
      );
      if (signature?.type) return this.#namesIn(signature.type);
    }
    return null;
  }

  #calleeOf(call: TS.CallExpression): TS.SignatureDeclaration | null {
    const ts = this.#ts;
    const callee = call.expression;
    const isFunction = (node: TS.Node | undefined): node is TS.ArrowFunction | TS.FunctionExpression =>
      !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
    if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) {
      let owner: TS.Node | undefined = call.parent;
      while (owner && !ts.isClassLike(owner)) owner = owner.parent;
      const member = owner?.members.find(({ name }) => name && this.#memberName(name) === callee.name.text);
      if (!member) return null;
      if (ts.isMethodDeclaration(member)) return member;
      return ts.isPropertyDeclaration(member) && isFunction(member.initializer) ? member.initializer : null;
    }
    if (!ts.isIdentifier(callee)) return null;
    for (const statement of call.getSourceFile().statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === callee.text) return statement;
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && declaration.name.text === callee.text)
          return isFunction(declaration.initializer) ? declaration.initializer : null;
    }
    return null;
  }

  #memberName(name: TS.PropertyName) {
    const ts = this.#ts;
    return ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
  }

  #calleeName(call: TS.CallExpression) {
    const ts = this.#ts;
    const callee = call.expression;
    if (ts.isIdentifier(callee)) return callee.text;
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
    return null;
  }

  #scopeOf(node: TS.Node): TS.SignatureDeclaration | null {
    const ts = this.#ts;
    for (let current = node.parent; current; current = current.parent) if (ts.isFunctionLike(current)) return current;
    return null;
  }

  #typeReceiverOf(expression: TS.Expression) {
    const ts = this.#ts;
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === "type") return expression.expression;
    if (ts.isElementAccessExpression(expression) && this.#literalOf(expression.argumentExpression) === "type")
      return expression.expression;
    return null;
  }

  #comparedType(node: TS.BinaryExpression) {
    const ts = this.#ts;
    const { kind } = node.operatorToken;
    if (
      kind !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
      kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
      kind !== ts.SyntaxKind.EqualsEqualsToken &&
      kind !== ts.SyntaxKind.ExclamationEqualsToken
    )
      return null;
    for (const [side, other] of [
      [node.left, node.right],
      [node.right, node.left],
    ] as const) {
      const receiver = this.#typeReceiverOf(side);
      const literal = this.#literalOf(other);
      if (receiver && literal !== null) return { receiver, literal, at: other as TS.Node };
    }
    return null;
  }

  #declaredTypeNames(receiver: TS.Expression): Set<string> | null {
    const ts = this.#ts;
    if (!ts.isIdentifier(receiver)) return null;
    const name = receiver.text;
    for (let current: TS.Node | undefined = receiver.parent; current; current = current.parent) {
      if (ts.isFunctionLike(current))
        for (const parameter of current.parameters)
          if (ts.isIdentifier(parameter.name) && parameter.name.text === name)
            return parameter.type ? this.#namesIn(parameter.type) : null;
      if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isCaseClause(current))
        for (const statement of current.statements) {
          if (!ts.isVariableStatement(statement)) continue;
          for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
            const { initializer } = declaration;
            const asType =
              initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))
                ? initializer.type
                : undefined;
            const type = declaration.type ?? asType;
            return type ? this.#namesIn(type) : null;
          }
        }
    }
    return null;
  }

  #parameterOf(receiver: TS.Expression): TS.ParameterDeclaration | null {
    const ts = this.#ts;
    if (!ts.isIdentifier(receiver)) return null;
    for (let current: TS.Node | undefined = receiver.parent; current; current = current.parent)
      if (ts.isFunctionLike(current)) {
        const parameter = current.parameters.find(({ name }) => ts.isIdentifier(name) && name.text === receiver.text);
        if (parameter) return parameter;
      }
    return null;
  }

  //? `type` also tells plain kinds apart (`"init" | "cron"`), so a chain needs a union holding half its literals.
  #readChain(source: TS.SourceFile, { literals, hint }: Chain) {
    const hinted = hint?.size ? this.#hinted(hint) : [];
    if (hint?.size && !hinted.length) return;
    const scored = this.#unions
      .map((union) => ({ union, hits: literals.filter(([literal]) => union.members.has(literal)).length }))
      .filter(({ hits }) => hits > 0);
    const best = Math.max(0, ...scored.map(({ hits }) => hits));
    const unions = hinted.length
      ? hinted
      : best * 2 >= literals.length
        ? scored.filter(({ hits }) => hits === best).map(({ union }) => union)
        : [];
    for (const [literal, node] of literals) {
      const holding = unions.filter((union) => union.members.has(literal));
      this.#settle(holding, { role: "handlers", literal, source, node });
    }
  }

  #switchChain(statement: TS.SwitchStatement): Chain | null {
    const ts = this.#ts;
    const receiver = this.#typeReceiverOf(statement.expression);
    if (!receiver) return null;
    const literals = statement.caseBlock.clauses.flatMap((clause) => {
      if (!ts.isCaseClause(clause)) return [];
      const literal = this.#literalOf(clause.expression);
      return literal === null ? [] : [[literal, clause.expression] as [string, TS.Node]];
    });
    return { literals, hint: this.#declaredTypeNames(receiver), parameter: this.#parameterOf(receiver) };
  }

  #readRouteSet(source: TS.SourceFile, expression: TS.NewExpression) {
    const ts = this.#ts;
    if (!ts.isIdentifier(expression.expression) || expression.expression.text !== "Set") return;
    const unions = this.#hinted(this.#namesIn(expression.typeArguments?.[0]));
    const list = expression.arguments?.[0];
    if (!unions.length || !list || !ts.isArrayLiteralExpression(list)) return;
    for (const element of list.elements) {
      const literal = this.#literalOf(element);
      if (literal === null) continue;
      const holding = unions.filter((union) => union.members.has(literal));
      this.#settle(holding, { role: "handlers", literal, source, node: element });
    }
  }
}
