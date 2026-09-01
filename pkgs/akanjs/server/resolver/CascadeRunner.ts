import { AsyncLocalStorage } from "node:async_hooks";
import { LIBS_REMOVE_HOOK } from "akanjs/base";
import { Logger } from "akanjs/common";
import { type CascadeWithPath, type ConstantModel, ConstantRegistry } from "akanjs/constant";
import { type DocumentSchema, documentQueryHelper } from "akanjs/document";
import type { DatabaseService, ServiceCls } from "akanjs/service";

/** A relation the removed document owns: the ids it holds name documents to remove. */
interface RefEdge {
  readonly key: string;
  readonly refName: string;
}

/** A model that declared itself removable with this one: its rows name the removed document as their owner. */
interface WithEdge {
  readonly refName: string;
  readonly key: string;
  readonly typeKey: string | null;
}

interface CascadeModule {
  readonly constant: ConstantModel;
  readonly schema: DocumentSchema;
  readonly srvRef: ServiceCls;
}

interface CascadePlan {
  readonly refEdges: RefEdge[];
  readonly withEdges: WithEdge[];
}

/** One cascade in flight. Shared down the chain so a cycle is caught wherever it closes. */
interface CascadeContext {
  readonly seen: Set<string>;
  readonly depth: number;
}

/** How deep one removal may cascade before the chain is treated as runaway and abandoned. */
const maxDepth = 16;
/** Ids taken per query while draining children one document at a time. */
const drainSize = 200;

export class CascadeRunner {
  readonly #modules = new Map<string, CascadeModule>();
  readonly #plans = new Map<string, CascadePlan>();
  readonly #bulk = new Set<string>();
  readonly #context = new AsyncLocalStorage<CascadeContext>();
  readonly #logger = new Logger("Cascade");
  #getService: ((refName: string) => DatabaseService) | null = null;

  register(constant: ConstantModel, schema: DocumentSchema, srvRef: ServiceCls) {
    this.#modules.set(constant.refName, { constant, schema, srvRef });
  }

  /**
   * Called once every service is live. A `_postRemove` and a `listenPost("remove")` registered during boot both
   * count against bulk removal, so the strategy cannot be decided before the last service has initialized.
   */
  seal(getService: (refName: string) => DatabaseService) {
    this.#getService = getService;
    for (const [refName, mod] of this.#modules) {
      this.#plans.set(refName, { refEdges: this.#collectRefEdges(refName, mod), withEdges: [] });
    }
    for (const [refName, mod] of this.#modules) this.#collectWithEdges(refName, mod);
    for (const refName of this.#modules.keys()) {
      if (this.#hasRemoveSideEffect(refName)) continue;
      this.#bulk.add(refName);
    }
    this.#report();
  }

  async run(refName: string, doc: Record<string, unknown>) {
    const plan = this.#plans.get(refName);
    if (!plan?.refEdges.length && !plan?.withEdges.length) return;
    const parent = this.#context.getStore();
    const seen = parent?.seen ?? new Set<string>();
    const depth = (parent?.depth ?? 0) + 1;
    const id = typeof doc.id === "string" ? doc.id : null;
    if (id) seen.add(`${refName}:${id}`);
    if (depth > maxDepth) {
      this.#logger.error(`Cascade from ${refName} exceeded depth ${maxDepth} and was abandoned`);
      return;
    }
    await this.#context.run({ seen, depth }, async () => {
      for (const edge of plan.refEdges) await this.#removeRef(edge, doc, seen);
      if (id) for (const edge of plan.withEdges) await this.#removeWith(edge, refName, id, seen);
    });
  }

  async #removeRef(edge: RefEdge, doc: Record<string, unknown>, seen: Set<string>) {
    const value = doc[edge.key];
    const ids = (Array.isArray(value) ? value : [value]).filter(
      (item): item is string => typeof item === "string" && !seen.has(`${edge.refName}:${item}`),
    );
    if (!ids.length) return;
    const service = this.#service(edge.refName);
    if (this.#bulk.has(edge.refName)) {
      await service.__removeMany({ id: documentQueryHelper.oneOf(ids) });
      return;
    }
    // Through the target's own service, never its model: that is what runs its `_postRemove`, which is where a
    // module puts the side effect that has to accompany the removal — deleting the stored object, say.
    for (const id of ids) await service.__remove(id);
  }

  async #removeWith(edge: WithEdge, ownerRef: string, ownerId: string, seen: Set<string>) {
    const service = this.#service(edge.refName);
    const query = edge.typeKey ? { [edge.key]: ownerId, [edge.typeKey]: ownerRef } : { [edge.key]: ownerId };
    if (this.#bulk.has(edge.refName)) {
      await service.__removeMany(query);
      return;
    }
    // A removed child drops out of the query, so each pass takes the next page. A pass that removes nothing means
    // every remaining match was already visited by this cascade, and looping again would never end.
    for (;;) {
      const ids = await service.__listIds(query, { limit: drainSize });
      if (!ids.length) return;
      let removed = 0;
      for (const id of ids) {
        if (seen.has(`${edge.refName}:${id}`)) continue;
        await service.__remove(id);
        removed += 1;
      }
      if (!removed) return;
    }
  }

  #collectRefEdges(refName: string, mod: CascadeModule) {
    return [...mod.constant.full.cascade.removeRef].map(([key, modelRef]) => {
      const target = ConstantRegistry.getRefName(modelRef);
      // Cascading into a module the app never mounted is a misconfiguration. Every service is live by now, so
      // saying so at boot costs nothing and beats discovering it on the first removal, half-way through one.
      if (!this.#modules.has(target)) {
        throw new Error(`Cascade field "${refName}.${key}" removes "${target}", which this app does not mount`);
      }
      return { key, refName: target };
    });
  }

  #collectWithEdges(childRef: string, mod: CascadeModule) {
    for (const [key, path] of mod.constant.full.cascade.removeWith) {
      for (const owner of this.#resolveOwners(childRef, key, path)) {
        this.#plans.get(owner)?.withEdges.push({ refName: childRef, key, typeKey: path.typeKey });
      }
    }
  }

  #resolveOwners(childRef: string, key: string, path: CascadeWithPath) {
    if (path.typeValues.length) {
      // A polymorphic owner list spans optional modules by design, so an unmounted candidate is a mount choice
      // rather than a typo — the rows it would have owned simply never cascade.
      const mounted = path.typeValues.filter((owner) => this.#modules.has(owner));
      for (const owner of path.typeValues) {
        if (mounted.includes(owner)) continue;
        this.#logger.warn(`Cascade field "${childRef}.${key}" names owner "${owner}", which this app does not mount`);
      }
      return mounted;
    }
    const owner = path.refName ?? ConstantRegistry.getRefName(path.modelRef as never);
    if (!this.#modules.has(owner)) {
      throw new Error(`Cascade field "${childRef}.${key}" is owned by "${owner}", which this app does not mount`);
    }
    return [owner];
  }

  /** Everything a bulk `removeMany` would skip. All of it absent means the two paths leave the same rows behind. */
  #hasRemoveSideEffect(refName: string) {
    const mod = this.#modules.get(refName);
    if (!mod) return true;
    if (mod.schema.preHooks.get("remove")?.length || mod.schema.postHooks.get("remove")?.length) return true;
    if ((mod.srvRef as unknown as { [LIBS_REMOVE_HOOK]?: boolean })[LIBS_REMOVE_HOOK]) return true;
    const proto = mod.srvRef.prototype as { _preRemove?: unknown; _postRemove?: unknown };
    if (typeof proto._preRemove === "function" || typeof proto._postRemove === "function") return true;
    const plan = this.#plans.get(refName);
    return !!plan?.refEdges.length || !!plan?.withEdges.length;
  }

  /** Neither the strategy nor the edge list is visible from the source, and adding a `_postRemove` to a target
   * silently flips it from one query back to one per document. A quiet cascade is the one nobody can explain. */
  #report() {
    const lines: string[] = [];
    for (const [refName, plan] of this.#plans) {
      for (const edge of plan.refEdges) {
        lines.push(`${refName}.${edge.key} removeRef ${edge.refName} (${this.#strategy(edge.refName)})`);
      }
      for (const edge of plan.withEdges) {
        const path = edge.typeKey ? `${edge.key}+${edge.typeKey}` : edge.key;
        lines.push(`${refName} removeWith ${edge.refName}.${path} (${this.#strategy(edge.refName)})`);
      }
    }
    if (!lines.length) return;
    const bulk = lines.filter((line) => line.endsWith("(bulk)")).length;
    this.#logger.verbose(`${lines.length} cascade edge(s), ${bulk} in one query`);
    for (const line of lines) this.#logger.verbose(line);
  }

  #strategy(refName: string) {
    return this.#bulk.has(refName) ? "bulk" : "per document";
  }

  #service(refName: string) {
    if (!this.#getService) throw new Error(`Cascade ran before the plan was sealed: ${refName}`);
    return this.#getService(refName);
  }
}
