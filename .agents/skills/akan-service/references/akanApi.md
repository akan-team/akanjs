<!-- akan:generated -->

# Akan.js API reference

Generated from the akanjs sources of this release: the import paths and signatures a first app needs, so none of
them has to be looked up in `node_modules`. A stage's return type is the same chain, left out below.

## Imports

```ts
import { Any, Binary, dayjs, Float, ID, Int, Upload } from "akanjs/base";
import { layout, page, rootLayout, router } from "akanjs/client";
import { serviceDictionary } from "akanjs/dictionary";
import { adapt, serve } from "akanjs/service";
import { endpoint, internal, None, Public } from "akanjs/signal";
import { Link } from "akanjs/ui";
import { usePageLocation } from "akanjs/webkit";
import { fetch, usePage, <Model> } from "@apps/<app>/client"; // pages and UI
import * as cnst from "../cnst"; // inside lib/<module>/, beside srv and Err
import { Err } from "../dict";
import * as srv from "../srv";
import { BookApi } from "@apps/<app>/srvkit"; // a layer barrel: common, srvkit, ui, webkit
import { signedIn } from "@libs/shared/webkit"; // a workspace created with --libs true
```

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
```

### `CommonLinkProps`

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
noCache?: boolean;
```

### `usePageLocation` · `akanjs/webkit`

```ts
usePageLocation(): { pathname: string; params: { [key: string]: string; }; searchParams: BaseSearchParamsState; }
```

### Route stages

Shared by `page()`, `layout()` and `rootLayout()`:

```ts
.param<Name extends string, Type extends RouteArgType>(name: Name & FreeName<Name, Record<never, never>>, type: Type, option?: RouteArgOption)
.search<Name extends string, Type extends RouteSearchType>(name: Name & FreeName<Name, Record<never, never>>, type: Type, option?: RouteArgOption)
.render(render: (args: RouteBaseArgs) => PromiseOrObject<ReactNode>)
.config(config: PageConfig)
.head(head: HeadStage<RouteBaseArgs>)
.guard(guard: (args: RouteBaseArgs) => void | Promise<void>)
.loading(render: (args: RouteBaseArgs) => PromiseOrObject<ReactNode>)
```

Only on `page()`:

```ts
.prompt(name: string, description: string)
.app<Name extends string>(name: Name & FreeName<Name, Record<never, never>>, description: string, load: (args: RouteBaseArgs) => PromiseOrObject<ReactNode>)
```

On `layout()` and `rootLayout()`, where a line replaces its shared form above:

```ts
interface LayoutExtra { children: ReactNode; }
.param<Name extends string, Type extends RouteArgType>(name: Name, type: Type, option?: RouteArgOption)
.search<Name extends string, Type extends RouteSearchType>(name: Name, type: Type, option?: RouteArgOption)
.notFound(render: LayoutNotFoundRender)
.error(render: LayoutErrorRender)
.loading(render: (args: RouteBaseArgs & LayoutExtra) => PromiseOrObject<ReactNode>)
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

## Services and adapters (`lib/_<service>/`, `srvkit/`)

### `adapt` · `akanjs/service`

```ts
adapt<Name extends string>(name: Name): AdaptorCls<{}, Record<never, never>>
adapt<Name extends string, Injection extends InjectBuilder<"use" | "env" | "memory" | "plug">>(name: Name, injectBuilder: Injection): AdaptorCls<{}, ReturnType<Injection>>
```

### `serve` · `akanjs/service`

```ts
serve<RefName extends string, Injection extends InjectBuilder>(refName: RefName, injectBuilder: Injection, ...extendSrvs: (new (...args: never[]) => unknown)[]): ServiceCls<RefName, {}, ReturnType<Injection>>
serve<RefName extends string, Injection extends InjectBuilder>(refName: RefName, option: ServiceOptions, injectBuilder: Injection, ...extendSrvs: (new (...args: never[]) => unknown)[]): ServiceCls<RefName, {}, ReturnType<Injection>>
serve<Db extends DatabaseModel, Injection extends InjectBuilder, LibSrvs extends Cls[] = []>(db: Db, injectBuilder: Injection, ...extendSrvs: LibSrvs): ServiceCls<Db["refName"], DatabaseServiceForModel<Db, LibSrvs>, ReturnType<Injection>>
serve<Db extends DatabaseModel, Injection extends InjectBuilder, LibSrvs extends Cls[] = []>(db: Db, option: ServiceOptions, injectBuilder: Injection, ...extendSrvs: LibSrvs): ServiceCls<Db["refName"], DatabaseServiceForModel<Db, LibSrvs>, ReturnType<Injection>>
```

### `ServiceOptions`

```ts
enabled?: boolean | (() => boolean);
/** The `SERVER_MODE` process that mounts the module, endpoints included; `all` mounts every mode and an unset mode mounts everywhere. */
serverMode?: "batch" | "federation";
/** The operation modes the module mounts in; `modules: ["@edge"]` selects every module that lists `edge`. */
operationMode?: ("local" | "module" | "edge" | "cloud")[];
```

## Endpoints (`*.signal.ts`)

`endpoint(srv.<module>, ({ query, mutation, pubsub, message }) => ({ … }))`: each builder takes the return type and a `SignalOption`, then chains the stages below and ends in `.exec()`.

### `endpoint` · `akanjs/signal`

```ts
endpoint<SrvModule extends ServiceModel, Builder extends EndpointBuilder<SrvModule>, LibEndpoints extends readonly EndpointCls[]>(srv: SrvModule, builder: Builder, ...libEndpoints: LibEndpoints): EndpointCls<SrvModule, LibEndpoints extends readonly [] ? ReturnType<Builder> : Assign<MergeEndpointMetas<LibEndpoints, unknown>, ReturnType<Builder>>>
```

### `BuildEndpoint`

```ts
query<Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>)
mutation<Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>)
pubsub<Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>)
message<Returns extends ConstantFieldTypeInput = ConstantFieldTypeInput, Nullable extends boolean = false>(returnRef: Returns, signalOption?: SignalOption<Returns, Nullable>)
```

### `EndpointInfo`

```ts
.param<ArgName extends string, Arg extends ParamFieldType>(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">)
.body<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, Optional extends boolean = false>(name: ArgName, arg: Arg, option?: EndpointArgProps<Optional>)
.room<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>>(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">)
.msg<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, Optional extends boolean = false>(name: string, arg: Arg, option?: EndpointArgProps<Optional>)
.search<ArgName extends string, ExplicitType = unknown, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>>(name: string, arg: Arg, option?: Omit<EndpointArgProps, "nullable">)
.with<ArgType, Optional extends boolean = false>(argRef: InternalArgCls<ArgType>, option?: InternalArgProps<Optional>)
.exec<ExecFn extends (this: Srvs, ...args: [...ServerArgs, ...InternalArgs]) => ReqType extends "pubsub" ? Promise<void> | void : PromiseOrObject<DocumentModel<FieldToValue<Returns>> | (Nullable extends true ? null | undefined : never)>>(execFn: ExecFn)
```

### `EndpointArgProps`

```ts
nullable?: Optional;
example?: string | number | boolean | Dayjs;
```

### `SignalOption`

```ts
nullable?: Nullable;
name?: string;
default?: boolean;
path?: string;
serverMode?: "batch" | "federation" | "all";
/** Milliseconds; the server rejects with `base.error.gatewayTimeout` and the client sizes its request budget from it. */
timeout?: number;
partial?: _Key[] | readonly _Key[];
/** Milliseconds to reuse the answer, keyed by endpoint and arguments; unset caches nothing. */
cache?: number;
/** Calls per caller per window, refused with 429 `base.error.tooManyRequests`. */
rateLimit?: false | RateLimitBudget;
guards?: GuardCls[];
middlewares?: MiddlewareCls[];
prefix?: string | false;
globalPrefix?: false;
/** HTTP verb of a `mutation`, `POST` unless named; every other endpoint type ignores it. */
method?: HttpMutationMethod;
fileUpload?: boolean;
/** `false` keeps it out of the MCP catalogue (default `true`); curation, not authorization — HTTP still serves it. */
mcp?: boolean;
/** The errors this endpoint throws on purpose, by status. */
errors?: EndpointErrors;
/** A slow subscriber of a `pubsub(Binary)`: `"coalesce"` (default) keeps only the newest frame per room, `"queue"` delivers every frame and grows the send buffer with the slowest subscriber. */
backpressure?: "coalesce" | "queue";
enabled?: boolean;
operationMode?: ("local" | "edge" | "cloud" | (string & {}))[];
```

## Dictionaries (`*.dictionary.ts`)

### `serviceDictionary` · `akanjs/dictionary`

```ts
serviceDictionary<Languages extends [string, ...string[]] = [string]>(languages?: Languages): ServiceDictInfo<Languages, never, never, never>
```

### `FunctionTranslation`

```ts
.desc(descTrans: Languages)
.arg<TransMap extends { [key: string]: FieldTranslation<Languages>; }>(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => TransMap)
```

### `FieldTranslation`

```ts
.desc(descTrans: Languages)
```

## App config (`akan.config.ts`)

### `AppConfig` · `akanjs`

```ts
type AppConfig = AppConfigInput | ((app: AppConfigContext) => AppConfigInput)
```

### `AppConfigInput` · `akanjs`

```ts
database?: DeepPartial<AkanDatabaseConfig>;
/** Baked into every client bundle, since a prebuilt CSR shell or mobile bundle never asks the server; `new AkanApp({ prefix })` still overrides the server and every server-rendered page. */
api?: DeepPartial<AkanApiConfig>;
routes?: AkanRouteConfig[];
/** Mounts `libs/<lib>/page` under `page/(libs)/(<lib>)` on sync: `true` every lib dependency with a `page` folder, an array exactly those libs, `false` (the default) nothing, removing what a previous sync created. */
syncPageLibs?: boolean | string[];
externalLibs?: string[];
/** Dependencies whose install scripts `bun install --production` runs, in the image and in a desktop app's server. */
trustedDependencies?: string[];
barrelImports?: string[];
optimizeImports?: string[];
images?: DeepPartial<AkanImageConfig>;
i18n?: DeepPartial<AkanI18nConfig>;
publicEnv?: string[];
secrets?: string[];
assets?: DeepPartial<AkanAssetsConfig>;
docker?: DockerOption;
web?: AkanWebOption;
bin?: AkanBinConfig;
native?: AkanNativeAppConfig;
plugins?: AkanPlugin[];
pipeline?: AppPipelineConfig;
```

### `AkanWebOption` · `akanjs`

```ts
type AkanWebOption = boolean | { csr: boolean; }
```

### `AkanI18nConfig`

```ts
defaultLocale: string;
locales: string[];
/** `"always"` (absent means this) serves every page under `/<locale>/…` and redirects an unprefixed path by Accept-Language; `"as-needed"` serves the default locale's pages unprefixed, so a single-locale app has no prefix. */
localePrefix?: "always" | "as-needed";
```
