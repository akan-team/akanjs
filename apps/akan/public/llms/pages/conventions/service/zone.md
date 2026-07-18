# Service.Zone.tsx

- Source: /conventions/service/zone
- Mirror: /llms/pages/conventions/service/zone.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service Zone (#service-zone)
- Store-Driven Section (#store-driven-section)

## Content

Service.Zone.tsx

Service Zone

A service Zone is a client page section for a service feature. It composes store state, store actions, service UI controls, loading indicators, results, and pagination.

It is not a model list section by default. The `_search` Zone renders search administration UI, even though search itself is a service workflow rather than a document model.

Because service modules are workflow-oriented, service Zones are fairly flexible. Treat them as client components where you can freely compose the controls, result views, and domain-specific UI that the service needs.

Store-Driven Section

A service Zone usually reads state through `st.use.*` and runs feature actions through `st.do.*`. Keep data loading in store actions and let Zone focus on composition.

When a small interaction is reused, pull it from the service Util file. Zone can then arrange those Util pieces with local domain components into the final page section.

## Code Examples

### minimal service zone

```ts
"use client";

export const Database = () => {
  const searchIndexName = st.use.searchIndexName();
  const searchResult = st.use.searchResult();

  useEffect(() => {
    void st.do.getSearchIndexNames();
  }, []);

  return <SearchResults result={searchResult} disabled={!searchIndexName} />;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

