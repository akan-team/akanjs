interface LayeredRoute<Render> {
  /** The tree segment: `/`, `/:lang`, `/(group)`, `/foo`. */
  path: string;
  renderLayout?: Render;
  /** A generated `__root_layout`: one of the root boundaries the page generator found. */
  isRootLayout?: boolean;
  renderOverrides?: Render;
  /** `false` for a named page file, which sits beside its directory's layout rather than under it. */
  pageIncludesOwnLayout?: boolean;
}

export interface RouteLayer<Render> {
  /** The URL pattern down to this node; a route group adds nothing to it. */
  path: string;
  pathSegments: string[];
  isRoot: boolean;
  /** The root layout above or at this node, overrides left out: once there is one, nothing below is a root. */
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

  //? The root layout is the first generated `__root_layout` from the top, the one boundary the generator gives
  //? `System.Provider`: in CSR that provider renders the pages in its own frame and hides whatever it wraps, so a
  //? layout under it at the root (`page/(app)/(public)/_layout.tsx`, a nested boundary) would wrap no page. The nodes
  //? above it hold no layout of their own; their overrides stay outside it.
  static of<Render>(route: LayeredRoute<Render>, parent: RouteLayer<Render> | null): RouteLayer<Render> {
    const parentSegments = parent?.pathSegments ?? [];
    const parentRootLayouts = parent?.rootLayouts ?? [];
    const parentRootRenders = parent?.renderRootLayouts ?? [];
    const parentLayouts = parent?.renderLayouts ?? [];
    const segment = RouteLayering.#group.test(route.path) ? "" : route.path;
    const path = parentSegments.filter((part) => part !== "/").join("") + segment;
    const isRoot = parentRootLayouts.length === 0 && (route.isRootLayout === true || !route.renderLayout);
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
