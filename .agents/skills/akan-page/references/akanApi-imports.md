<!-- akan:generated -->

# Akan.js API reference

Generated from the akanjs sources of this release: the import paths and signatures a first app needs, so none of
them has to be looked up in `node_modules`. A stage's return type is the same chain, left out below.

## Imports (`akanjs/*`, `@apps/<app>/client`, `../cnst`, `../dict`, `../srv`, layer barrels)

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

What these subpaths hold:

- `akanjs/dictionary` — locales, translations and the dictionaries behind labels, descriptions and `Err` keys.
- `akanjs/document` — database documents, filters, query builders, full-text search and persistence.
- `akanjs/service` — services, adapters, dependency injection and the business-logic runtime.
- `akanjs/store` — domain state, actions and the in-page agent's `st.tool` / `st.use` surface.
- `akanjs/client/native` — the native bridge and the built-in plugins of iOS, Android and desktop apps.
- `akanjs/native/desktop` — what an app's or a lib's own native plugin builds its desktop part from.
- `akanjs/test` — signal-test setup, MCP catalogue checks and sample data (`sampleOf`).
