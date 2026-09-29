interface LayeredRoute<Render> {
  /** The tree segment: `/`, `/:lang`, `/(group)`, `/foo`. */
  path: string;
  renderLayout?: Render;
  renderOverrides?: Render;
  /** `false` for a named page file, which sits beside its directory's layout rather than under it. */
  pageIncludesOwnLayout?: boolean;
}

export interface RouteLayer<Render> {
  /** The URL pattern down to this node; a route group adds nothing to it. */
  path: string;
  pathSegments: string[];
  isRoot: boolean;
  /** The real root layouts from the top down to this node, overrides left out: what the depth limit counts. */
  rootLayouts: Render[];
  renderRootLayouts: Render[];
  renderLayouts: Render[];
  /** What a page file at this node renders inside: without this node's layout for a named page file. */
  pageRenderRootLayouts: Render[];
  pageRenderLayouts: Render[];
}

//* Which layouts of a route tree render as root layouts, around the page stack, and which render with each page. The
//* SSR route tree and the CSR route table both read it, so a page gets the same layouts on either side.
export class RouteLayering {
  static readonly #group = /^\/\(.*\)$/;

  //? A root layout sits on the app's own path (`/`, `/:lang`) or a basePath's (`/:lang/<basePath>`), and a route group
  //? adds nothing to the path, so `page/(app)/_layout.tsx` is the app's root. At most two deep: the app's, then a
  //? basePath's or a group's directly under it.
  static of<Render>(
    route: LayeredRoute<Render>,
    parent: RouteLayer<Render> | null,
    baseLayoutPaths: readonly string[],
  ): RouteLayer<Render> {
    const parentSegments = parent?.pathSegments ?? [];
    const parentRootLayouts = parent?.rootLayouts ?? [];
    const parentRootRenders = parent?.renderRootLayouts ?? [];
    const parentLayouts = parent?.renderLayouts ?? [];
    const segment = RouteLayering.#group.test(route.path) ? "" : route.path;
    const path = parentSegments.filter((part) => part !== "/").join("") + segment;
    const isRoot = baseLayoutPaths.includes(path) && parentRootLayouts.length < 2;
    const overrideRenders = route.renderOverrides ? [route.renderOverrides] : [];
    //? A manifest sits just outside its own directory's layout, never higher: hoisted above shared layouts, it would
    //? change the tree's top on crossing its boundary and remount the whole app.
    const nodeRenders = [...overrideRenders, ...(route.renderLayout ? [route.renderLayout] : [])];
    const pageNodeRenders = route.pageIncludesOwnLayout === false ? overrideRenders : nodeRenders;
    return {
      path,
      pathSegments: [...parentSegments, ...(segment ? [segment] : [])],
      isRoot,
      rootLayouts: isRoot && route.renderLayout ? [...parentRootLayouts, route.renderLayout] : parentRootLayouts,
      renderRootLayouts: isRoot ? [...parentRootRenders, ...nodeRenders] : parentRootRenders,
      renderLayouts: isRoot ? parentLayouts : [...parentLayouts, ...nodeRenders],
      pageRenderRootLayouts: isRoot ? [...parentRootRenders, ...pageNodeRenders] : parentRootRenders,
      pageRenderLayouts: isRoot ? parentLayouts : [...parentLayouts, ...pageNodeRenders],
    };
  }
}
