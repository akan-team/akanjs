# model.constant.ts

- Source: /conventions/module/constant
- Mirror: /llms/pages/conventions/module/constant.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.constant.ts (#constant-overview)
- Model Layering Pattern (#model-layering)
- Fields And enumOf (#fields-enums)
- field.hidden And field.secret (#hidden-secret-fields)
- Extending Generated Models (#generated-extension)
- Light And Full Model Helpers (#model-helpers)
- Resolved Fields (#resolve-fields)
- Scalar Constants And Static Utilities (#scalar-static-utilities)
- Insight Constants (#insight-constants)
- Practical Rules (#practical-rules)

## Content

model.constant.ts

A constant file defines the business shape of a model. It declares fields, enums, embedded scalar values, generated views, and small helper behavior that should travel with the data type.

The current Akan pattern is based on via(). Each class builds a different view of the same business model, and later document, service, signal, store, and UI code reuse those generated types.

Model Layering Pattern

Most document models use the same five layers: Input, Object, Light, full Model, and Insight. Start with this shape unless the model is a small embedded scalar.

Fields accepted when creating or editing the model.

Input plus stored fields controlled by the system or service.

Small view for list, relation, and card-style queries.

Full model that combines Object and Light, often with static helpers.

Aggregation or reporting fields for analytics.

Fields And enumOf

Use field() to describe values and enumOf() to define categorical values. Keep field options close to business needs: defaults, optional values, references, hidden or secret fields, examples, and aggregation.

field.hidden And field.secret

field.hidden() and field.secret() are helper forms for fields that should not behave like normal public properties. Both create hidden, nullable fields. field.secret() also sets select: false, so it is not selected by default when documents are loaded.

Use it for internal state that may exist on the document but should not be treated as a normal visible field.

Use it for sensitive values such as password, phone, token, account id, wallet, or notification settings that should not be selected by default.

Extending Generated Models

Some apps extend generated model hooks from the app or library template. Spread generated inputs, objects, lights, models, and insights into via() so custom fields and generated fields stay together.

Light And Full Model Helpers

A constant class can include small helper methods when the behavior belongs to the data type itself. Instance helpers fit Light classes, while list or lookup helpers often fit the full Model class as static methods.

Resolved Fields

Light and full models can declare resolved fields with the resolve helper. A resolved field is not stored directly on the document. The constant declares the field name and type, and an internal signal defines how to calculate it when the client fetches the model.

This is useful for viewer-specific values such as whether the current user liked a story, read count for this user, permission flags, or other values that depend on request context.

Scalar Constants And Static Utilities

Scalars are embedded values without their own collection. They can still expose useful static helpers, especially for calculations or transforms that belong to the scalar value.

Insight Constants

Insight constants describe aggregated or reporting-oriented values. Use them for dashboard counts, summaries, and grouped statistics instead of mixing reporting fields into the normal model shape.

Practical Rules

Use the Input, Object, Light, Model, Insight layers for document models unless the value is a small embedded scalar.

Use enumOf for business categories and refer to its value type when you need the union.

Use generated extension spreads when the app template provides inputs, objects, lights, models, or insights.

Use field.hidden for hidden internal values and field.secret for sensitive values that should not be selected by default.

Use resolve fields for values calculated by signal context instead of storing viewer-specific data directly on the model.

Put pure helper behavior on constants only when it clearly belongs to the data type.

Import other constants from direct file paths to avoid circular barrel references.

## Code Examples

### ticket.constant.ts

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
  due: field(Date, { default: () => dayjs().set("hour", 19) }),
})) {}

export class LightTicket extends via(TicketObject, ["title", "status", "due"] as const, (resolve) => ({})) {}

export class Ticket extends via(TicketObject, LightTicket, (resolve) => ({})) {}

export class TicketInsight extends via(Ticket, (field) => ({
  activeCount: field(Int, { default: 0, accumulate: { status: "active" } }),
})) {}
```

### status enum

```ts
import { enumOf } from "akanjs/base";

export class TicketStatus extends enumOf("ticketStatus", [
  "active",
  "opened",
  "completed",
] as const) {}

type TicketStatusValue = TicketStatus["value"];
```

### practical field options

```ts
export class TicketInput extends via((field) => ({
  title: field(String, { example: "Fix payment bug" }),
  content: field(String, { default: "" }),
  owner: field(LightUser).optional(),
  draftReason: field.hidden(String).optional(),
  accessToken: field.secret(String).optional(),
  status: field(TicketStatus, { default: "active" }),
})) {}
```

### user.constant.ts

```ts
export class UserObject extends via(UserInput, (field) => ({
  accountId: field.secret(String).optional(),
  password: field.secret(String).optional(),
  phone: field.secret(String).optional(),
  adminMemo: field.hidden(String).optional(),
})) {}
```

### user.constant.ts

```ts
import { via } from "akanjs/constant";
import { user } from "../__lib/lib.constant";

export class UserInput extends via((field) => ({}), ...user.inputs) {}

export class UserObject extends via(
  UserInput,
  (field) => ({
    githubInfo: field(GithubInfo).optional(),
  }),
  ...user.objects,
) {}

export class LightUser extends via(UserObject, ["roles"] as const, (resolve) => ({}), ...user.lights) {}

export class User extends via(UserObject, LightUser, (resolve) => ({}), ...user.models) {}

export class UserInsight extends via(User, (field) => ({}), ...user.insights) {}
```

### LightBoard helper

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
    return user && this.roles.some((role) => user.roles.includes(role));
  }
}
```

### Board static helper

```ts
export class Board extends via(BoardObject, LightBoard, (resolve) => ({})) {
  static getBoard(boardList: LightBoard[], boardId: string) {
    return boardList.find((board) => board.id === boardId);
  }
}
```

### story.constant.ts

```ts
export class LightStory extends via(
  StoryObject,
  ["root", "rootType", "user", "title", "policy", "totalStat", "status"] as const,
  (resolve) => ({
    view: resolve(Int),
    like: resolve(Int),
  }),
) {
  setLike() {
    if (this.like > 0) return false;
    this.totalStat.likes += this.like <= 0 ? 1 : 0;
    this.like = 1;
    return true;
  }
}
```

### story.signal.ts

```ts
export class StoryInternal extends internal(srv.story.with(srv.actionLog), ({ resolveField }) => ({
  view: resolveField(Int)
    .with(Self, { nullable: true })
    .exec(async function (story, self) {
      return self
        ? ((await this.actionLogService.queryLoad({ action: "view", target: story.id, user: self.id }))?.value ?? 0)
        : 0;
    }),
  like: resolveField(Int)
    .with(Self, { nullable: true })
    .exec(async function (story, self) {
      return self
        ? ((await this.actionLogService.queryLoad({ action: "like", target: story.id, user: self.id }))?.value ?? 0)
        : 0;
    }),
})) {}
```

### coordinate.constant.ts

```ts
import { enumOf, Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class CoordinateType extends enumOf("coordinateType", ["Point"] as const) {}

export class Coordinate extends via((field) => ({
  type: field(CoordinateType, { default: "Point" }),
  coordinates: field([Float], { default: [0, 0] }),
  altitude: field(Float, { default: 0 }),
})) {
  static getTotalDistanceKm(...coords: Coordinate[]) {
    return coords.reduce((acc, cur, idx) => {
      if (idx === 0) return 0;
      return acc + Coordinate.getDistanceKm(coords[idx - 1], cur);
    }, 0);
  }

  static getDistanceKm(loc1: Coordinate, loc2: Coordinate) {
    // distance calculation belongs to Coordinate itself
    return 0;
  }
}
```

### ticket.constant.ts

```ts
import { Int } from "akanjs/base";

export class TicketInsight extends via(Ticket, (field) => ({
  appCount: field(Int, { default: 0, accumulate: { type: "app" } }),
  sharedCount: field(Int, { default: 0, accumulate: { type: "shared" } }),
})) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

