# akanjs/fetch

- Source: /references/akanjs/fetch
- Mirror: /llms/pages/references/akanjs/fetch.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/fetch (#akanjs-fetch)

## Content

akanjs/fetch

Zone return type for initialized list pages. It contains list objects, insight object, pagination fields, query args, sort state, and init timestamp, and may be returned directly or as a Promise.

Zone return type for a single model view. It wraps the server view payload and supports both synchronous server component data and asynchronous client/server fetching.

Metadata carried with initialized slice data. UI helpers use it to know the ref name, slice name, and number of query arguments behind a list or insight block.

Option shape for list initialization. It controls page, limit, sort, default form values, invalidation, and whether insight data should be fetched together with the list.

Request account shape shared by server middleware and services. It always includes `appName` and `environment`, then allows app-specific account data to be added by generic parameter.

Runtime client that turns serialized signal metadata into typed HTTP and WebSocket fetch functions. App clients use the proxy around this class, while advanced tests can instantiate or clone it directly.

Server-side request helpers backed by AsyncLocalStorage or a request fallback stack. Use them in server components and fetch internals to read the current request without pulling client dependencies.

`akanjs/fetch` defines the typed client/server fetch boundary. Import it for Zone props, generated fetch client types, request-scoped headers/cookies/theme helpers, and advanced FetchClient usage.

Usage

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

