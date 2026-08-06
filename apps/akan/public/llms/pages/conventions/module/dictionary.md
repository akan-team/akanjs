# model.dictionary.ts

- Source: /conventions/module/dictionary
- Mirror: /llms/pages/conventions/module/dictionary.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.dictionary.ts (#dictionary-overview)
- Model Dictionary Pattern (#model-dictionary-pattern)
- Using Dictionaries (#using-dictionary)
- Extending Generated Dictionaries (#generated-extension)
- Scalar And Service Dictionaries (#scalar-service-dictionaries)
- Errors, UI Text, And Languages (#errors-language-rules)
- Practical Rules (#practical-rules)

## Content

model.dictionary.ts

A dictionary file is the language layer of a module. It gives user-facing names to model fields, insight values, queries, sort options, enums, slices, endpoints, errors, and module-specific UI text.

The current pattern is typed. Dictionary keys should follow the shape of the constant, document filter, slice, and endpoint instead of becoming arbitrary translation strings.

Model Dictionary Pattern

Use modelDictionary for normal document models. The chain usually starts with the model name, then adds field labels, insight labels, document query/sort labels, enum values, signal labels, errors, and custom UI text.

Labels fields from the constant model. Base fields such as id, createdAt, updatedAt, and removedAt are added automatically.

Labels reporting fields. The base count insight is added automatically.

Labels document filter options. Base query and sort labels such as any, latest, oldest, and relevance are included.

Using Dictionaries

After a dictionary is declared, most code uses it through generated helpers. Client components read translated labels with usePage(), server code throws Err with an error key, and client stores show translated toast messages with msg.

Extending Generated Dictionaries

When an app extends a generated or library model, extend the generated dictionaries too. Passing ...user.dictionaries keeps the base dictionary entries and lets the app add only its custom fields, endpoints, or phrases.

Scalar And Service Dictionaries

Choose the dictionary builder by module shape. Document models use modelDictionary, embedded scalar values use scalarDictionary, and service-only modules use serviceDictionary.

For document models with model, insight, query, sort, slice, endpoint, error, and custom translations.

For embedded scalar values. It usually needs only model fields, enum values, errors, or small custom text.

For service modules or app-level dictionaries without a document model.

Errors, UI Text, And Languages

Use error() for domain errors and translate() for module-specific UI phrases. The translation array order must match the language list exactly.

Practical Rules

Keep dictionary keys aligned with typed constants, filters, slices, and endpoints.

Use clear labels for users, not raw variable names. For example, Due Date is better than due.

Add desc() when the label may appear in generated docs, forms, or tooltips.

Use usePage translation in client UI, Err in server logic, and msg in client stores when showing dictionary text.

Extend generated dictionaries with ...model.dictionaries before adding app-specific translations.

Keep every translation tuple in the same order and length as the language list.

## Code Examples

### ticket.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary";

import type { Ticket, TicketInsight, TicketStatus } from "./ticket.constant";
import type { TicketFilter } from "./ticket.document";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Ticket", "티켓"]).desc(["Ticket", "티켓"]))
  .model<Ticket>((t) => ({
    title: t(["Title", "제목"]).desc(["Title", "제목"]),
  }))
  .insight<TicketInsight>((t) => ({
    appCount: t(["App Tickets", "앱 티켓"]).desc(["App ticket count", "앱 티켓 개수"]),
  }))
  .query<TicketFilter>((fn) => ({
    inProject: fn(["In Project", "프로젝트별 조회"]).arg((t) => ({
      project: t(["Project", "프로젝트"]),
    })),
  }))
  .sort<TicketFilter>((t) => ({
    due: t(["Due Date", "기한"]),
  }))
  .enum<TicketStatus>("ticketStatus", (t) => ({
    active: t(["Active", "활성"]),
  }));
```

### Client UI

```ts
import { usePage } from "@apps/myapp/client";

export const UserNameField = () => {
  const { l } = usePage();
  return <Field.Text label={l("user.name")} desc={l("user.name.desc")} />;
};
```

### Server Error

```ts
import { Err } from "../dict";

if (!ticket.canArchive()) {
  throw new Err("ticket.error.cannotArchive");
}
```

### Client Toast

```ts
import { msg } from "@apps/myapp/client";

msg.loading("ticket.openTicketLoading", { key: "openTicket" });
await fetch.openTicket(ticketId, due);
msg.success("ticket.openTicketSuccess", { key: "openTicket" });
msg.error("ticket.error.cannotArchive");
```

### user.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary";

import { user } from "../__lib/lib.dictionary";
import type { User } from "./user.constant";

export const dictionary = modelDictionary(["en", "ko"], ...user.dictionaries)
  .model<User>((t) => ({
    githubInfo: t(["Github Info", "깃허브 정보"]).desc(["Github info of the user", "유저의 깃허브 정보"]),
  }))
  .translate({});
```

### coordinate.dictionary.ts

```ts
import { scalarDictionary } from "akanjs/dictionary";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Coordinate", "좌표"]).desc(["Geographic coordinate information", "지리적 좌표 정보"]))
  .model<Coordinate>((t) => ({
    type: t(["Type", "타입"]).desc(["Coordinate type", "좌표 타입"]),
  }))
  .enum<CoordinateType>("coordinateType", (t) => ({
    Point: t(["Point", "포인트"]),
  }));
```

### util.dictionary.ts

```ts
import { serviceDictionary } from "akanjs/dictionary";

export const dictionary = serviceDictionary(["en", "ko"]).translate({
  home: ["Home", "홈"],
});
```

### ticket.dictionary.ts

```ts
.error({
  cannotArchive: ["Cannot archive ticket that is not completed", "완료되지 않은 티켓은 보관할 수 없습니다"],
})
.translate({
  openTicketLoading: ["Opening.", "오픈중입니다."],
})
```

### akan.dictionary.ts

```ts
export const dictionary = serviceDictionary(["en", "ko", "zhChs", "zhCht"]).translate({
  menuGallery: ["Gallery", "갤러리", "画廊", "畫廊"],
});
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

