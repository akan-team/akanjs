---
name: akan-service
description: "Add a service module — behaviour not centred on one stored model — under lib/_<service>/, and keep its abstract current."
---

# Akan service modules

Behaviour that is not centred on a single stored model lives in a **service module**: the folder is
`lib/_<service>/` and its abstract file is `<service>.abstract.md` — the folder carries the underscore, the
abstract drops it. Its UI surface is limited to `<Service>.Util.tsx` and `<Service>.Zone.tsx`, and its
dictionary is a `serviceDictionary`.

## Rules

- Read the module's `*.abstract.md` **before** changing it — it states the invariants the code cannot show.
  Update it when an invariant, workflow, or public behaviour changes; not for formatting or imports.
- Keep the public surface in the signal layer and the decisions in the service.
- Service methods stay a few lines: load → chain → `return await ….save()`. Write `return await` explicitly
  in tail position. Side effects belong in `_preUpdate` / `_postCreate`, not inline. Fire-and-forget is
  explicitly `void`-ed.
- Return `null` / `false` for "not allowed" or "not found" and let the signal decide whether that is an
  error.

## Reaching other things

Inside a service, in preference order: `service<srv.XService>()` for another module's service,
`plug(AdapterClass)` for an adapter, `use<T>()` only for an `option.ts`-registered legacy singleton, and
`env(...)` for config. Injection resolves by field name — a field named `<refName>Service` finds the service
registered under `<refName>`, and the `Service` suffix is required.

An external API or piece of infrastructure is an `adapt()` class in `srvkit/`, injected with `plug`. It
self-registers, so do **not** add it to `lib/option.ts`.

## Recipe: pages backed by an external HTTP API

`akan create-service pokeapi <app>` scaffolds `lib/_pokeapi/`; the adapter beside it is yours.

```ts
// srvkit/pokeApi.ts — read at boot, so the built server takes API_BASE_URL from the host that runs it
export class PokeApi extends adapt("pokeApi" as const, ({ env }) => ({
  baseUrl: env(() => process.env.API_BASE_URL ?? "http://localhost:9000"),
})) {
  async get<T>(path: string): Promise<T | null> {
    try {
      const res = await fetch(`${this.baseUrl}/${path}`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 404) this.logger.warn(`${path} answered ${res.status}`);
    } catch (error) {
      this.logger.warn(`${path} failed: ${String(error)}`);
    }
    return null;
  }
}

// lib/_pokeapi/pokeapi.service.ts — shape the upstream JSON here, not in the page
export class PokeapiService extends serve("pokeapi" as const, ({ plug }) => ({ pokeApi: plug(PokeApi) })) {
  async getPokemon(name: string) {
    const pokemon = await this.pokeApi.get<ApiPokemon>(`pokemon/${name}`);
    return pokemon && { id: pokemon.id, name: pokemon.name };
  }
}

// lib/_pokeapi/pokeapi.signal.ts — Any answers plain JSON; nullable lets it answer null for "not found"
export class PokeapiEndpoint extends endpoint(srv.pokeapi, ({ query }) => ({
  pokemon: query(Any, { guards: [Public], nullable: true })
    .param("name", String)
    .exec(async function (name) {
      return await this.pokeapiService.getPokemon(name);
    }),
})) {}

// lib/_pokeapi/pokeapi.dictionary.ts — typecheck asks a label for every endpoint
  .endpoint<PokeapiEndpoint>((fn) => ({ pokemon: fn(["Pokémon", "포켓몬"]) }))
```

The page calls it as `await fetch.pokemon(name)` (`fetch` from `@apps/<app>/client`) and answers
`router.notFound()` on `null`. An `Any` return reaches the page as `unknown`: type it with an interface in
`common/`, or return a scalar (`akan create-scalar`) for a typed wire shape. A query that answers `null` without
`nullable: true` fails the render, naming the endpoint.

Full detail: `get_guideline` with `modelService`.
