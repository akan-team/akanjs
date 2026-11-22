---
name: akan-service
description: "Add a service module — behaviour not centred on one stored model — under lib/_<service>/, and keep its abstract current."
---

<!-- akan:generated -->

# Akan service modules

Behaviour not centred on one stored model lives in a **service module**, `lib/_<service>/`, whose abstract is
`<service>.abstract.md` (no underscore). Its UI surface is limited to `<Service>.Util.tsx` and
`<Service>.Zone.tsx`, and its dictionary is a `serviceDictionary`.

## Rules

- Read the module's `*.abstract.md` **before** changing it — it states the invariants the code cannot show.
  Update it when an invariant, workflow, or public behaviour changes; not for formatting or imports.
- Keep the public surface in the signal layer and the decisions in the service.
- Service methods stay a few lines: load → chain → `return await ….save()`. Side effects belong in
  `_preUpdate` / `_postCreate`, not inline. Fire-and-forget is explicitly `void`-ed.
- Return `null` / `false` for "not allowed" or "not found" and let the signal decide whether that is an
  error.
- `serve(name, { serverMode: "batch" }, …)`, on the app's own `lib/_<app>/` for cron and queue work, mounts the
  module, endpoints included, only in a `batch` or `all` process, never on a `federation` replica. A service a page
  calls leaves it off, as `akan create-service` does.

## Reaching other things

Inside a service, in preference order: `service<srv.XService>()` for another module's service,
`plug(AdapterClass)` for an adapter, `use<T>()` only for an `option.ts`-registered legacy singleton, and
`env(...)` for config. Injection resolves by field name: a field named `<refName>Service` finds the service
registered under `<refName>`. The adapter's place and the field-name suffix are the `server` rule.

## Recipe: pages backed by an external HTTP API

`akan create-service openlibrary <app>` scaffolds `lib/_openlibrary/`; the adapter beside it is yours.

```ts
// srvkit/bookApi.ts — read at boot, so the built server takes API_BASE_URL from the host that runs it
import { adapt } from "akanjs/service";

export class BookApi extends adapt("bookApi" as const, ({ env }) => ({
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

// lib/_openlibrary/openlibrary.service.ts — shape the upstream JSON here, not in the page
import { BookApi } from "@apps/<app>/srvkit";
import { serve } from "akanjs/service";

interface ApiWork {
  key: string;
  title: string;
}

export class OpenlibraryService extends serve("openlibrary" as const, ({ plug }) => ({ bookApi: plug(BookApi) })) {
  async getBook(id: string) {
    const work = await this.bookApi.get<ApiWork>(`works/${id}.json`);
    return work && this.toBook(id, work);
  }
  // TypeScript `private`: lint refuses `#private` in a service.
  private toBook(id: string, work: ApiWork) {
    return { id, title: work.title };
  }
}

// lib/_openlibrary/openlibrary.signal.ts — Any answers plain JSON
import { Any } from "akanjs/base";
import { endpoint, internal, Public } from "akanjs/signal";

import * as srv from "../srv";

export class OpenlibraryInternal extends internal(srv.openlibrary, () => ({})) {}

export class OpenlibraryEndpoint extends endpoint(srv.openlibrary, ({ query }) => ({
  book: query(Any, { guards: [Public], nullable: true })
    .param("id", String)
    .exec(async function (id) {
      return await this.openlibraryService.getBook(id);
    }),
})) {}

// lib/_openlibrary/openlibrary.dictionary.ts — typecheck asks a label for every endpoint
import { serviceDictionary } from "akanjs/dictionary";

import type { OpenlibraryEndpoint } from "../sig";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<OpenlibraryEndpoint>((fn) => ({ book: fn(["Book", "책"]) }))
  .error({})
  .translate({});
```

The page calls it as `await fetch.book(id)` (`fetch` from `@apps/<app>/client`) and ends with
`return router.notFound()` on `null`. An `Any` return reaches the page as `unknown`: type it with an interface in
`common/`, or return a scalar (`akan create-scalar`) for a typed wire shape. A query that answers `null` without
`nullable: true` fails the render, naming the endpoint.

The adapter turns every failure into `null`, a not-found page. One the page must show as an error throws
`new Err("<app>.error.<key>")`, `Err` from `"../lib/dict"` and the key in `lib/_<app>/<app>.dictionary.ts`'s
`.error({})`; `new Error` fails the build (`no-throw-raw-error`).

The signatures of serve, adapt, endpoint and serviceDictionary, and every import path: the `akanApi-*` references.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-service/references/modelService.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-service/references/modelSignal.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-service/references/modelDocument.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-service/references/akanApi-imports.md` — Imports (`akanjs/*`, `@apps/<app>/client`, `../cnst`, `../dict`, `../srv`, layer barrels)
- `.agents/skills/akan-service/references/akanApi-services-and-adapters.md` — Services and adapters (`lib/_<service>/`, `srvkit/`): `adapt`, `serve`, `ServiceOptions`
- `.agents/skills/akan-service/references/akanApi-endpoints.md` — Endpoints (`*.signal.ts`): `endpoint`, `BuildEndpoint`, `EndpointInfo`, `EndpointArgProps`, `SignalOption`
- `.agents/skills/akan-service/references/akanApi-dictionaries.md` — Dictionaries (`*.dictionary.ts`): `serviceDictionary`, `FunctionTranslation`, `FieldTranslation`
