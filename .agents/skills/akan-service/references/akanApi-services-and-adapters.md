<!-- akan:generated -->

# Akan.js API reference

Generated from the akanjs sources of this release: the import paths and signatures a first app needs, so none of
them has to be looked up in `node_modules`. A stage's return type is the same chain, left out below.

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
