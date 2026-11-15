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
