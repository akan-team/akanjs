# service.store.ts

- Source: /conventions/service/store
- Mirror: /llms/pages/conventions/service/store.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service Store (#service-store)
- String Store Ref (#string-store)
- Fetch Actions (#fetch-actions)
- Feature State (#pagination-state)

## Content

service.store.ts

Service Store

A service store coordinates client state for a service feature. It owns local state, fetch calls, loading flags, selected values, pagination, and UI-facing actions.

Service stores usually start with a string reference: `store("search" as const, ...)`. They do not automatically receive model form, slice, or CRUD helpers unless the store is bound to a model signal.

String Store Ref

Use the service name as the store ref. The state factory returns the initial local state for the feature, not a generated model form.

Fetch Actions

Service store methods usually call generated `fetch.*` functions from service endpoints, then update local state with `set()`. This keeps React components thin.

Feature State

Keep service-specific UI state in the store when several controls need to share it. Search text, selected index, current page, and loading status are good examples.

## Code Examples

### minimal service store

```ts
export class SearchStore extends store("search" as const, () => ({
  searchIndexName: null as string | null,
  loading: false,
  searchString: "",
})) {}
```

### loading and fetch

```ts
async setSearchIndexName(searchIndexName: string) {
  this.set({ searchIndexName, loading: true });

  const searchResult = await fetch.getSearchResult(searchIndexName);

  this.set({ searchResult, loading: false });
}
```

### pagination action

```ts
async setPage(page: number) {
  const { searchIndexName } = this.get();
  if (!searchIndexName) return;

  const searchResult = await fetch.getSearchResult(searchIndexName, { page });
  this.set({ page, searchResult });
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

