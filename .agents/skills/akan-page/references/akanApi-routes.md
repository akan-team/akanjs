<!-- akan:generated -->

# Akan.js API reference

Generated from the akanjs sources of this release: the import paths and signatures a first app needs, so none of
them has to be looked up in `node_modules`. A stage's return type is the same chain, left out below.

## Routes (`page/`)

### `page` · `akanjs/client`

```ts
page(): PageDefinition<Record<never, never>, Record<never, never>>
```

### `layout` · `akanjs/client`

```ts
layout(): LayoutDefinition<Record<never, never>>
```

### `rootLayout` · `akanjs/client`

```ts
rootLayout(): RootLayoutDefinition<Record<never, never>>
```

### `RouteBaseArgs`

```ts
lang: string;
```

### `router` · `akanjs/client`

```ts
.push(href: string, routeOptions?: RouteOptions)
.replace(href: string, routeOptions?: RouteOptions)
.canGoBack()
.backOrFallback(fallbackHref?: string, routeOptions?: RouteOptions)
.backOrReplace(href: string, routeOptions?: RouteOptions)
.back(routeOptions?: RouteOptions)
.refresh()
.redirect(target: string, options?: RedirectOptions)
.notFound()
.getPath(pathname?: string)
```

### `RouteOptions`

```ts
scrollToTop?: boolean;
/** Writes the URL and the store's path and search params without asking the server for the page, as for `?peek=`; honoured only when the path stays the same. */
shallow?: boolean;
/** Lets an absolute URL on another origin through; without it the router refuses one, so a `?redirect=` handed on unchecked cannot send a visitor off-site. */
external?: boolean;
```

### `Link` · `akanjs/ui`

```ts
Link({ className, href, disabled, children, ...props }: CommonLinkProps): Element
Link.Back({ className, children, fallback }: BackProps): Element
Link.Close({ className, children }: ActionProps): Element
Link.Lang({ className, lang, children }: LangProps): Element
```

### `CommonLinkProps`

Every prop of `Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">`, and:

```ts
/** Omitted, or with `disabled`, Link renders a plain div around the same children. */
href?: string;
disabled?: boolean;
scrollToTop?: boolean;
/** Replaces the current history entry instead of pushing a new one. */
replace?: boolean;
/** Applied while the current page is `href` or below it, or exactly `href` with `activeExact`; basePath-aware. */
activeClassName?: string;
activeExact?: boolean;
/** More paths under which the link counts as active, as a tab does for its detail pages. */
activeMatch?: string[];
/** Applied, with `data-pending`, while a page this link would be active on loads; never for one already held. */
pendingClassName?: string;
noCache?: boolean;
/** `"hover"` (the default, or `true`) loads the page on hover or keyboard focus, `"viewport"` also once it shows. */
prefetch?: LinkPrefetch;
```

### `usePageLocation` · `akanjs/webkit`

```ts
usePageLocation(): { pathname: string; params: { [key: string]: string; }; searchParams: BaseSearchParamsState; }
type BaseSearchParamsState = { [key: string]: string | string[]; }
```

### Route stages

Shared by `page()`, `layout()` and `rootLayout()`:

```ts
.param<Name extends string, Type extends RouteArgType>(name: Name & FreeName<Name, Record<never, never>>, type: Type, option?: RouteArgOption)
.search<Name extends string, Type extends RouteSearchType>(name: Name & FreeName<Name, Record<never, never>>, type: Type, option?: RouteArgOption)
.render(render: (args: RouteBaseArgs) => PromiseOrObject<ReactNode>)
.config(config: PageConfig)
.head(head: HeadStage<RouteBaseArgs>)
.guard(guard: (args: RouteBaseArgs, request: RouteGuardRequest) => void | Promise<void>)
.loading(render: (args: RouteBaseArgs) => PromiseOrObject<ReactNode>, { atPress }?: RouteLoadingOption)
```

Only on `page()`:

```ts
.prompt(name: string, description: string)
.app<Name extends string>(name: Name & FreeName<Name, Record<never, never>>, description: string, load: (args: RouteBaseArgs) => PromiseOrObject<ReactNode>, option?: { static?: boolean; })
```

On `layout()` and `rootLayout()`, where a line replaces its shared form above:

```ts
interface LayoutExtra { children: ReactNode; }
.param<Name extends string, Type extends RouteArgType>(name: Name, type: Type, option?: RouteArgOption)
.search<Name extends string, Type extends RouteSearchType>(name: Name, type: Type, option?: RouteArgOption)
.notFound(render: LayoutNotFoundRender)
.error(render: LayoutErrorRender)
.loading(render: (args: RouteBaseArgs & LayoutExtra) => PromiseOrObject<ReactNode>, { atPress }?: RouteLoadingOption)
.render(render: (args: RouteBaseArgs & LayoutExtra) => PromiseOrObject<ReactNode>)
```

Only on `rootLayout()`, before `.param()` and `.search()`:

```ts
.fonts(fonts: ReactFont[])
.manifest(manifest: WebAppManifest)
.theme(theme: string)
.reconnect(on?: boolean)
.wsConnect(on?: boolean)
.layoutStyle(style: "mobile" | "web")
.viewport(viewport: RouteViewport)
```
