# model.constant.ts

- Source: /conventions/module/constant
- Mirror: /llms/pages/conventions/module/constant.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.constant.ts (#constant-overview)
- Field Options (#field-options)
- Hidden, Secret, Visual (#masking)
- The Instance And Its Logic (#instance-and-helpers)
- Text Search Fields (#text-search-fields)
- Cascade Remove Fields (#cascade-fields)
- Resolved Fields (#resolve-fields)
- Extending Library Models (#generated-extension)
- Practical Rules (#practical-rules)

## Content

model.constant.ts

This one file describes the shape of one business object. The storage schema, the generated CRUD, form state, the API contract, the admin explorer and the schema an AI agent reads all come from it, so no other file in the module restates the fields.

Open it whenever a field is added, changed or removed, and whenever the model needs display or predicate logic.

Words Used On This Page

Term

- document: One stored record of a model, such as one ticket.

- relation: A field whose type is another model, like `File`. It stores the id and loads the model.

- scalar: A value object declared under `lib/__scalar/`, stored inside the document, not as its own row.

- hydrate: Turning fetched plain data back into a model instance, with its methods and `Dayjs` dates.

- projection: A read option naming extra fields to load, such as `{ secret: true }`.

- agent: An AI caller: the in-page agent or an MCP client.

Five Classes, Always In This Order

Write all five even when one is empty, and build each with `via()`. Later files in the module reuse these classes by name.

Class

- TicketInput: Fields a user fills in when creating or editing the model. — Example: `via((field) => ({ … }))`

- TicketObject: Input plus stored fields that the system or a service manages. — Example: `via(TicketInput, (field) => ({ … }))`

- LightTicket: The few fields a list, a relation or a card returns. Server and client both hold it. — Example: `via(TicketObject, ["title", "status"] as const, (resolve) => ({}))`

- Ticket: The full model: Object and Light combined. Collection helpers go here as statics. — Example: `via(TicketObject, LightTicket, (resolve) => ({}))`

- TicketInsight: Counters for dashboards. It always has `count`, and you write it even when it is empty. — Example: `via(Ticket, (field) => ({ … }))`

Here is the complete file for a support ticket:

**Two `as const` do real work.** On the `enumOf` array it turns the values into a union type instead of `string[]`; on the Light tuple it tells `via()` which keys the Light has.

**Never use the TypeScript `enum` keyword.** `enumOf` is the vocabulary: `TicketStatus["value"]` is the value union and `TicketStatus.values` is the list.

**Comment a field only when its business meaning is not obvious,** the way `due` does. That comment belongs beside the field, not in the abstract, which holds invariants rather than a field list.

Field Options

`field(Type, options)` declares one stored field: first its type, then one object of options. The options object may be left out.

Types

Type

- String, Boolean, Date: JavaScript globals, so no import. A `Date` field reads back as a `Dayjs`.

- Int, Float: Whole and decimal numbers from `akanjs/base`. `Number` does not typecheck as a field type.

- ID: Another document's id. Name the model it points at with the `ref` option.

- Any: A free-form payload. Use it only when the content really is open.

- TicketStatus: An `enumOf` class. The stored value must be one of its values.

- [T]: An array of any type on this list. It defaults to `[]`.

- Map: A string-keyed map. The `of` option names the value type and is required.

- Coordinate: A scalar class: a value object embedded in the document.

- File: A model class, which makes the field a relation. It stores the id.

- Binary, Upload: Never a model field. Store bytes by referencing the `File` model instead.

Values And References

- default (T | (doc) => T, default [] for an array, else null): A literal for a plain value, a thunk such as `() => dayjs()` for anything constructed.

- ref (string): The model an `ID` field points at, when you store an id instead of a relation.

- refPath (string): The field holding a polymorphic owner's model name: an `enumOf`, or a `String` for `removeWithAny`.

- of (scalar or model class): The value type of a `Map` field. Required for a Map.

- refType ("child" | "parent" | "relation"): A label for the kind of relation, shown in the schema docs. It changes no behavior.

Search, Cascade And Agents

- text ("title" | "desc" | "tag" | "thumb" | "filter"): Adds the field to the full-text index under this role. See Text Search Fields.

- cascade ("removeRef" | "removeWith" | "removeWithAny"): Which side of the relation is removed along with the other. See Cascade Remove Fields.

- visual (boolean, default false): The page renders it and an agent never sees it. `field.visual(T)` is the short form.

Validation

- validate ((value, doc) => boolean): Runs when a document is created or saved, and `false` refuses it. `null` and `undefined` skip it.

- immutable (boolean, default false): Changing it in a document save throws. Query-level writes skip the check.

- min (number): A lower bound for the schema docs and `sampleOf()`. Enforce it with `validate`.

- max (number): An upper bound, used the same way.

- minlength (number): A length lower bound shown in the schema docs. On an array, the store checks the item count.

- maxlength (number): A length upper bound, handled the same way.

Samples And Counters

- example (T): A sample value for the schema docs and the API explorer's example request and response.

- type ("email" | "password" | "url"): Makes `sampleOf()` produce a realistic email, password or URL. It does not validate.

- accumulate (query object): Insight fields only: the condition this counter counts. `{}` counts every match.

Not In The Options Object

**`.optional()` is a chained method, not an option,** because it widens the declared type to `T | null` as well as the stored one.

**`.meta()` is the other chained method.** It attaches metadata to a field; a summary counter passes `getQueryMeta(…)` so its dashboard tile can filter the list.

**The call you make sets the rest.** `nullable`, `select`, `enum` and the field kind come from `.optional()`, `field.hidden` / `field.secret` and an `enumOf` type. An empty-string default, `default: ""`, also turns `nullable` on.

**Write a date default as `() => dayjs()`, never `dayjs()`.** A bare `dayjs()` is evaluated once when the class loads, so every row created afterwards shares that one moment.

Hidden, Secret, Visual

Three variants of `field()` decide who gets a value. `hidden` and `secret` are about secrecy: the value never leaves the server. `visual` is about cost: the page gets it, but an AI agent does not.

Declaration

Server default read

Page

AI agent

- Plain

  - field(T): An ordinary stored property. Every side gets it.

- Secrecy: the value stays on the server

  - field.hidden(T): Stored and read by the server, never sent to a client. Always nullable.

  - field.secret(T): Like hidden, and even the server's default read skips it until a projection asks.

- Cost: only the agent skips it

  - field.visual(T): Sent to the page as usual; stripped from agent reads, MCP results and the MCP schema.

Gets the value

Left out

**`hidden` is for internal state** that the document carries but no screen shows, such as an admin memo or a file's `mimetype`.

**`secret` is for credentials and personal data:** a password hash, a phone number, a token. Read one back only with a projection such as `pickById(id, &#123; secret: true &#125;)`, which widens the server's read and never the response.

**`visual` is for bulky data a model cannot use:** a blur placeholder, a rendered HTML body, a serialized geometry, each hundreds of tokens per record. Storage, search, forms and the page response are untouched, and nothing is refused over one.

**If a screen needs the value, it is neither hidden nor secret.** If it only needs to be cheap for a model, it is `visual`.

The shared `File` model uses both `hidden` and `visual`:

This part of the shared `User` model keeps its account data `secret`:

**A `hidden` or `secret` value reads `null` on the client, so guard it with `??` or `== null`.** The response leaves the key out, and hydration writes `null` there even over a declared default. A `hidden` field's type still says `string`, so nothing flags it until the value is dereferenced far from where it was read. `=== undefined` and destructuring or parameter defaults catch only a missing key.

The Instance And Its Logic

Put display and predicate logic on the Light class as methods. Server and client both hold a Light, so one method there works in a page, a card, a store action and a service.

Put it on

Logic about

- Light<Model>: Methods about one record: display text and predicates. — Example: `board.canWrite(user)`

- <Model> static: Helpers about a list of records. — Example: `Board.getBoard(boardList, boardId)`

- <Scalar> static: Math that belongs to the value itself, not to whoever stored it. — Example: `Coordinate.getDistanceKm(from, to)`

The board model shows the first two in one file:

**A Light method reads only the Light's keys.** `isPrivate()` and `canWrite()` use `policy` and `roles`, so both are in the tuple.

**This is the rule most often missed.** Skipping it is how util modules full of `ticketIsOverdue(ticket)` get started.

**A scalar splits the same way.** `Coordinate` in `libs/util` keeps its distance and bounds math as statics, because that arithmetic belongs to the value rather than to whoever stored it.

Copying An Instance

A `Date` field on a hydrated instance is a prototype accessor, not an own property. The instance keeps a native `Date` under a symbol and builds the `Dayjs` its type promises on first read.

Date Fields Go Missing

These read own properties only, so the dates are missing.

Date Fields Are There

These walk the prototype too, so the dates are there.

**Copy a model with `new cnst.User().set(user)`, never a spread.** A spread copy silently loses every date.

Text Search Fields

Give a field a `text` role and it joins the full-text index; that declaration is the whole setup. Pick the role by what the value is, because each role weighs differently when results are ranked.

Role

Weight

Accepts

What it holds

- `"title"` — 10 — `String` — The one line a person scans for, like a name or a headline.

- `"tag"` — 3 — `String` — A keyword list, such as a category or labels.

- `"desc"` — 1 — `String` — Prose, like a body or a description.

- `"filter"` — 0 — `String`, `ID`, relation — A scoping value such as status, role or owner. It matches but never outranks a title.

- `"thumb"` — — — `String`, `ID`, relation — Kept so a hit can be drawn. It is not indexed and never matches.

The shared `Banner` model uses all five. Its other fields are left out here:

**Arrays, string enums and embedded scalars work.** An array of strings is indexed, and an array of scalar objects is indexed by leaf key, even when the leaf is itself an array.

**A `Map` or a nested array takes no `text` role,** and a field inside a Map's value is not indexed. Neither has one fixed path to read the value from.

**The weights are defaults.** A query can pass its own `weights` or narrow the `columns` in `q.search()`.

**Search works in every database mode.** For the same text, SQLite, libSQL and Postgres match the same documents; only the order can differ on Postgres.

**A `secret`, `hidden` or resolved field takes no `text` role,** and neither does a field nested underneath one. The search mirror stores plaintext, so an indexed secret would leak through search.

Cascade Remove Fields

`cascade` says which side of a relation is removed along with the other. Both directions fit the same field shape, so a swapped value is not a bug you notice; it is data loss.

Value

Declared on

Meaning

- `removeRef` — The owner's own relation — When this document is removed, what the field points at is removed too.

- `removeWith` — The child's reference to its owner — When the owner is removed, this document is removed too.

- `removeWithAny` — The child's reference, when the owner can be any model — When the owner is removed, whatever its model, this document is removed too.

removeRef: On The Owner

Story owns its images

Story is removed

the File it points at

is removed too

points at

Declare it on the relation the owner holds, arrays included:

**Only a relation takes it.** A `String`, an `ID` or a scalar names no document to remove.

**It claims the target exclusively.** Nothing checks whether another document still references it, and `File` is deduped by `origin`, so two parents can share one row.

removeWith: On The Child

A session takes its chats with it

AgentSession is removed

every SessionChat naming it

by its id

Declare it on the child's own reference to its owner. Here it is an `ID` with `ref`:

When the owner can be one of several models, point `refPath` at an `enumOf` field listing their model names. It must be an enum, because a free-form owner type cannot be known ahead of time:

**The owner never learns about its children,** so an app model can be removed with a lib model without touching the lib.

**Three shapes are accepted:** a relation, an `ID` with `ref`, or an `ID` with `refPath`. An array, a `Map`, and `ref` together with `refPath` are not.

removeWithAny: An Owner Of Any Model

When the owner can be any model in the app, `refPath` names a plain `String` field that holds the owner's model name:

**It has a price.** Every removal in the app then checks this field with one indexed lookup, and no cascade anywhere in the app can remove in a single query anymore.

**If the owners are known, use `removeWith` with an `enumOf`.** `removeWithAny` does not take an `enumOf` type field.

What Every Cascade Shares

**The target's own `_postRemove` runs.** The cascade removes through the target's service, which is how removing a `File` also deletes the stored object.

**Query-level removal fires no hooks, so no cascade.** `remove<Filter>`, `removeMany` and `removeById` skip it; remove cascading documents one at a time.

**A cascade cannot be undone.** Removal is soft, since the row is only stamped, but the storage delete a `_postRemove` performs is not. Reviving the owner does not revive what went with it.

Resolved Fields

Some values belong to the record and the person looking at it: whether this user liked a story, how many times they read it, whether they may edit it. Storing those on the document would mean one row per viewer.

The Constant Names And Types It

Declared in the `resolve` callback of the Light or full model.

An Internal Signal Computes It

Runs on every request, with whatever caller context it asks for.

The story's Light declares two resolved fields:

The story's internal signal then computes `like` for whoever is asking. `view` is written the same way:

**The document comes first.** `exec` receives the story, then each `.with()` value in order.

**`self` can be `null`.** A signed-out visitor has no `Self`, so answer a default such as `0`.

**`.with(srv.actionLog)` brings in another service** as `this.actionLogService`. `countByTarget` is the generated count of its `byTarget` filter.

**No `text` role,** for the same reason as a secret: there is no stored value for the search mirror to copy.

Extending Library Models

An app that mounts a library model extends it instead of redeclaring it. Spread the library's classes at the end of each `via()` call, and the app's own fields sit beside the inherited ones:

**`user` comes from the app's generated `lib/__lib/lib.constant.ts`.** Every app module named like a library module gets such an export, holding the library's classes in five arrays: `inputs`, `objects`, `lights`, `models` and `insights`.

**Declare only what the app adds.** Here that is `favoriteFlavor`; every library field comes along.

**Light keys and methods add up.** `["roles"]` joins the library's Light keys, and the library's Light and model methods stay available.

Practical Rules

Check these before you commit a constant file.

**All five classes, in order.** Include an empty Insight, and put `as const` on every `enumOf` array and every Light tuple.

**Logic lives on the model.** Display and predicate logic on `Light<Model>`, collection helpers as statics on the full model, nothing in a util module.

**No non-null assertions.** Narrow with `?.`, an early return or a type predicate, and remember a hidden or secret value is `null`, not `undefined`.

**Comments only for business meaning.** A short trailing comment on a field whose meaning is not obvious, and nowhere else.

**Import other constants by file path.** `../file/file.constant`, not a barrel; it is the sanctioned exception to the deep-import rule.

Common Mistakes

Instead of

Write

- field(Number): Write `field(Int)` or `field(Float)`. `Number` does not typecheck.

- enum TicketStatus { … }: Write `enumOf("ticketStatus", [...] as const)`. A TypeScript `enum` is not a field type.

- default: dayjs(): Write `default: () => dayjs()`. A bare `dayjs()` runs once, so every row shares that moment.

- ticketIsOverdue(ticket): Write `ticket.isOverdue()` on `LightTicket`, which both server and client hold.

- { ...user }: Write `new cnst.User().set(user)`. A spread drops every `Date` field.

- field(Binary): Write `field(File)`. Bytes are not storable in a document; a `File` is.

- user.phone === undefined: Write `user.phone ?? ""`. A hidden or secret value arrives as `null`, not `undefined`.

## Code Examples

### apps/koyo/lib/ticket/ticket.constant.ts

```ts
import { dayjs, enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class TicketStatus extends enumOf("ticketStatus", [
  "active",
  "opened",
  "inProgress",
  "completed",
] as const) {}

export class TicketInput extends via((field) => ({
  title: field(String),
  content: field(String, { default: "" }),
  type: field(String, { default: "shared" }),
})) {}

export class TicketObject extends via(TicketInput, (field) => ({
  status: field(TicketStatus, { default: "active" }),
  due: field(Date, { default: () => dayjs().hour(19) }), // shop closes at 7pm
})) {}

export class LightTicket extends via(
  TicketObject,
  ["title", "status", "due"] as const,
  (resolve) => ({}),
) {}

export class Ticket extends via(
  TicketObject,
  LightTicket,
  (resolve) => ({}),
) {}

export class TicketInsight extends via(Ticket, (field) => ({
  activeCount: field(Int, { default: 0, accumulate: { status: "active" } }),
})) {}
```

### libs/shared/lib/file/file.constant.ts

```ts
export class FileInput extends via((field) => ({
  filename: field(String, { text: "title" }),
  mimetype: field.hidden(String),
  encoding: field.hidden(String),
  imageSize: field<[number, number]>([Int], { default: [0, 0] }),
  url: field(String, { default: "" }),
  abstractData: field.visual(String).optional(),
  size: field(Int, { default: 0 }),
  origin: field.hidden(String).optional(),
})) {}
```

### libs/shared/lib/user/user.constant.ts

```ts
export class UserObject extends via(UserInput, (field) => ({
  accountId: field.secret(String).optional(),
  password: field.secret(String).optional(),
  phone: field.secret(String).optional(),
  notiInfo: field.secret(NotiInfo),
  restrictInfo: field.secret(RestrictInfo).optional(),
  roles: field([UserRole], { default: ["user"], text: "filter" }),
})) {}
```

### apps/koyo/lib/board/board.constant.ts

```ts
export class LightBoard extends via(
  BoardObject,
  ["name", "policy", "roles"] as const,
  (resolve) => ({}),
) {
  isPrivate() {
    return this.policy.includes("private");
  }

  canWrite(user?: { roles: string[] }) {
    return !!user && this.roles.some((role) => user.roles.includes(role));
  }
}

export class Board extends via(BoardObject, LightBoard, (resolve) => ({})) {
  static getBoard(boardList: LightBoard[], boardId: string) {
    return boardList.find((board) => board.id === boardId);
  }
}
```

### libs/shared/lib/banner/banner.constant.ts

```ts
export class BannerInput extends via((field) => ({
  category: field(String, { text: "tag" }).optional(),
  title: field(String, { text: "title" }).optional(),
  content: field(String, { text: "desc" }).optional(),
  image: field(File, { text: "thumb" }).optional(),
  href: field(String),
})) {}

export class BannerObject extends via(BannerInput, (field) => ({
  status: field(BannerStatus, { default: "active", text: "filter" }),
})) {}
```

### apps/koyo/lib/story/story.constant.ts

```ts
export class StoryInput extends via((field) => ({
  title: field(String, { text: "title" }),
  thumbnail: field(File, { text: "thumb", cascade: "removeRef" }).optional(),
  images: field([File], { cascade: "removeRef" }),
})) {}
```

### apps/koyo/lib/sessionChat/sessionChat.constant.ts

```ts
export class SessionChatInput extends via((field) => ({
  agentSession: field(ID, { ref: "agentSession", cascade: "removeWith" }),
  content: field(String, { default: "", text: "desc" }),
})) {}
```

### apps/koyo/lib/reaction/reaction.constant.ts

```ts
export class ReactionParent extends enumOf("reactionParent", [
  "icecreamOrder",
  "story",
] as const) {}

export class ReactionInput extends via((field) => ({
  parent: field(ID, { refPath: "parentType", cascade: "removeWith" }),
  parentType: field(ReactionParent, { default: "icecreamOrder" }),
  emoji: field(String, { default: "" }),
})) {}
```

### apps/koyo/lib/comment/comment.constant.ts

```ts
export class CommentInput extends via((field) => ({
  parent: field(ID, { refPath: "parentType", cascade: "removeWithAny" }),
  parentType: field(String),
  content: field(String, { default: "", text: "desc" }),
})) {}
```

### apps/koyo/lib/story/story.constant.ts

```ts
export class LightStory extends via(
  StoryObject,
  ["root", "user", "title", "totalStat", "status"] as const,
  (resolve) => ({
    view: resolve(Int),
    like: resolve(Int),
  }),
) {
  setLike() {
    if (this.like > 0) return false;
    this.totalStat.likes += 1;
    this.like = 1;
    return true;
  }
}
```

### apps/koyo/lib/story/story.signal.ts

```ts
export class StoryInternal extends internal(
  srv.story.with(srv.actionLog),
  ({ resolveField }) => ({
    like: resolveField(Int)
      .with(Self, { nullable: true })
      .exec(async function (story, self) {
        if (!self) return 0;
        return await this.actionLogService.countByTarget(
          "like",
          story.id,
          self.id,
        );
      }),
  }),
) {}
```

### apps/koyo/lib/user/user.constant.ts

```ts
import { via } from "akanjs/constant";
import { user } from "../__lib/lib.constant";

export class UserInput extends via((field) => ({}), ...user.inputs) {}

export class UserObject extends via(
  UserInput,
  (field) => ({
    favoriteFlavor: field(String, { default: "" }),
  }),
  ...user.objects,
) {}

export class LightUser extends via(
  UserObject,
  ["roles"] as const,
  (resolve) => ({}),
  ...user.lights,
) {}

export class User extends via(
  UserObject,
  LightUser,
  (resolve) => ({}),
  ...user.models,
) {}

export class UserInsight extends via(
  User,
  (field) => ({}),
  ...user.insights,
) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

