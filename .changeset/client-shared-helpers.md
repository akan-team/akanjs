---
"akanjs": minor
---

Helpers the framework used in several copies are public, each in one place:

- `parseSearchParams(search)` (`akanjs/common`): a query string as a record, a repeated key holding every value in order; a `__proto__` key stays a value. The CSR boot, the SSR client bridge, the CSR location and the RSC worker all read through it.
- `isMcpView()` and `router.postPathChange(change)` (`akanjs/client`): whether the page runs in an MCP host's view, and the `pathChange` message to the embedding frame, which an MCP view never posts.
- `ModalSurfaceProps` (`akanjs/ui`): the `presentation` and `placement` every modal surface takes.
- `TailwindBreakpoint` and `breakpointQuery(name, { below })` (`akanjs/client`), derived from `insetBreakpoints`, and `transitionTypes`, from which `TransitionType` is now derived.
- `getWebManifestBasePath` moves from `akanjs/server` to `akanjs/client`, beside `webManifestHref`.
