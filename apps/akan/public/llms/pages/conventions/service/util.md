# Service.Util.tsx

- Source: /conventions/service/util
- Mirror: /llms/pages/conventions/service/util.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service Util (#service-util)
- Client Helper Component (#client-helper)
- What Belongs Here (#what-belongs)

## Content

Service.Util.tsx

Service Util

A service Util file contains small client helper components for a service feature. It is useful for reusable controls such as action buttons, filters, toolboxes, and dialog triggers.

A service module may not need Util at first. A minimal placeholder is acceptable while the feature UI is still moving into Zone or app pages.

Client Helper Component

Service Util components are usually client components because they handle clicks, local UI state, or store actions. Keep them small enough to be reused inside Zone, Template, or app pages.

What Belongs Here

Put small pieces here when they are about service interaction but are not large enough to be a full Zone. Examples include resync buttons, search filter controls, upload controls, and reusable status badges.

## Code Examples

### small service control

```ts
"use client";

export const ResyncButton = () => {
  const searchIndexName = st.use.searchIndexName();
  return (
    <button onClick={() => st.do.resyncSearchDocuments()} disabled={!searchIndexName}>
      Resync
    </button>
  );
};
```

### when Util is enough

```ts
export const SearchInput = () => {
  return <input onChange={(e) => st.do.setSearchString(e.target.value)} />;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

