import type { Sys } from "../commandDecorators";

interface CatalogEntry {
  name: string;
  specifier: string;
}

interface ActingUser {
  argName: string;
  specifier: string;
  param: string;
  value: string;
  serviceParam: string;
}

export class GuardCatalog {
  static readonly frameworkGuards = ["Public"] as const;
  static readonly #actingArgOf = new Map<string, Omit<ActingUser, "specifier">>([
    ["User", { argName: "Self", param: "self", value: "self.id", serviceParam: "selfId" }],
    [
      "SignedIn",
      { argName: "CurrentUserId", param: "currentUserId", value: "currentUserId", serviceParam: "currentUserId" },
    ],
  ]);
  readonly #guards: CatalogEntry[];
  readonly #internalArgs: CatalogEntry[];
  readonly reachedLibs: string[];

  constructor(guards: CatalogEntry[], internalArgs: CatalogEntry[], reachedLibs: string[]) {
    this.#guards = guards;
    this.#internalArgs = internalArgs;
    this.reachedLibs = reachedLibs;
  }

  static async load(sys: Sys) {
    const reachedLibs = await GuardCatalog.#reachedLibs(sys);
    const scopes = [{ type: sys.type, name: sys.name }, ...reachedLibs.map((name) => ({ type: "lib" as const, name }))];
    const exports = (await Promise.all(scopes.map((scope) => GuardCatalog.#srvkitExports(sys, scope)))).flat();
    const frameworkGuards = GuardCatalog.frameworkGuards.map((name) => ({ name, specifier: "akanjs/signal" }));
    return new GuardCatalog(
      [...exports.filter((entry) => entry.kind === "Guard"), ...frameworkGuards],
      exports.filter((entry) => entry.kind === "InternalArg"),
      reachedLibs,
    );
  }

  get names() {
    return [...new Set(this.#guards.map((guard) => guard.name))];
  }

  resolve(name: string) {
    const matches = this.#guards.filter((guard) => guard.name === name);
    const specifiers = [...new Set(matches.map((guard) => guard.specifier))];
    return { specifier: specifiers[0] ?? null, ambiguous: specifiers.length > 1 ? specifiers : null };
  }

  actingUserOf(guards: readonly string[]): ActingUser | null {
    for (const guard of guards) {
      const acting = GuardCatalog.#actingArgOf.get(guard);
      const specifier = acting
        ? this.#internalArgs.find((entry) => entry.name === acting.argName)?.specifier
        : undefined;
      if (acting && specifier) return { ...acting, specifier };
    }
    return null;
  }

  static async #reachedLibs(sys: Sys) {
    const workspaceLibs = await sys.workspace.getLibs();
    const depsOf = async (type: "app" | "lib", name: string) => {
      const jsonPath = `${type}s/${name}/akan.${type}.json`;
      if (!(await sys.workspace.exists(jsonPath))) return null;
      const { libDeps } = (await sys.workspace.readJson(jsonPath)) as { libDeps?: unknown };
      return Array.isArray(libDeps) ? libDeps.filter((lib): lib is string => workspaceLibs.includes(lib)) : [];
    };
    const direct = await depsOf(sys.type, sys.name);
    if (!direct) return workspaceLibs.filter((lib) => sys.type !== "lib" || lib !== sys.name);
    const reached = new Set<string>();
    const queue = [...direct];
    while (queue.length) {
      const lib = queue.shift();
      if (!lib || reached.has(lib) || (sys.type === "lib" && lib === sys.name)) continue;
      reached.add(lib);
      queue.push(...((await depsOf("lib", lib)) ?? []));
    }
    return [...reached];
  }

  static async #srvkitExports(sys: Sys, scope: { type: "app" | "lib"; name: string }) {
    const dir = `${scope.type}s/${scope.name}/srvkit`;
    const files = (await sys.workspace.readdir(dir)).filter(
      (file) => /\.tsx?$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file) && file !== "index.ts",
    );
    const specifier = `@${scope.type}s/${scope.name}/srvkit`;
    const contents = await Promise.all(files.map((file) => sys.workspace.readFile(`${dir}/${file}`)));
    return contents.flatMap((content) =>
      [...content.matchAll(/export class ([A-Z][A-Za-z0-9_]*)\s+implements\s+([^{]+)\{/g)].flatMap((match) => {
        const implemented = (match[2] ?? "").split(",").map((name) => name.replace(/<.*$/s, "").trim());
        const kind = implemented.includes("Guard")
          ? "Guard"
          : implemented.includes("InternalArg")
            ? "InternalArg"
            : null;
        return kind && match[1] ? [{ kind, name: match[1], specifier }] : [];
      }),
    );
  }
}
