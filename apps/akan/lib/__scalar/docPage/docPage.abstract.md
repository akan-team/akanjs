# docPage Scalar Abstract

One page of the Akan.js documentation, as an agent addresses it: a route to read by, and enough menu context to
choose between pages without reading any of them.

## Rules

- `href` is the identity. It is the docs route (`/references/akanjs/signal`), not the mirror path — the mirror is
  derived from it, so a page cannot be addressed two ways.
- Every field is derived from the generated corpus under `public/llms/pages`. Nothing here is authored by hand, so
  a field this scalar declares must be one `generateLlms.ts` actually writes into the page header.
- `priority` is the generator's reading order, not an importance the docs team edits per page.
