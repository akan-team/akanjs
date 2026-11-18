import { STATE_DERIVED_META } from "akanjs/base";
import type { ContextBlock, PublishedResource, PublishedScope, ResourceDiff, SurfaceView } from "use-agentic";
import { InlineToken } from "../../common/inlineToken";
import type { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { AgentBridge } from "./AgentBridge";
import { AgentInline } from "./AgentInline";
import { ensureStoreSurface } from "./StoreSurfaceSource";

/** A turn's default context: route, on-screen scopes, and live keys (one-token values inline, the rest by name). */
export class AgentContext {
  static readonly withheldNote = "Free text is left out. Call readState(key) with a key of `withheld` to read it.";
  static readonly screenNote =
    "Labels left out are text on the page. Call readScreen with `section` set to a scope's path to read them.";
  static readonly resourceNote =
    "A resource marked `withheld` holds free text. Call readState with the resource's name to read all of it.";

  static of(): AgentContext {
    return new AgentContext(StoreRegistry.instance, ensureStoreSurface().bridge);
  }

  /** A pathname as the route block carries it: a segment of free text, or one past twelve words, reads `…`. */
  static routePath(pathname: string): string {
    return AgentInline.path(pathname);
  }

  //? Security: a change report follows the screen block's rule, or one write hands the model the free text it left out.
  static reported(view: SurfaceView): SurfaceView {
    return {
      snapshot: () => view.snapshot(),
      tool: (name) => view.tool(name),
      call: (name, args) => view.call(name, args),
      read: (name) => view.read(name),
      diffSince: (before) => AgentContext.#changes(view.diffSince(before), view.snapshot().scopes),
      subscribe: (listener) => view.subscribe(listener),
    };
  }

  readonly #instance: StoreInstance;
  readonly #bridge: AgentBridge;

  constructor(instance: StoreInstance, bridge: AgentBridge) {
    this.#instance = instance;
    this.#bridge = bridge;
  }

  blocks(surface: SurfaceView, view: string[] = []): ContextBlock[] {
    const { scopes, resources } = surface.snapshot();
    return [this.#routeBlock(), ...AgentContext.#screenBlock(scopes, resources), ...this.#liveBlock(view.join("."))];
  }

  #routeBlock(): ContextBlock {
    const state = this.#instance.get();
    const [pathKey, paramsKey, searchKey] = AgentBridge.routeKeys;
    const pathname = String(state[pathKey] ?? "");
    const path = AgentInline.path(pathname);
    const params = AgentInline.params(state[paramsKey]);
    const searchParams = AgentInline.search(state[searchKey], AgentContext.#declaredSearch());
    const withheld = [
      ...(path === pathname ? [] : [pathKey]),
      ...(params.withheld ? [paramsKey] : []),
      ...(searchParams.withheld ? [searchKey] : []),
    ];
    return {
      kind: "route",
      path,
      params: params.inline,
      searchParams: searchParams.inline,
      ...(withheld.length ? { withheld } : {}),
      ...(searchParams.withheld ? { searchParamsWithheld: searchParams.withheld } : {}),
      ...(withheld.length ? { note: AgentContext.withheldNote } : {}),
    };
  }

  static #declaredSearch(): Set<string> {
    const stores = [...StoreRegistry.stores.values()];
    return new Set(
      stores.flatMap((store) => Object.values(store[STATE_DERIVED_META].search).map((meta) => meta.paramKey)),
    );
  }

  //? A `Load` scope's label is its record's title and its `items` are its rows' titles, both drawn inside the scope,
  //? so `readScreen` returns what is left out here. No element draws a zone's label, so `readScreen` of the zone
  //? leads with it, and `readState` answers a value published with `st.expose` or `st.useState` by its name.
  static #screenBlock(scopes: PublishedScope[], resources: PublishedResource[]): ContextBlock[] {
    if (!scopes.length && !resources.length) return [];
    const lists = new Set(scopes.map((scope) => `${scope.path}.items`));
    let labelled = true;
    let valued = true;
    const shown = scopes.map(({ path, label, kind }) => {
      const kept = InlineToken.is(label);
      if (label !== undefined && !kept) labelled = false;
      return { path, ...(kept ? { label } : {}), ...(kind ? { kind } : {}) };
    });
    const listed = resources.map((resource) => {
      const rows = lists.has(resource.name) ? AgentContext.#rowsOf(resource.value) : null;
      if (rows) {
        if (!rows.whole) labelled = false;
        return { ...resource, value: rows.value };
      }
      const inlined = AgentContext.#inlined(resource);
      if (inlined.withheld) valued = false;
      return inlined;
    });
    const notes = [...(labelled ? [] : [AgentContext.screenNote]), ...(valued ? [] : [AgentContext.resourceNote])];
    return [{ kind: "screen", scopes: shown, resources: listed, ...(notes.length ? { note: notes.join(" ") } : {}) }];
  }

  static #changes(diffs: ResourceDiff[], scopes: PublishedScope[]): ResourceDiff[] {
    const lists = new Set(scopes.map((scope) => `${scope.path}.items`));
    return diffs.map((diff) => {
      const rows = lists.has(diff.name) ? AgentContext.#rowsOf(diff.value) : null;
      if (!rows) return AgentContext.#inlined(diff);
      return { ...diff, value: rows.value, ...(rows.whole ? {} : { withheld: true }) };
    });
  }

  static #inlined<Named extends { name: string; value?: unknown; error?: string }>(resource: Named) {
    const { value, error, ...named } = resource;
    const inline = AgentInline.value(value);
    const failed = error !== undefined && !InlineToken.is(error);
    return {
      ...named,
      ...(inline.value !== undefined ? { value: inline.value } : {}),
      ...(error !== undefined && !failed ? { error } : {}),
      ...(inline.whole && !failed ? {} : { withheld: true }),
    };
  }

  static #rowsOf(value: unknown): { value: unknown; whole: boolean } | null {
    if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) return null;
    const items: unknown[] = value.items;
    let whole = true;
    const rows = (items as ({ id?: unknown; label?: unknown } | null)[]).flatMap((item) => {
      if (!InlineToken.is(item?.id)) {
        whole = false;
        return [];
      }
      const labelled = item?.label !== undefined;
      const kept = labelled && InlineToken.is(item.label);
      if (labelled && !kept) whole = false;
      return [{ id: item.id, ...(kept ? { label: item.label } : {}) }];
    });
    return { value: { ...value, items: rows }, whole };
  }

  #liveBlock(viewKey: string): ContextBlock[] {
    const live = this.#bridge.readableKeys(viewKey).map((key) => this.#liveEntry(key));
    return live.length ? [{ kind: "state", live, note: "Call readState(key) to read a value." }] : [];
  }

  #liveEntry(key: string) {
    const meta = this.#bridge.state[key];
    const value = AgentContext.#inlineValue(this.#instance.get()[key]);
    return {
      key,
      ...(meta?.refName ? { model: meta.refName } : {}),
      ...(meta ? { type: meta.type } : {}),
      ...(value !== undefined ? { value } : {}),
    };
  }

  static #inlineValue(value: unknown): unknown {
    if (value === null) return null;
    switch (typeof value) {
      case "string":
        return InlineToken.is(value) ? value : undefined;
      case "number":
      case "boolean":
        return value;
      default:
        return undefined;
    }
  }
}
