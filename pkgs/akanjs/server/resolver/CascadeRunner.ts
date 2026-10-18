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

interface CascadeContext {
  readonly seen: Set<string>;
  readonly depth: number;
}

const maxDepth = 16;
const drainSize = 200;

export class CascadeRunner {
  readonly #modules = new Map<string, CascadeModule>();
  readonly #plans = new Map<string, CascadePlan>();
  readonly #anyEdges: WithEdge[] = [];
  readonly #bulk = new Set<string>();
  readonly #context = new AsyncLocalStorage<CascadeContext>();
  readonly #logger = new Logger("Cascade");
  #getService: ((refName: string) => DatabaseService) | null = null;

  register(constant: ConstantModel, schema: DocumentSchema, srvRef: ServiceCls) {
    this.#modules.set(constant.refName, { constant, schema, srvRef });
  }

  // Only once every service is live: a boot-time `_postRemove` or `listenPost("remove")` also rules out bulk removal.
  seal(getService: (refName: string) => DatabaseService) {
    this.#getService = getService;
    for (const [refName, mod] of this.#modules) {
      this.#plans.set(refName, { refEdges: this.#collectRefEdges(refName, mod), withEdges: [] });
    }
    for (const [refName, mod] of this.#modules) this.#collectWithEdges(refName, mod);
    for (const [refName, mod] of this.#modules) {
      if (!this.#hasRemoveSideEffect(refName, mod)) this.#bulk.add(refName);
    }
    this.#report();
  }

  async run(refName: string, doc: Record<string, unknown>) {
    const plan = this.#plans.get(refName);
    if (!plan) return;
    if (!plan.refEdges.length && !plan.withEdges.length && !this.#anyEdges.length) return;
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
      if (!id) return;
      for (const edge of plan.withEdges) await this.#removeWith(edge, refName, id, seen);
      for (const edge of this.#anyEdges) await this.#removeWith(edge, refName, id, seen);
    });
  }

  async #removeRef(edge: RefEdge, doc: Record<string, unknown>, seen: Set<string>) {
    const value = doc[edge.key];
    const ids = [...new Set(Array.isArray(value) ? value : [value])].filter(
      (item): item is string => typeof item === "string" && !seen.has(`${edge.refName}:${item}`),
    );
    if (!ids.length) return;
    const service = this.#service(edge.refName);
    if (this.#bulk.has(edge.refName)) {
      await service.__removeMany({ id: documentQueryHelper.oneOf(ids) });
      return;
    }
    // Through the target's service, never its model: only that path runs the `_postRemove` side effects.
    for (const id of ids) {
      // Mark on removal, not up front: a repeat finds no live row, and a nested drain stops at a page of marked rows.
      if (seen.has(`${edge.refName}:${id}`)) continue;
      seen.add(`${edge.refName}:${id}`);
      await service.__remove(id);
    }
  }

  async #removeWith(edge: WithEdge, ownerRef: string, ownerId: string, seen: Set<string>) {
    const service = this.#service(edge.refName);
    const query = edge.typeKey ? { [edge.key]: ownerId, [edge.typeKey]: ownerRef } : { [edge.key]: ownerId };
    if (this.#bulk.has(edge.refName)) {
      await service.__removeMany(query);
      return;
    }
    // Removed rows leave the query; a pass that removes nothing has only visited rows left and would loop forever.
    for (;;) {
      const ids = await service.__listIds(query, { limit: drainSize });
      if (!ids.length) return;
      let removed = 0;
      for (const id of ids) {
        if (seen.has(`${edge.refName}:${id}`)) continue;
        seen.add(`${edge.refName}:${id}`);
        await service.__remove(id);
        removed += 1;
      }
      if (!removed) return;
    }
  }

  #collectRefEdges(refName: string, mod: CascadeModule) {
    return [...mod.constant.full.cascade.removeRef].map(([key, modelRef]) => {
      const target = ConstantRegistry.getRefName(modelRef);
      if (!this.#modules.has(target)) {
        throw new Error(`Cascade field "${refName}.${key}" removes "${target}", which this app does not mount`);
      }
      return { key, refName: target };
    });
  }

  #collectWithEdges(childRef: string, mod: CascadeModule) {
    for (const [key, path] of mod.constant.full.cascade.removeWith) {
      if (path.anyOwner) {
        this.#anyEdges.push({ refName: childRef, key, typeKey: path.typeKey });
        continue;
      }
      for (const owner of this.#resolveOwners(childRef, key, path)) {
        this.#plans.get(owner)?.withEdges.push({ refName: childRef, key, typeKey: path.typeKey });
      }
    }
  }

  #resolveOwners(childRef: string, key: string, path: CascadeWithPath) {
    if (path.typeValues.length) {
      // A polymorphic owner list spans optional modules, so an unmounted owner is a mount choice (warn), not a typo.
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

  // Must cover everything a bulk `removeMany` skips: with none of it present, both paths leave the same rows behind.
  #hasRemoveSideEffect(refName: string, mod: CascadeModule) {
    // A wildcard child may name any model as its owner, so any query-level removal would skip its children.
    if (this.#anyEdges.length) return true;
    if (mod.schema.preHooks.get("remove")?.length || mod.schema.postHooks.get("remove")?.length) return true;
    if ((mod.srvRef as unknown as { [LIBS_REMOVE_HOOK]?: boolean })[LIBS_REMOVE_HOOK]) return true;
    const proto = mod.srvRef.prototype as { _preRemove?: unknown; _postRemove?: unknown };
    if (typeof proto._preRemove === "function" || typeof proto._postRemove === "function") return true;
    const plan = this.#plans.get(refName);
    return !!plan?.refEdges.length || !!plan?.withEdges.length;
  }

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
    for (const edge of this.#anyEdges) {
      lines.push(`<any> removeWith ${edge.refName}.${edge.key}+${edge.typeKey} (${this.#strategy(edge.refName)})`);
    }
    if (!lines.length) return;
    const bulk = lines.filter((line) => line.endsWith("(bulk)")).length;
    this.#logger.verbose(`${lines.length} cascade edge(s), ${bulk} in one query`);
    for (const line of lines) this.#logger.verbose(line);
    if (!this.#anyEdges.length) return;
    const wildcards = this.#anyEdges.map((edge) => `${edge.refName}.${edge.key}`).join(", ");
    this.#logger.verbose(
      `${this.#anyEdges.length} wildcard removeWith edge(s) (${wildcards}): every removal probes them, ` +
        `and no cascade removes in one query`,
    );
  }

  #strategy(refName: string) {
    return this.#bulk.has(refName) ? "bulk" : "per document";
  }

  #service(refName: string) {
    if (!this.#getService) throw new Error(`Cascade ran before the plan was sealed: ${refName}`);
    return this.#getService(refName);
  }
}
