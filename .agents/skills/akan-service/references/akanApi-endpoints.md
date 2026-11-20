<!-- akan:generated -->

# Akan.js API reference

Generated from the akanjs sources of this release: the import paths and signatures a first app needs, so none of
them has to be looked up in `node_modules`. A stage's return type is the same chain, left out below.

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

`.search()` is always optional and takes no `nullable`: the caller may omit it or pass `null`, and the handler gets `T | undefined`.

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
/** `false` keeps it out of the MCP catalogue (default `true`), and `"agent"` keeps it off `/mcp` while the in-process agent (`AgentToolsRole`, `agentService.loop`) still lists it; curation, not authorization — HTTP still serves it. */
mcp?: McpShelf;
/** Overrides what the key implies for a `mutation`'s MCP `destructiveHint`: `true` for one no verb gives away, such as `archiveOrder`, `false` for a `drop…` that loses nothing. */
destructive?: boolean;
/** The errors this endpoint throws on purpose, by status. */
errors?: EndpointErrors;
/** A slow subscriber of a `pubsub(Binary)`: `"coalesce"` (default) keeps only the newest frame per room, `"queue"` delivers every frame and grows the send buffer with the slowest subscriber. */
backpressure?: "coalesce" | "queue";
enabled?: boolean;
operationMode?: ((string & {}) | "local" | "edge" | "cloud")[];
```
