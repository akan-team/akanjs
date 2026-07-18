# Overview

- Source: /conventions/service/overview
- Mirror: /llms/pages/conventions/service/overview.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service Module Overview (#service-module-overview)
- When To Use It (#when-to-use)
- Service File Map (#file-map)
- Folder Shape (#folder-shape)

## Content

Overview

Server-only security workflow for encryption, JWT signing, and token verification.

Search feature module with service methods, endpoints, client store, and admin Zone UI.

Shared file-access service that reads blob data through a typed endpoint.

Describes the service workflow intent, domain rules, integration boundaries, and agent notes.

Implements the workflow itself and injects runtime values or other services.

Exposes the workflow through endpoint, internal task, cron, or custom route signals.

Names endpoint labels, endpoint arguments, and service UI phrases.

Owns service feature state, fetch calls, loading flags, and UI-facing actions.

Packages small client controls for the service feature when they are reusable.

Composes a full service feature section for admin pages or app pages.

Service Module Overview

A service module is a feature, workflow, or integration folder. It is useful when the code does not start from a document model, but still needs server logic, typed APIs, client state, and sometimes UI.

Service module folders usually start with an underscore. The files inside drop that underscore: `_search` owns `search.service.ts`, `search.signal.ts`, `search.store.ts`, and `Search.Zone.tsx`.

When To Use It

Use a normal module when the feature is centered on a business object such as User, Story, or Order. Use a service module when the feature is centered on an action or platform capability such as search, security, local files, or shared utilities.

Service File Map

A service module only needs the files that the feature actually uses. Start with service.abstract.md for workflow intent, then add service, signal, dictionary, store, Util, or Zone files as the feature grows.

Folder Shape

Start small. A server-only module might only have service and signal files. Add dictionary, store, Util, or Zone files when the feature becomes visible to users or admins.

## Code Examples

### _search service module

```ts
libs/util/lib/_search/
  search.abstract.md     // workflow intent
  search.service.ts      // workflow
  search.signal.ts       // API
  search.dictionary.ts   // text
  search.store.ts        // client state
  Search.Util.tsx        // small controls
  Search.Zone.tsx        // page section
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

