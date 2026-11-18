import { AkanError, getEnv } from "akanjs/base";
import type { Logger } from "akanjs/common";
import {
  type DiModuleCandidate,
  getModuleCascadeRefNames,
  getModuleDependencyRefNames,
  getModuleRelationRefNames,
} from "./utils";

export interface ModuleSelectionOptions {
  modules: string[];
  enableModules: string[];
  disableModules: string[];
  disableLibs: string[];
}

interface ModuleSelectionSource {
  candidates: Map<string, DiModuleCandidate>;
  moduleLibs: Map<string, string>;
  libNames: string[];
  builtinRefNames: string[];
  logger: Logger;
}

export class ModuleSelection {
  readonly #candidates: Map<string, DiModuleCandidate>;
  readonly #moduleLibs: Map<string, string>;
  readonly #libNames: string[];
  readonly #known: Set<string>;
  readonly #logger: Logger;

  constructor({ candidates, moduleLibs, libNames, builtinRefNames, logger }: ModuleSelectionSource) {
    this.#candidates = candidates;
    this.#moduleLibs = moduleLibs;
    this.#libNames = libNames;
    this.#known = new Set([...candidates.keys(), ...builtinRefNames]);
    this.#logger = logger;
  }

  static isOwnGate(reason: string) {
    return reason === "service disabled" || reason.startsWith("operationMode ");
  }

  disabledReasons({ modules, enableModules, disableModules, disableLibs }: ModuleSelectionOptions) {
    const candidates = this.#candidates;
    const disabledReasons = new Map<string, string>();
    const forced = this.#resolveForcedModules(this.#expandSelectors(enableModules, "enableModules"));

    const { operationMode } = getEnv();
    candidates.forEach(({ refName, module }) => {
      if (forced.has(refName)) return;
      const modes = module.service.srv.operationMode;
      if (modes && !modes.includes(operationMode))
        disabledReasons.set(refName, `operationMode "${operationMode}" is not in [${modes.join(", ")}]`);
      else if (!module.service.srv.enabled) disabledReasons.set(refName, "service disabled");
    });

    // Applied over the enabled set rather than beside it: naming a module the workspace disabled does not enable it.
    const selected = this.#resolveSelectedModules(this.#expandSelectors(modules, "modules"));
    if (selected) {
      candidates.forEach(({ refName }) => {
        if (!selected.has(refName) && !disabledReasons.has(refName))
          disabledReasons.set(refName, 'not named by the "modules" option');
      });
    }

    const excluded = this.#resolveExcludedModules(this.#expandSelectors(disableModules, "disableModules"), disableLibs);
    // Last, so it wins over a selection: `modules` says what a process is for, the exclusions what it must not run.
    excluded.forEach((reason, refName) => {
      if (!disabledReasons.has(refName)) disabledReasons.set(refName, reason);
    });
    const excludedClosure = new Set(excluded.keys());

    let changed = true;
    while (changed) {
      changed = false;
      candidates.forEach(({ refName, module }) => {
        if (disabledReasons.has(refName)) return;
        const reached = [
          ...[...getModuleDependencyRefNames(module)].map((target) => ["depends on", target] as const),
          ...[...getModuleRelationRefNames(module)].map((target) => ["relates to", target] as const),
        ];
        for (const [link, dependencyRefName] of reached) {
          if (dependencyRefName === refName) continue;
          const dependencyReason = disabledReasons.get(dependencyRefName);
          if (!dependencyReason) continue;
          disabledReasons.set(refName, `${link} disabled module "${dependencyRefName}"`);
          if (excludedClosure.has(dependencyRefName)) excludedClosure.add(refName);
          changed = true;
          break;
        }
      });
    }

    disabledReasons.forEach((reason, refName) => {
      this.#logger.verbose(`Skipping disabled module "${refName}": ${reason}`);
    });
    const cascaded = [...excludedClosure]
      .filter((refName) => !excluded.has(refName))
      .sort((a, b) => a.localeCompare(b));
    if (cascaded.length) {
      const option = [disableModules.length && "disableModules", disableLibs.length && "disableLibs"]
        .filter(Boolean)
        .join("/");
      this.#logger.info(`${option} also dropped ${cascaded.length} dependent module(s): ${cascaded.join(", ")}`);
    }
    return disabledReasons;
  }

  // Unknown names throw: a typo would leave the module off and its test failing on a missing route.
  #resolveForcedModules(enableModules: string[]) {
    if (enableModules.length)
      ModuleSelection.#assertKnown(enableModules, this.#known, "[DI:enableModules] unknown module", "Registered");
    return new Set(enableModules);
  }

  // Unknown names throw: a typo here would keep a module running silently.
  #resolveExcludedModules(disableModules: string[], disableLibs: string[]) {
    const candidates = this.#candidates;
    const excluded = new Map<string, string>();
    if (disableModules.length) {
      ModuleSelection.#assertKnown(disableModules, this.#known, "[DI:disableModules] unknown module", "Registered");
      disableModules.forEach((refName) => {
        if (candidates.has(refName)) excluded.set(refName, 'named by the "disableModules" option');
      });
    }
    if (disableLibs.length) {
      // Every mounted lib counts: one carrying only scalars or an `option.ts` is a legitimate name.
      const known = new Set(this.#libNames);
      ModuleSelection.#assertKnown(disableLibs, known, "[DI:disableLibs] unknown lib", "Mounted");
      const excludedLibs = new Set(disableLibs);
      this.#moduleLibs.forEach((libName, refName) => {
        if (!excludedLibs.has(libName) || !candidates.has(refName) || excluded.has(refName)) return;
        excluded.set(refName, `in lib "${libName}", named by the "disableLibs" option`);
      });
    }
    return excluded;
  }

  // Unknown names throw: a typo would otherwise boot with the module silently missing.
  #resolveSelectedModules(modules: string[]) {
    if (!modules.length) return null;
    const candidates = this.#candidates;
    ModuleSelection.#assertKnown(modules, this.#known, "[DI:modules] unknown module", "Registered");
    const selected = new Set<string>();
    const pending = modules.filter((refName) => candidates.has(refName));
    while (pending.length) {
      const refName = pending.pop();
      if (!refName || selected.has(refName)) continue;
      selected.add(refName);
      const candidate = candidates.get(refName);
      if (!candidate) continue;
      const dependencies = [
        ...getModuleDependencyRefNames(candidate.module),
        ...getModuleCascadeRefNames(candidate.module),
        ...getModuleRelationRefNames(candidate.module),
      ];
      for (const dependency of dependencies) if (candidates.has(dependency)) pending.push(dependency);
    }
    const mounted = [...selected].sort((a, b) => a.localeCompare(b)).join(", ");
    this.#logger.debug(`Mounting ${selected.size} of ${candidates.size} module(s): ${mounted}`);
    return selected;
  }

  //* `@<operationMode>` names every module whose serve() lists that mode, so a new one joins without editing a list.
  #expandSelectors(names: string[], option: string) {
    return [
      ...new Set(
        names.flatMap((name) => {
          if (!name.startsWith("@")) return [name];
          const mode = name.slice(1);
          const tagged = [...this.#candidates.values()]
            .filter(({ module }) => module.service.srv.operationMode?.includes(mode))
            .map(({ refName }) => refName);
          if (!tagged.length)
            throw new AkanError(
              "invalidConfig",
              `[DI:${option}] "${name}" names no module: no serve() in this app or its libs lists operationMode "${mode}".`,
            );
          return tagged;
        }),
      ),
    ];
  }

  static #assertKnown(names: string[], known: Set<string>, unknownLabel: string, knownLabel: string) {
    const unknown = names.filter((name) => !known.has(name));
    if (!unknown.length) return;
    const listed = [...known].sort((a, b) => a.localeCompare(b)).join(", ");
    throw new AkanError(
      "invalidConfig",
      `${unknownLabel} ${unknown.map((name) => `"${name}"`).join(", ")}. ${knownLabel}: ${listed}`,
    );
  }
}
