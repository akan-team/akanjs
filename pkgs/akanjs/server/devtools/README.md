# Akan Devtools Metadata API

Four read-only JSON endpoints that describe a running Akan application well enough to draw it: its data
schema, its API surface, its i18n tree, and its dependency-injection graph.

They exist so an external developer-tools UI can render the system without parsing source code. This
document is the integration contract — endpoints, payload schemas, real examples, and a suggested
visualization for each.

---

## 1. Availability

| | |
| --- | --- |
| **Base path** | `/_akan` (never under `/api`) |
| **Method** | `GET` only |
| **Auth** | none — the gate is the environment, not a credential |
| **Enabled when** | `AKAN_PUBLIC_ENV=local`, or `AKAN_DEVTOOLS=true` / `AKAN_DEVTOOLS=1` |
| **Disabled when** | any other environment, or `AKAN_DEVTOOLS=false` / `AKAN_DEVTOOLS=0` |
| **Response headers** | `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store` |

**When disabled, the routes are not registered at all.** They are not 403s — the request falls through to
the app's SSR catch-all, which typically answers `307` (locale/base-path redirect) or `404`. Feature-detect
by requesting `/_akan/devtools` and treating **any non-200, or any 200 whose body is not JSON with
`version: 1`,** as "devtools unavailable". Do not branch on the status code alone.

```bash
bun run akan start <appName>        # dev server, default port 8282
curl -s localhost:8282/_akan/devtools | jq .
```

In federation mode the gateway proxies unknown `/_akan/*` paths to a backend child, so a single origin
serves all four. Each response reports the `pid` and `replicaIdx` that answered it (see
[§2](#2-response-envelope)); with multiple replicas, consecutive requests may land on different processes.
That matters only for `/_akan/signal`, whose `internal[].scheduledHere` is per-process.

---

## 2. Response envelope

Every payload endpoint returns the same wrapper. Validate this once and reuse it.

```ts
interface DevtoolsEnvelope<Kind extends string, Data> {
  kind: Kind;              // "constant" | "signal" | "dictionary" | "deps"
  version: 1;              // contract version — bumped on any breaking shape change
  generatedAt: string;     // ISO-8601, when this response was built (not cached)
  app: {
    name: string;          // AKAN_PUBLIC_APP_NAME
    repoName: string;
    serveDomain: string;
    environment: string;   // "local" | "debug" | "main" | ...
    operationMode: string; // "local" | "edge" | "cloud" | "module"
    serverMode: "federation" | "batch" | "all";
    pid: number;
    replicaIdx: number;
  };
  data: Data;
}
```

**Gate your client on `version`.** Treat an unrecognized `version` as unsupported rather than best-effort
parsing it. New optional fields may be added within `version: 1`; nothing will be removed or retyped.

### Errors

A serializer failure returns `500` with a flat body — the envelope is *not* present:

```json
{ "kind": "signal", "error": "Cannot destructure property 'endpointCls' from null or undefined value" }
```

Render it as a per-panel error, not a global failure. The other three endpoints are independent and will
still succeed.

### The `Unserializable` marker

Some registry values (an arbitrary `meta` object, a default factory, a cyclic graph) cannot be represented
in JSON. Instead of dropping them or throwing, the server substitutes a marker. It can appear anywhere a
value is user-supplied: `ConstantFieldNode.default` / `.example` / `.meta` / `.accumulate`,
`ConstantData.values`, `DepEdge.detail`.

```ts
interface Unserializable {
  __akan: "unserializable";
  type: "function" | "class" | "symbol" | "bigint" | "circular" | "depth-limit";
  name?: string;
}
```

Detect it with `value?.__akan === "unserializable"` and render a badge (`ƒ`, `⟳`, `…`) rather than the raw
object. Also note that non-finite numbers arrive as the strings `"NaN"`, `"Infinity"`, `"-Infinity"`.

---

## 3. `GET /_akan/devtools` — index

The only endpoint without an envelope. Use it for feature detection and discovery.

```json
{
  "version": 1,
  "endpoints": [
    { "kind": "constant",   "path": "/_akan/constant" },
    { "kind": "signal",     "path": "/_akan/signal" },
    { "kind": "dictionary", "path": "/_akan/dictionary" },
    { "kind": "deps",       "path": "/_akan/deps" }
  ]
}
```

---

## 4. `GET /_akan/constant` — data schema

Every model the app registered, in all five of its generated views, plus scalars, enums, filters, and
pre-derived relation edges.

### Schema

```ts
interface ConstantData {
  models: Record<string, ConstantModelNode>;   // keyed by refName, e.g. "user"
  scalars: Record<string, ConstantModelView>;  // embedded value objects, no table of their own
  enums: Record<string, EnumNode>;
  values: Record<string, unknown>;             // other exports from *.constant.ts, JSON-coerced
  primitives: string[];                        // e.g. ["Any","Boolean","Date","Float","ID","Int","String","Upload"]
  relations: RelationEdge[];                   // pre-derived, see the caveat below
}

type ModelViewKey = "input" | "object" | "full" | "light" | "insight";
type ConstantType = ModelViewKey | "scalar";

interface ConstantModelNode {
  refName: string;                                  // "user"
  modelNames: Record<ModelViewKey, string>;         // { full: "User", light: "LightUser", ... }
  views: Record<ModelViewKey, ConstantModelView>;
  filter?: { query: Record<string, FilterArg[]>; sort: string[] };
}

interface ConstantModelView {
  modelName: string;        // "User"
  modelType: ConstantType;  // "full"
  fields: Record<string, ConstantFieldNode>;
}

interface ConstantFieldNode {
  name: string;
  fieldKind: "property" | "hidden" | "secret" | "resolve";
  type: FieldType;
  arrDepth: number;        // 0 = scalar, 1 = T[], 2 = T[][]
  nullable: boolean;
  immutable: boolean;
  select: boolean;         // false = excluded from default queries
  defaultKind: "value" | "function" | "none";
  default?: unknown;       // present only when defaultKind === "value"
  ref?: string;            // referenced model refName, when the field is a foreign key
  refPath?: string;
  refType?: "child" | "parent" | "relation";
  min?: number; max?: number; minlength?: number; maxlength?: number;
  preset?: "email" | "password" | "url";
  text?: "search" | "filter";
  accumulate?: unknown;    // insight aggregation spec
  example?: unknown;
  meta?: Record<string, unknown>;
  hasValidate: boolean;    // a custom validator exists; its body is not serialized
}

type FieldType =
  | { kind: "primitive"; refName: string }                                            // String, Int, ID, Date, ...
  | { kind: "enum"; refName: string; values: (string | number)[] }                    // values inlined
  | { kind: "model"; refName: string; modelType: ConstantType; modelName: string }    // reference only
  | { kind: "map"; value: FieldType; valueArrDepth: number }                          // Map<string, value>
  | { kind: "unknown"; refName: string };                                             // unregistered class

interface FilterArg {
  name: string; type: FieldType; arrDepth: number; nullable: boolean;
  ref?: string;        // the model this arg points at — draw it as a cross-model link
  default?: unknown;
}

interface EnumNode {
  key: string;      // the ConstantRegistry map key (lowerlized export name)
  refName: string;  // the enum's own refName — may differ from `key`
  values: (string | number)[];
}

interface RelationEdge {
  from: string; fromView: ConstantType; field: string;
  to: string;   toView: ConstantType;
  arrDepth: number; nullable: boolean;
  refType?: "child" | "parent" | "relation";
}
```

### Example

```jsonc
// data.models.serverResolverTestItem.views.full.fields
{
  "count":  { "name": "count",  "fieldKind": "property", "type": { "kind": "primitive", "refName": "Int" },
              "arrDepth": 0, "nullable": false, "immutable": false, "select": true,
              "defaultKind": "value", "default": 0, "hasValidate": false },
  "tags":   { "name": "tags",   "fieldKind": "property", "type": { "kind": "primitive", "refName": "String" },
              "arrDepth": 1, "nullable": false, "immutable": false, "select": true,
              "defaultKind": "value", "default": [], "hasValidate": false },
  "nested": { "name": "nested", "fieldKind": "property",
              "type": { "kind": "model", "refName": "serverResolverTestNested",
                        "modelType": "scalar", "modelName": "ServerResolverTestNested" },
              "arrDepth": 0, "nullable": false, "immutable": false, "select": true,
              "defaultKind": "none", "hasValidate": false },
  "secret": { "name": "secret", "fieldKind": "secret", "type": { "kind": "primitive", "refName": "String" },
              "arrDepth": 0, "nullable": true, "immutable": false, "select": false,
              "defaultKind": "none", "hasValidate": false },
  "resolvedLabel": { "name": "resolvedLabel", "fieldKind": "resolve",
                     "type": { "kind": "primitive", "refName": "String" },
                     "arrDepth": 0, "nullable": false, "immutable": false, "select": true,
                     "defaultKind": "none", "hasValidate": false }
}
```

```jsonc
// data.models.serverResolverTestItem.filter
{
  "query": {
    "any": [],
    "inCategory": [
      { "name": "category",       "type": { "kind": "primitive", "refName": "String"  }, "arrDepth": 0, "nullable": false },
      { "name": "includeRemoved", "type": { "kind": "primitive", "refName": "Boolean" }, "arrDepth": 0, "nullable": true  }
    ],
    "byOwner": [
      { "name": "ownerId", "type": { "kind": "primitive", "refName": "ID" }, "arrDepth": 0, "nullable": false, "ref": "user" }
    ]
  },
  "sort": ["latest", "oldest", "titleAsc"]
}
```

### Reading it correctly

- **`relations` is emitted per view.** The same field yields up to five edges (`fromView`
  `input`/`object`/`full`/`light`/`insight`). For an ER diagram, **filter to `fromView === "full"`**;
  otherwise every relation is drawn five times.
- **The five views are projections of one model, not five models.** Default to rendering `full` and offer
  the rest as a toggle. `input` is the write shape, `light` the list shape, `insight` the aggregate shape.
- **`fieldKind` drives styling.** `secret` → mask it (see [§8](#8-what-is-deliberately-absent)); `hidden` →
  server-only, dim it; `resolve` → computed on demand, not stored, so mark it distinctly in an ER diagram;
  `property` → normal.
- **`type.kind === "model"` never inlines the target.** Follow `type.refName` into `models` or `scalars`.
  That keeps the *payload* finite, but the model graph it describes can still be cyclic (`user → post →
  user`), so guard your own traversal if you expand references into a tree.
- **Enum values are inlined on the field** (`type.values`). The top-level `enums` map is a separate index
  and can legitimately be empty even when enum-typed fields exist — do not resolve field enums through it.
- **`arrDepth` is not part of `type`.** Render `String` + `arrDepth: 1` as `String[]`.
- **`defaultKind: "function"`** means a factory like `() => dayjs()`. It is never invoked, so there is no
  value to show — render `ƒ` or "computed".
- **`scalars` are embedded value objects.** In an ER diagram draw them as composition (filled diamond),
  not as a separate entity with its own identity.

### Suggested visualization — **ER diagram + schema browser**

- **Primary: entity-relationship graph.** One node per `models` key, labelled `modelNames.full`. Node body
  lists the `full` view's fields as `name: Type[]` with a nullability marker. Edges from
  `relations.filter(r => r.fromView === "full")`, labelled with `field`, arrow style from `refType`
  (`parent`/`child`/`relation`), cardinality `1` vs `N` from `arrDepth > 0`, dashed when `nullable`.
  Force-directed or layered layout both work; models are typically < 50.
- **Secondary: model detail panel.** View tabs (`input`/`object`/`full`/`light`/`insight`) over one field
  table with columns *field, type, flags, default, constraints*. A diff between `input` and `full` is a
  cheap high-value feature — it shows exactly what the server adds to a write.
- **Filter explorer.** Under each model, `filter.query` as a list of named queries with their arg
  signatures, and `filter.sort` as chips. Any `FilterArg.ref` is a link to another model — a genuinely
  useful cross-model view that the ER graph alone does not give you.
- **Enum palette.** A flat list from `enums` with value chips, cross-referenced to the fields that use
  them (match on `type.refName`).

---

## 5. `GET /_akan/signal` — API surface

Every endpoint the server actually serves — hand-written and framework-generated — plus slices, internals,
and a flattened route table.

### Schema

```ts
interface SignalData {
  prefix: string;           // "/api"
  websocketPrefix: string;  // "/ws"
  signals: Record<string, SignalNode>;
  routes: RouteRow[];       // flattened, render-ready
  guards: string[];         // every distinct guard name in the app
  middlewares: string[];
}

interface SignalNode {
  refName: string;
  kind: "database" | "service";      // "database" signals have slices and generated CRUD
  cnstRefName?: string;              // the model in /_akan/constant this signal is bound to
  classNames: { internal?: string; endpoint: string; slice?: string; server?: string };
  guards: { get?: string[]; cru?: string[]; create?: string[]; update?: string[]; remove?: string[] };
  internal: Record<string, InternalNode>;
  slice: Record<string, SliceNode>;
  endpoint: Record<string, EndpointNode>;        // hand-written in *.signal.ts
  generated: {
    crud: Record<string, EndpointNode>;          // create/update/remove/get/light
    slice: Record<string, EndpointNode>;         // <model>List<Suffix> / <model>Insight<Suffix>
  };
}

interface EndpointNode {
  type: "query" | "mutation" | "pubsub" | "message";
  args: SerializedArg[];
  returns: SerializedReturns;
  path?: string;              // explicit override
  prefix?: false | string;    // false = skip the per-model path segment
  globalPrefix?: false;       // false = skip "/api"
  guards?: string[];
  fileUpload?: boolean;
  cache?: number;             // declared on the endpoint; no runtime consumer today (see note)
  timeout?: number;           // milliseconds, enforced by the `Timeout` middleware (default 5000)
}

interface SliceNode { args: SerializedArg[]; path?: string; guards?: string[] }

interface SerializedArg {
  type: "body" | "param" | "search" | "upload" | "msg" | "room";
  refName: string;            // primitive name, or a model refName
  name: string;
  modelType?: "input" | "object" | "insight" | "scalar";  // absent for primitives
  arrDepth?: number;
  nullable?: boolean;
  example?: string | number | boolean;
  enum?: string;
}

interface SerializedReturns {
  refName: string;
  modelType?: "input" | "full" | "light" | "insight" | "scalar";
  arrDepth?: number;
  partial?: string[];
  nullable?: boolean;
}

interface InternalNode {
  key: string;
  type: "init" | "destroy" | "cron" | "interval" | "timeout" | "process" | "resolveField";
  enabled: boolean;
  lock?: boolean;
  serverMode?: "federation" | "batch" | "all";
  operationMode?: string[];
  schedule?: { cron?: string; everyMs?: number };
  args: SerializedArg[];
  internalArgs: string[];        // injected context classes, e.g. ["Req", "Ws"]
  returns?: SerializedReturns;
  scheduledHere: boolean;        // is it actually running on THIS process?
  skipReason?: string;           // human-readable why-not
}

interface RouteRow {
  signal: string;
  key: string;
  source: "declared" | "crud" | "slice";
  type: "query" | "mutation" | "message" | "pubsub";
  transport: "http" | "ws";
  method: "GET" | "POST" | null;   // null for websocket
  path: string;                    // fully resolved, ":param" placeholders intact
  guards: string[];
  cache?: number; timeout?: number; fileUpload?: boolean;
}
```

### Example

```jsonc
// data.routes — note how prefix/globalPrefix change the resolved path
[
  { "signal": "serverResolverTestItem", "key": "getTitle", "source": "declared", "type": "query",
    "transport": "http", "method": "GET",  "path": "/getTitle/:id", "guards": ["Public"] },
  { "signal": "serverResolverTestItem", "key": "updateTitle", "source": "declared", "type": "mutation",
    "transport": "http", "method": "POST", "path": "/api/serverResolverTestItem/updateTitle/:id", "guards": [] },
  { "signal": "serverResolverTestItem", "key": "roomFeed", "source": "declared", "type": "pubsub",
    "transport": "ws", "method": null, "path": "/api/ws", "guards": [] },
  { "signal": "serverResolverTestItem", "key": "serverResolverTestItemList", "source": "slice", "type": "query",
    "transport": "http", "method": "GET",
    "path": "/api/serverResolverTestItem/serverResolverTestItemList", "guards": ["Public"] }
]
```

```jsonc
// data.signals.serverResolverTestItem.internal
{
  "processItem": { "key": "processItem", "type": "process", "enabled": true, "serverMode": "all",
                   "args": [{ "type": "msg", "refName": "ID", "name": "itemId" }],
                   "internalArgs": [], "returns": { "refName": "Boolean" }, "scheduledHere": true },
  "cleanup":     { "key": "cleanup", "type": "destroy", "enabled": true, "lock": true,
                   "args": [], "internalArgs": [], "returns": { "refName": "Any" }, "scheduledHere": true }
}
```

### Reading it correctly

- **`routes` is the render-ready view; `signals` is the structured view.** Build the route table from
  `routes` — the paths are already resolved exactly as the server registered them, including
  `prefix: false` / `globalPrefix: false` cases (`getTitle` above resolves to a bare `/getTitle/:id`).
  Do not recompute paths from `prefix` + `key`; you will get them wrong.
- **`source` distinguishes authored from generated.** Most apps have far more `crud`/`slice` endpoints than
  `declared` ones. Default the table to `declared` and let the user opt into the generated ones, or the
  hand-written API will be buried.
- **Slices with an empty-string key are the root slice.** They generate the unsuffixed
  `<model>List` / `<model>Insight` pair. Label them "root", not "".
- **`guards: []` means no guard was declared** at the endpoint level. For generated CRUD, authorization
  comes from the *signal-level* `guards` object (`get`/`cru`/`create`/`update`/`remove`) instead — read
  both before telling a user an endpoint is unprotected.
- **All websocket endpoints share one path** (`/api/ws`); `key` is the message discriminator. Do not group
  the route table by path for ws rows.
- **`scheduledHere` is per-process.** In federation mode, `false` with a `skipReason` means "this job runs
  on a different server role", not "broken". Surface `skipReason` verbatim — it is written to answer
  "why isn't my cron running".
- **`resolveField` internals are never scheduled**; they carry a fixed `skipReason` saying so. Do not show
  them as disabled jobs.
- **`timeout` is milliseconds; `cache` currently has no runtime effect.** `timeout` is enforced by the
  `Timeout` middleware (default 5000ms when absent). `cache` is a declared endpoint option that nothing in
  the framework consumes yet — report it as a declaration, not as active behaviour.

### Suggested visualization — **API explorer + job timeline**

- **Primary: route table.** Columns *method · path · signal · key · source · type · guards*, with facets on
  `source`, `type`, `transport`, `signal`, and guard. Method as a colored chip. This is the single highest
  value view; make it the default tab.
- **Signal detail.** Per signal, four sections — declared endpoints, generated CRUD, slices, internals —
  each row expanding to its arg list (`SerializedArg.type` tells you `param` vs `search` vs `body`) and
  return type. Link `returns.refName` / `args[].refName` into the `/_akan/constant` model browser: this
  cross-link is what turns two payloads into one product.
- **Scheduled-jobs panel.** From every `internal` where `type` is `cron`/`interval`/`timeout`. Show
  `schedule.cron` or `schedule.everyMs` as a human string, and render `scheduledHere: false` rows greyed
  with `skipReason` as the subtitle. A 24-hour timeline strip of upcoming cron fires is a strong feature if
  you want one.
- **Lifecycle strip.** `init` and `destroy` internals in boot order — pairs naturally with the
  `/_akan/deps` stage view.
- **Guard/middleware coverage.** A matrix of endpoints × guards, driven by top-level `guards`. Endpoints
  with no guard at either level are the interesting cell.

---

## 6. `GET /_akan/dictionary` — i18n tree

Every registered translation, merged across the framework, libraries, and the app.

**Query parameters:** `?lang=<code>` narrows `dictionary` and `keys` to one language. `languages` and
`modules` always report the full set. Full dictionaries reach hundreds of keys per language — prefer
`?lang=` for the initial load.

### Schema

```ts
interface DictionaryData {
  languages: string[];                                     // ["en", "ko"]
  modules: Record<string, { kind: "model" | "scalar" | "service"; languages: string[] }>;
  dictionary: Record<string, Record<string, DictionaryNode>>;  // [lang][refName] -> tree
  keys: string[];                                          // flattened dotted paths, sorted
}

// A node is a plain nested object. Leaves carry `t`; a sibling `desc` holds the long form.
type DictionaryNode = { t?: string; desc?: { t: string } } & Record<string, unknown>;
```

### Example

```jsonc
{
  "languages": ["en", "ko"],
  "modules": {
    "user": { "kind": "model",   "languages": ["en", "ko"] },
    "util": { "kind": "service", "languages": ["en", "ko"] }
  },
  "dictionary": {
    "en": {
      "user": {
        "modelName": { "t": "User" },
        "modelDesc": { "t": "A user account" },
        "insight": {}, "query": {}, "sort": {}, "signal": {}, "error": {},
        "empty": { "t": "No users" }
      },
      "util": {
        "signal": { "ping": { "t": "Ping", "arg": {}, "desc": { "t": "Health check" } } },
        "error":  { "unavailable": { "t": "Unavailable" } }
      }
    }
  },
  "keys": ["user.empty", "user.modelDesc", "user.modelName",
           "util.error.unavailable", "util.signal.ping", "util.signal.ping.desc"]
}
```

### Reading it correctly

- **`keys` is the union across whatever `dictionary` contains.** Without `?lang=` that is every language,
  so a key present in `keys` may be missing from one language's tree — that difference *is* the coverage
  report. With `?lang=` both narrow together, so the coverage view needs the unfiltered fetch.
- **Structural sections are conventional:** `modelName` / `modelDesc`, then `insight`, `query`, `sort`,
  `signal`, `error`, with loose keys at the top level. Endpoint arg labels live at
  `<module>.signal.<endpointKey>.arg.<argName>`. Empty section objects (`"query": {}`) are normal.
- **`.desc` is a sibling of the leaf, not a separate key** — `util.signal.ping` and `util.signal.ping.desc`
  are the same node, one nested inside the other. Present them as one row with a description column.
- **Module refNames align with `/_akan/constant` models and `/_akan/signal` signals.** `modules[x].kind`
  tells you which: `model` → a model in `constant.models`, `service` → a signal in `signal.signals`.

### Suggested visualization — **translation matrix**

- **Primary: key × language grid.** Rows from `keys`, one column per language, cells from the tree. Empty
  cell = missing translation. A per-language completeness bar at the top is the headline number.
- **Group rows by module** (the first dotted segment), badged with `modules[x].kind`. Within a module,
  sub-group by the second segment (`signal`, `error`, `query`, …) so a 300-row list stays navigable.
- **Filter to gaps** — a "missing only" toggle is the reason this view earns a place in the product.
- **Inline context.** When a key resolves to a field or endpoint, deep-link to it in the constant/signal
  browsers. `user.modelName` ↔ the `user` model; `util.signal.ping` ↔ the `ping` endpoint.

---

## 7. `GET /_akan/deps` — dependency graph

The DI container as a node/edge graph, plus the topological order it booted in.

### Schema

```ts
interface DepsData {
  app: {
    name: string; status: string;                 // "running" | "initializing" | ...
    serverMode: "federation" | "batch" | "all";
    prefix: string; websocketPrefix: string; openapi: boolean;
  };
  nodes: DepNode[];
  edges: DepEdge[];
  roles: { role: string; impl: string }[];        // interface -> bound implementation
  stages: { adaptor: string[][]; service: string[][] };  // topological init batches
  env: {
    public: Record<string, string>;  // AKAN_PUBLIC_* only, with values
    keys: string[];                  // every process.env name plus the resolved BaseEnv keys — names only
  };
  disabledModules: { refName: string; reason: string }[];
}
```

> `data.app` here is the *server* identity (status, prefix, openapi). The envelope's `app`
> ([§2](#2-response-envelope)) is the *environment* identity (appName, environment, pid). They are
> different objects; both are useful in a header bar.

```ts
interface DepNode {
  id: string;          // "service:user" — kind-prefixed, unique
  kind: "service" | "adaptor" | "serverSignal" | "internal" | "endpoint"
      | "slice" | "use" | "middleware" | "webProxy" | "env";
  refName: string;
  className?: string;
  stage?: number;      // index into stages.service / stages.adaptor — use as graph rank
  enabled?: boolean;
  serviceType?: "database" | "plain";
  cnstRefName?: string;
  role?: string;       // set when this adaptor is bound to a role
}

interface DepEdge {
  from: string; to: string;   // DepNode ids
  kind: "database" | "service" | "use" | "signal" | "plug" | "env" | "memory";
  prop: string;               // the injected field name on the source class
  resolvedTo?: string;        // plug only: the concrete adaptor a role resolved to
  detail?: Record<string, unknown>;  // env -> { keys: string[] };  memory -> { local, isMap, expireAt? }
}
```

### Example

```jsonc
{
  "nodes": [
    { "id": "service:serverResolverTestItem", "kind": "service", "refName": "serverResolverTestItem",
      "className": "serverResolverTestItem", "serviceType": "database", "enabled": true,
      "stage": 0, "cnstRefName": "serverResolverTestItem" },
    { "id": "adaptor:cacheAdaptorRole", "kind": "adaptor", "refName": "cacheAdaptorRole",
      "className": "cacheAdaptorRole" }
  ],
  "edges": [
    { "from": "service:serverResolverTestItem", "to": "adaptor:serverResolverTestItemModel",
      "kind": "database", "prop": "serverResolverTestItemModel" },
    { "from": "service:base", "to": "serverSignal:baseSignal", "kind": "signal", "prop": "baseSignal" },
    { "from": "service:base", "to": "env:env", "kind": "env", "prop": "onCleanup", "detail": { "keys": [] } }
  ],
  "roles": [
    { "role": "cacheAdaptorRole",    "impl": "solidCache" },
    { "role": "databaseAdaptorRole", "impl": "sqliteDatabase" }
  ],
  "stages": {
    "adaptor": [["sqliteDatabase", "solidCache", "blobStorage", "solidQueue", "consoleLogger"],
                ["scheduler", "serverResolverTestItemModel"]],
    "service": [["base", "serverResolverTestItem"]]
  }
}
```

### Reading it correctly

- **`stages` is a free layered layout.** Each inner array is one init batch; everything in a batch is
  independent and boots in parallel. Use the array index as the graph rank instead of running your own
  topological sort — the server already resolved the real order.
- **Edges are not deduplicated.** One target can be reached by several injected props (a service reaching
  its model as both `<model>Model` and `__databaseModel`). Dedupe on `from|to|kind` for the graph, and keep
  the full list for the detail panel.
- **`roles` is the interface-to-implementation binding** (`cacheAdaptorRole → solidCache`). This is what a
  reader most wants to know about the container. Render role nodes distinctly and draw a dashed
  "implemented by" edge, or collapse the role into its impl with the role as a subtitle.
- **`plug` edges point at the *declared* target**, which is usually a role. `resolvedTo` carries the
  concrete adaptor when they differ — show it as "→ via".
- **`env` is a single sink node.** Every `env` edge lands on `env:env`; `detail.keys` lists the key *names*
  that injection reads. Those names are extracted by static analysis, so they are best-effort and slightly
  over-inclusive — do not present them as an authoritative config contract.
- **`disabledModules` explains absence.** A module named there has no node at all; the `reason` string
  ("service disabled", `depends on disabled module "x"`) is the whole story. Render it as a sidebar list —
  "why isn't my module here" is a real support question.
- **`nodes[].refName` cross-links out:** `service` and `serverSignal` nodes match `/_akan/signal` signals;
  `cnstRefName` matches a `/_akan/constant` model.

### Suggested visualization — **layered DI graph + boot timeline**

- **Primary: layered DAG.** Rank by `stage`, one swimlane per `kind`, node color by `kind`, edge style by
  edge `kind` (solid `service`, dashed `plug`, dotted `env`). Start with `service` + `adaptor` + `env` only
  — including `endpoint`/`slice`/`internal` nodes triples the node count for little insight. Make them a
  toggle.
- **Boot timeline.** `stages.adaptor` then `stages.service` as a horizontal waterfall of batches. This is
  the clearest picture of startup and reads well even for someone who does not know the codebase.
- **Node inspector.** On select: class name, stage, `serviceType`, inbound/outbound edges grouped by edge
  kind with the `prop` name, and the role binding if any.
- **Blast-radius mode.** Highlight the transitive closure downstream of a selected node — "what breaks if
  this adaptor fails". Cheap to implement on this payload and the most compelling demo of the view.
- **Config panel.** `env.public` as a key/value table, `env.keys` as names-only chips (values are
  deliberately absent — see below), and `roles` as a binding table.

---

## 8. What is deliberately absent

These omissions are intentional. Please do not build UI that implies the data is available, and do not ask
for it to be added.

| Omitted | Where | Why |
| --- | --- | --- |
| Values of secret fields | `ConstantFieldNode` with `fieldKind: "secret"` carries no `default` / `example` | field names are structure; seeded values are not |
| Non-public env values | `deps.env.public` holds `AKAN_PUBLIC_*` only; every other key appears in `env.keys` by name | credentials must not leave the process |
| Live `use` instances | `deps.nodes` of kind `use` carry key + `className` only | SDK clients routinely close over credentials |
| Function bodies | `hasValidate: boolean`, `defaultKind: "function"`, `Unserializable` markers | not serializable, and not useful to render |
| Runtime data | all four endpoints | this is a description of the *shape* of the system, never its contents. No records, no request logs, no metrics |

---

## 9. Client integration notes

- **Fetch order.** `/_akan/devtools` first to feature-detect, then the four in parallel. They are
  independent; render each panel as it arrives and degrade a failed one individually.
- **Caching.** Responses are `no-store` and rebuilt per request. The shape only changes on a server
  restart, so cache client-side keyed on `app.pid` + `generatedAt` and refetch on user action rather than
  polling. There is no change feed and no websocket for these.
- **Cost.** `/_akan/constant` and `/_akan/dictionary` grow with the app — hundreds of KB on a large
  codebase. Use `?lang=` for the dictionary and lazily load model detail from the already-fetched constant
  payload rather than refetching.
- **Stability.** Within `version: 1`, optional fields may be added; nothing will be removed or retyped.
  Parse defensively — treat every `?`-marked field as possibly absent, and unknown enum members in
  `fieldKind` / `kind` / `type` as a generic fallback rather than an error.
- **Source of truth.** The TypeScript definitions in this document are copied from
  `pkgs/akanjs/server/devtools/types.ts`. That file is the contract; this document is its explanation.
