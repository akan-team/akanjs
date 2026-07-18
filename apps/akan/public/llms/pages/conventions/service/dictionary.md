# service.dictionary.ts

- Source: /conventions/service/dictionary
- Mirror: /llms/pages/conventions/service/dictionary.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service Dictionary (#service-dictionary)
- Endpoint Labels (#endpoint-labels)
- Endpoint Arguments (#endpoint-args)
- Translate Keys (#translate-keys)
- Using Keys (#using-keys)

## Content

service.dictionary.ts

Service Dictionary

A service dictionary names the service-facing language: endpoint labels, endpoint arguments, button text, toast messages, and small UI phrases. It is not tied to model fields.

Use `serviceDictionary(["en", "ko"])` for service modules. Add endpoint translations when the service exposes APIs and translate keys when UI or store messages need reusable text.

Endpoint Labels

Use `.endpoint<Endpoint>()` to keep endpoint names and descriptions typed. The callback keys should match the signal endpoint methods.

Endpoint Arguments

Use `.arg(...)` when endpoint params, search values, or body values need labels in docs, generated UI, admin screens, or validation messages.

Translate Keys

Use `.translate({ ... })` for service UI phrases that are not endpoint names. This is common for toast messages, status labels, common controls, and admin UI text.

Using Keys

Client UI can read service endpoint labels through `l("search.signal.resyncSearchDocuments")`. Store actions can use translated loading, success, and error keys for messages when the service action runs.

## Code Examples

### endpoint label

```ts
import { serviceDictionary } from "akanjs/dictionary";
import type { SearchEndpoint } from "./search.signal";

export const dictionary = serviceDictionary(["en", "ko"]).endpoint<SearchEndpoint>((fn) => ({
  getSearchResult: fn(["Get search result", "검색 결과 가져오기"]),
}));
```

### one argument

```ts
export const dictionary = serviceDictionary(["en", "ko"]).endpoint<SearchEndpoint>((fn) => ({
  getSearchResult: fn(["Get search result", "검색 결과 가져오기"]).arg((t) => ({
    searchIndexName: t(["Search index name", "검색 인덱스 이름"]),
  })),
}));
```

### service phrases

```ts
export const dictionary = serviceDictionary(["en", "ko"]).translate({
  loading: ["Loading...", "불러오는 중..."],
  healthy: ["Healthy", "정상"],
});
```

### client usage

```ts
<button>{l("search.signal.getSearchResult")}</button>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

