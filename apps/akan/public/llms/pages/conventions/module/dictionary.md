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
- Extending A Library Model (#generated-extension)
- Scalar And Service Dictionaries (#scalar-service-dictionaries)
- Errors, UI Text, And Languages (#errors-language-rules)
- Rules At A Glance (#practical-rules)

## Content

model.dictionary.ts

`<model>.dictionary.ts` is the module's language layer. It gives every name a user reads a label in each language: fields, insight values, filters, sort orders, enum values, slices, endpoints, errors and the module's own UI text.

Code never writes that text itself; it asks for it by key, such as `l("ticket.title")`. The keys are typed against the constant, filter, slice and endpoint, so adding a field without a label is a compile error.

Words used on this page

Term

- label: The text a user reads for one name, written once per language: `t(["Title", "제목"])`.

- desc: A longer explanation added with `.desc([en, ko])`. Forms show it as a tooltip.

- key: The dotted path code uses to read a label, such as `ticket.title`.

- language tuple: One entry per language, in the order the builder was given: `["Title", "제목"]`.

- stage: One call in the chain, such as `.model()` or `.error()`. Each labels one kind of name.

Model Dictionary Pattern

A database module uses `modelDictionary`. The stage order is fixed, and a stage with nothing to label is still written, empty, so every dictionary reads the same way.

Here is the complete file for the ticket module from the constant and document pages:

**`t` makes a label; `fn` makes one with arguments.** `.query()`, `.slice()` and `.endpoint()` hand you `fn`, whose `.arg()` names every argument the filter or signal declares.

**Nothing can be skipped.** Each stage must cover every field, query, value, slice or endpoint its type declares, including `skip`, `limit` and `sort` when a custom endpoint takes them. A missing one is a type error.

**Give nearly every label a `.desc()`,** even when it repeats the label. Forms show it as a tooltip, and API docs and AI agents read an endpoint's description.

What each stage labels

Each stage writes its labels under a fixed key. The example column shows the keys from the file above:

Stage

What it labels

- .of(): The module itself.

- .model(): Every model field. `id`, `createdAt`, `updatedAt` and `removedAt` come labelled.

- .insight(): Every insight field. The built-in `count` comes labelled. — Example: `ticket.insight.activeCount`

- .query(): Every filter query and its arguments. The built-in `any` comes labelled.

- .sort(): Every sort order. `latest`, `oldest` and `relevance` come labelled. — Example: `ticket.sort.due`

- .enum(): Every value of one `enumOf`. The key starts with the enum's name, not the model's. — Example: `ticketStatus.inProgress`

- .slice(): Every named slice, as a list key and an insight key. The root slice comes labelled.

- .endpoint(): Every custom endpoint and its arguments. Generated CRUD such as `createTicket` comes labelled.

- .error(): Error messages, written as plain language tuples. — Example: `ticket.error.cannotOpen`

- .translate(): Any other phrase the module shows, such as toasts and button text. — Example: `ticket.openTicketLoading`

Using Dictionaries

Code reads the dictionary through three helpers. Each takes a key, and the user reads the text in their own language.

Helper

- l(key): A label on screen, in a server or client component. Get `l` from `usePage()`. — Example: `l("ticket.title")`

- new Err(key): An error thrown in a document or service. Import `Err` from `../dict`. — Example: `throw new Err("ticket.error.cannotOpen");`

- msg.success(key): A toast from a store action. Import `msg` from `../useClient`. — Example: `msg.success("ticket.openTicketSuccess");`

On screen

A Template reads a field's label by its key, and the description by that key plus `.desc`:

**`usePage()` works on the server too,** so translated text never needs `"use client"`. This Template has it for the store.

**`desc` becomes a help icon** beside the label, with the description as its tooltip.

**`l()` accepts only keys that exist,** so a typo is a type error. `l("key", { name })` fills a `{name}` placeholder in the text.

In server code

A document method throws the error by key when a state change is not allowed:

**The key travels, not the sentence.** The client receives the key and its data, so each user reads the message in their own language.

**The second argument fills placeholders:** `new Err("ticket.error.overdue", { days })` puts the number into `{days}`.

**A subclass sets the HTTP status.** `Err` answers 400; `Err.BadRequest`, `Err.Unauthorized`, `Err.Forbidden`, `Err.NotFound` and `Err.Conflict` answer 400, 401, 403, 404 and 409.

In a store

A store action wraps the call in a loading toast and a success toast:

**The same `key` swaps one toast for the next,** so the success toast replaces the loading one instead of stacking under it.

**`msg.error` also takes an `.error()` key.** For a check that stops before calling the server, write `msg.error("ticket.error.cannotOpen")` and return early.

**Two more options:** `duration` in seconds (3 by default) and `data` for placeholders.

Extending A Library Model

An app can extend a model a lib already ships, such as `user` from `libs/shared`. Its dictionary then starts from the lib's, and the app writes only what it adds.

Pass the lib's dictionaries to `modelDictionary`, right after the language list:

**`user.dictionaries` comes from a generated file.** `../__lib/lib.dictionary` exports one entry for each model the app shares with a lib. Import it; never edit it.

**The lib's labels stay.** Its fields, queries, errors and `translate()` entries remain, so `.model<User>()` asks only for fields the lib did not label, like `githubInfo` here.

Scalar And Service Dictionaries

Pick the builder by the kind of module. Each builder offers only the stages that fit it, so a scalar has no queries and a service has no fields.

**`modelDictionary`** for a database module in `lib/<model>/`, which can use every stage.

**`scalarDictionary`** for an embedded value in `lib/__scalar/<name>/`. It usually needs only fields, enum values, errors and a little text.

**`serviceDictionary`** for a service module in `lib/_<name>/`, or for app-level text that belongs to no model.

Model — modelDictionary

Scalar — scalarDictionary

Service — serviceDictionary

- Name the module and its values

  - .of()

  - .model()

  - .enum()

- Name what the database answers

  - .insight()

  - .query()

  - .sort()

- Name the API

  - .slice()

  - .endpoint()

- Messages

  - .error()

  - .translate()

Available

Not available

{num} stages

A scalar labels its own fields and enum values:

A service module with no endpoints of its own can hold nothing but shared UI text:

**A service's endpoints are labelled the same way** with `.endpoint<OauthEndpoint>()`, and their keys sit under `<service>.signal.<endpoint>`.

Errors, UI Text, And Languages

`.error()` holds messages about something that went wrong, and `.translate()` holds every other phrase the module shows. Both take plain language tuples, with no `t()` and no `.desc()`.

A word in braces is a placeholder, filled from the data passed along with the key:

**Where the keys land:** an error under `error`, as `ticket.error.overdue`; a phrase right under the module, as `ticket.openTicketLoading`.

**How labels are written:** English in Title Case, Korean as the plain domain term, and every Korean `.error()` sentence ends in `다.`

The language list

The array passed to the builder is the language list, and every tuple follows its order. A dictionary can declare more than two:

**The compiler checks the length, not the order.** `["제목", "Title"]` compiles and shows Korean to English readers.

**The app decides which languages it serves.** `i18n: { defaultLocale, locales }` in `akan.config.ts` lists them; the default is `en` out of `["en", "ko"]`.

**A missing language falls back.** A language the dictionary does not declare reads the default language's text, and a key no language has shows as the key itself.

Rules At A Glance

**Keys follow the types.** Keep them aligned with the constant, filters, slices and endpoints rather than inventing free-form strings.

**Labels are for people.** "Due Date" reads better than the variable name `due`.

**Add `.desc()`** wherever a label can reach forms, tooltips, API docs or an AI agent.

**One helper per place:** `l()` from `usePage()` in UI, `Err` in server logic, `msg` in stores.

**Extend before you add.** A model a lib already has starts from `...model.dictionaries`, then adds the app's own labels.

**Every tuple follows the language list,** in both order and length.

Common mistakes

Instead of

Write

- `l("ticket.status.active")` — Enum keys start with the enum's name: `l("ticketStatus.active")`.

- Text typed straight into JSX — Every visible string goes through `l("ticket.modelName")` or `l.trans({ en, ko })`.

- Deleting a stage that has nothing in it — Keep it empty, such as `.insight<TicketInsight>((t) => ({}))`.

- An endpoint label with no `.desc()` — Write one. AI agents choose a tool by the endpoint's description.

**Never `throw new Error`.** Throw `new Err("<module>.error.<key>")` and register the key in that module's `.error()`. A raw `Error` fails lint, and lint failures break the build.

Read next

- model.constant.ts — The fields and enums the dictionary labels.

- model.store.ts — Store actions that show loading and success toasts.

- scalar.dictionary.ts — The dictionary of an embedded value.

- akan.config.ts · i18n — Which languages the app serves, and its default.

## Code Examples

### apps/koyo/lib/ticket/ticket.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary";

import type { Ticket, TicketInsight, TicketStatus } from "./ticket.constant";
import type { TicketFilter } from "./ticket.document";
import type { TicketEndpoint, TicketSlice } from "./ticket.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Ticket", "티켓"]).desc(["A support request from a customer", "고객이 남긴 지원 요청"]))
  .model<Ticket>((t) => ({
    title: t(["Title", "제목"]).desc(["Title of the ticket", "티켓 제목"]),
    content: t(["Content", "내용"]).desc(["Body of the ticket", "티켓 본문"]),
    type: t(["Type", "유형"]).desc(["Type of the ticket", "티켓 유형"]),
    status: t(["Status", "상태"]).desc(["Current status of the ticket", "티켓의 현재 상태"]),
    due: t(["Due Date", "기한"]).desc(["When the ticket must be handled", "티켓을 처리해야 하는 기한"]),
  }))
  .insight<TicketInsight>((t) => ({
    activeCount: t(["Active Tickets", "활성 티켓"]).desc(["Number of active tickets", "활성 티켓 개수"]),
  }))
  .query<TicketFilter>((fn) => ({
    inProject: fn(["In Project", "프로젝트별 조회"]).arg((t) => ({
      project: t(["Project", "프로젝트"]).desc(["Project to look in", "조회할 프로젝트"]),
    })),
  }))
  .sort<TicketFilter>((t) => ({
    due: t(["Due Date", "기한순"]).desc(["Earliest due date first", "기한이 빠른 순"]),
  }))
  .enum<TicketStatus>("ticketStatus", (t) => ({
    active: t(["Active", "활성"]).desc(["Waiting to be opened", "열리기를 기다리는 상태"]),
    opened: t(["Opened", "열림"]).desc(["Opened with a due date", "기한을 정해 연 상태"]),
    inProgress: t(["In Progress", "진행 중"]).desc(["Someone is working on it", "처리 중인 상태"]),
    completed: t(["Completed", "완료"]).desc(["Handled and closed", "처리를 마친 상태"]),
  }))
  .slice<TicketSlice>((fn) => ({
    inProject: fn(["Tickets In Project", "프로젝트의 티켓"]).arg((t) => ({
      projectId: t(["Project", "프로젝트"]).desc(["Project to list tickets of", "티켓을 불러올 프로젝트"]),
    })),
  }))
  .endpoint<TicketEndpoint>((fn) => ({
    openTicket: fn(["Open Ticket", "티켓 열기"])
      .desc(["Opens an active ticket and sets its due date", "활성 티켓을 열고 기한을 정합니다"])
      .arg((t) => ({
        ticketId: t(["Ticket ID", "티켓 아이디"]).desc(["Ticket to open", "열 티켓"]),
        due: t(["Due Date", "기한"]).desc(["When the ticket must be handled", "처리 기한"]),
      })),
  }))
  .error({
    cannotOpen: ["Only an active ticket can be opened", "활성 상태인 티켓만 열 수 있습니다."],
  })
  .translate({
    openTicketLoading: ["Opening the ticket…", "티켓을 여는 중입니다."],
    openTicketSuccess: ["Ticket opened", "티켓을 열었습니다."],
  });
```

### .of()

```ts
ticket.modelName
ticket.modelDesc
```

### .model()

```ts
ticket.title
ticket.title.desc
```

### .query()

```ts
ticket.query.inProject
ticket.query.inProject.arg.project
```

### .slice()

```ts
ticket.signal.ticketListInProject
ticket.signal.ticketInsightInProject
```

### .endpoint()

```ts
ticket.signal.openTicket
ticket.signal.openTicket.arg.due
```

### apps/koyo/lib/ticket/Ticket.Template.tsx

```tsx
"use client";
import { st, usePage } from "@apps/koyo/client";
import { Field, Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const ticketForm = st.use.ticketForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("ticket.title")}
        desc={l("ticket.title.desc")}
        value={ticketForm.title}
        onChange={st.do.setTitleOnTicket}
      />
    </Layout.Template>
  );
};
```

### apps/koyo/lib/ticket/ticket.document.ts

```ts
import { by } from "akanjs/document";

import * as cnst from "../cnst";
import { Err } from "../dict";

export class Ticket extends by(cnst.Ticket) {
  // active -> opened
  open() {
    if (this.status !== "active") throw new Err("ticket.error.cannotOpen");
    this.status = "opened";
    return this;
  }
}
```

### apps/koyo/lib/ticket/ticket.store.ts

```ts
import type { Dayjs } from "akanjs/base";
import { store } from "akanjs/store";

import { fetch, msg, sig } from "../useClient";

export class TicketStore extends store(sig.ticket, () => ({})) {
  async openTicket(id: string, due: Dayjs) {
    msg.loading("ticket.openTicketLoading", { key: "openTicket" });
    this.setTicket(await fetch.openTicket(id, due));
    msg.success("ticket.openTicketSuccess", { key: "openTicket" });
  }
}
```

### apps/koyo/lib/user/user.dictionary.ts

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

### libs/util/lib/__scalar/coordinate/coordinate.dictionary.ts

```ts
import { scalarDictionary } from "akanjs/dictionary";

import type { Coordinate, CoordinateType } from "./coordinate.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Coordinate", "좌표"]).desc(["Geographic coordinate information", "지리적 좌표 정보"]))
  .model<Coordinate>((t) => ({
    type: t(["Type", "타입"]).desc(["Coordinate type", "좌표 타입"]),
    coordinates: t(["Coordinates", "좌표"]).desc(["Longitude and latitude values", "경도와 위도 값"]),
    altitude: t(["Altitude", "고도"]).desc(["Altitude in meters", "미터 단위 고도"]),
  }))
  .enum<CoordinateType>("coordinateType", (t) => ({
    Point: t(["Point", "포인트"]).desc(["Point coordinate type", "포인트 좌표 타입"]),
  }));
```

### libs/util/lib/_util/util.dictionary.ts

```ts
import { serviceDictionary } from "akanjs/dictionary";

export const dictionary = serviceDictionary(["en", "ko"]).translate({
  home: ["Home", "홈"],
  back: ["Back", "뒤로가기"],
  next: ["Next", "다음"],
});
```

### apps/koyo/lib/ticket/ticket.dictionary.ts

```ts
.error({
  cannotOpen: [
    "Only an active ticket can be opened",
    "활성 상태인 티켓만 열 수 있습니다.",
  ],
  overdue: [
    "The ticket is {days} days overdue",
    "티켓 기한이 {days}일 지났습니다.",
  ],
})
.translate({
  openTicketLoading: ["Opening the ticket…", "티켓을 여는 중입니다."],
  openTicketSuccess: ["Ticket opened", "티켓을 열었습니다."],
})
```

### apps/koyo/lib/_koyo/koyo.dictionary.ts

```ts
import { serviceDictionary } from "akanjs/dictionary";

export const dictionary = serviceDictionary(["en", "ko", "zhChs", "zhCht"])
  .translate({
    menuGallery: ["Gallery", "갤러리", "画廊", "畫廊"],
  });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

