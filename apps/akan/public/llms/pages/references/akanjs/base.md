# akanjs/base

- Source: /references/akanjs/base
- Mirror: /llms/pages/references/akanjs/base.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/base (#akanjs-base)
- ID (#ID)
- Int (#Int)
- Float (#Float)
- Any (#Any)
- Binary (#Binary)
- Upload (#Upload)
- dayjs / Dayjs (#dayjs / Dayjs)
- enumOf (#enumOf)
- getEnv (#getEnv)
- getApiPrefix / getWsPrefix (#getApiPrefix / getWsPrefix)
- DataList (#DataList)

## Content

akanjs/base

A document id: a 24-character hex string.

Whole numbers and decimals. JavaScript `Number` is not a field type.

An open value Akan does not check. You name its shape with a type argument.

Raw bytes in a signal argument or return.

A file in the body of the upload mutation.

The date library and its type. Every `Date` field holds a `Dayjs`.

Turns a fixed list of values into an enum class.

The running app's name, environment and server addresses.

The paths that signals and the websocket are served under.

A list keyed by id. Every model list in a store is one.

Model field

Signal argument

Signal return

Import from `akanjs/base`

Document ids.

Counts and decimals.

Payloads whose shape stays open.

Keep stored bytes in a `File` model.

Only in the body of a `fileUpload: true` mutation.

JavaScript globals, no import

Plain text.

Text such as "true", "false", "1" and "0" is read as a boolean.

The value is a `Dayjs`, not a JavaScript `Date`.

Type

TypeScript value

Without a default

The list exactly as declared.

Whether the value is in the list.

The value's position. Throws when the value is not in the list.

Like the Array methods, but throw when nothing matches.

Same as the Array methods.

The type of one value: the union of the list.

From `AKAN_PUBLIC_APP_NAME`. Required.

From `AKAN_PUBLIC_REPO_NAME`. Required.

From `AKAN_PUBLIC_SERVE_DOMAIN`. Required.

From `AKAN_PUBLIC_ENV`.

From `AKAN_PUBLIC_OPERATION_MODE`. It is `"local"` when `environment` is `"local"`.

From `AKAN_DATABASE_MODE`, else the mode the app declares. `undefined` in the browser.

Whether this code is running on the server or in the browser.

From `AKAN_PUBLIC_RENDER_ENV`.

The value `getApiPrefix()` returns.

The value `getWsPrefix()` returns.

The web origin, such as `http://localhost:8282`. Also split into `clientHost` and `clientPort`.

The API base with the prefix, such as `http://localhost:8282/api`.

The websocket origin without a path, such as `ws://localhost:8282`.

Where

Setting

Who follows it

The server's routes, and every page the server renders.

A prebuilt CSR shell and a Capacitor app, which no server renders.

(nothing set)

The defaults.

Builds a list from an array. A repeated id keeps the last row.

Replaces the row with the same id, or appends it. Changes this list and returns it.

Removes the row with that id. Changes this list and returns it.

A new DataList with the same rows. Hand this to `this.set()`.

The row with that id. `get` returns `undefined` when it is missing; `pick` throws.

Look up by id or position. `indexOf` and `pickAt` throw when nothing is there.

Return a new DataList.

Same as the Array methods. `for...of` works too.

The rows as a plain array, and how many there are.

`akanjs/base` holds the value types models and signals are built from, plus a few runtime helpers. It imports nothing else from Akan, so server files, client files and `common/` can all use it.

Export

Where Each Type Goes

Can be used

Not used here

Values Without a Default

A required field with no `default` starts at the value below. An `.optional()` field starts at `null`.

ID

`ID` is a document id: a 24-character hex string, not a UUID. Use it for an id a model keeps without a relation, and for id arguments of a signal.

The file meta scalar keeps the id of a file it does not load:

Int

`Int` is a whole number: counters, quantities, page numbers, metric samples. A value that is not a safe integer is refused.

The access stat scalar counts four things, each starting at zero:

Float

`Float` is any finite number: coordinates, rates, balances, resource metrics. Use it when a fraction is valid data; `NaN` and `Infinity` are refused.

The coordinate scalar keeps a longitude/latitude pair and an altitude:

Any

`Any` is a value whose shape Akan does not check. Use it for integration payloads and loose metadata; when the shape is stable, declare real fields instead.

An event payload that keeps its body open but typed:

Binary

`Binary` carries raw bytes in a signal argument or return. It is a `Uint8Array` on both sides, and a Node `Buffer` is one, so you can pass it straight in.

Requests and Responses

Sent as a base64 string in JSON. Either side accepts base64 or bytes.

Sent as a websocket binary frame, with no JSON and no base64. Only when the whole return is Binary.

A stream endpoint with one lossy room and one room that must see every frame:

Upload

`Upload` is a file in the body of the upload mutation, and nowhere else. An app that mounts `libs/shared` already has that mutation:

dayjs / Dayjs

`akanjs/base` re-exports the `dayjs` function and its `Dayjs` type. Every `Date` field holds a `Dayjs`, so documents, stores, services and UI all use the same API.

A date field whose default is the moment each record is made:

Reading the value is ordinary dayjs; import the type the same way:

enumOf

`enumOf(name, values)` turns a fixed list of values into an enum class. Use the class as a field or argument type; its static helpers read the list.

A job status declared once and used as a field:

Static Helpers

Member

getEnv

`getEnv()` tells running code about its app: the name, the environment, and where the web and API servers are. The first call reads the environment variables; later calls return the same cached object.

A helper that builds the app's public host from the env:

getApiPrefix / getWsPrefix

`getApiPrefix()` returns the path signals are served under, and `getWsPrefix()` the websocket's path under it. Build URLs with them instead of writing `/api` or `/ws`, because an app can move both.

The OAuth consent page posts to a signal endpoint under the prefix:

DataList

`DataList` is a list of light models that also finds rows by `id`. Every list a slice puts in a store is one: `<model>List`, `<model>InitList` and `<model>Selection`.

A store action that puts an updated admin back into its list:

Methods

## Code Examples

### libs/shared/lib/__scalar/fileMeta/fileMeta.constant.ts

```typescript
import { ID, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class FileMeta extends via((field) => ({
  fileId: field(ID).optional(),
  lastModifiedAt: field(Date),
  size: field(Int),
})) {}
```

### libs/util/lib/__scalar/accessStat/accessStat.constant.ts

```typescript
import { Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class AccessStat extends via((field) => ({
  request: field(Int, { default: 0 }),
  device: field(Int, { default: 0 }),
  ip: field(Int, { default: 0 }),
  country: field(Int, { default: 0 }),
})) {}
```

### libs/util/lib/__scalar/coordinate/coordinate.constant.ts

```typescript
import { enumOf, Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class CoordinateType extends enumOf("coordinateType", ["Point"] as const) {}

export class Coordinate extends via((field) => ({
  type: field(CoordinateType, { default: "Point" }),
  coordinates: field([Float], { default: [0, 0], example: [127.114367, 37.497114] }),
  altitude: field(Float, { default: 0 }),
})) {}
```

### apps/myapp/lib/__scalar/eventPayload/eventPayload.constant.ts

```typescript
import { Any } from "akanjs/base";
import { via } from "akanjs/constant";

export class EventPayload extends via((field) => ({
  body: field<Record<string, unknown>>(Any, { default: () => ({}) }),
})) {}
```

### apps/myapp/lib/_stream/stream.signal.ts

```typescript
import { Every } from "@libs/shared/srvkit";
import { Binary, ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as srv from "../srv";

export class StreamEndpoint extends endpoint(srv.stream, ({ pubsub }) => ({
  chunkReceived: pubsub(Binary, { guards: [Every] })
    .room("channel", String)
    .exec(() => undefined),
  patchReceived: pubsub(Binary, { guards: [Every], backpressure: "queue" })
    .room("docId", ID)
    .exec(() => undefined),
})) {}
```

### libs/shared/lib/file/file.signal.ts

```typescript
import { Every } from "@libs/shared/srvkit";
import { dayjs, ID, Upload } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";
import * as srv from "../srv";

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  addFiles: mutation([cnst.File], { guards: [Every], fileUpload: true, mcp: false })
    .body("files", [Upload])
    .body("metas", String)
    .body("type", String)
    .body("parentId", ID, { nullable: true })
    .exec(async function (files, metas, type, parentId) {
      const parsedMetas = (global.JSON.parse(metas) as db.FileMeta[]).map((meta) => ({
        ...meta,
        lastModifiedAt: dayjs(meta.lastModifiedAt),
      }));
      return await this.fileService.addFiles(files, parsedMetas, type, parentId);
    }),
})) {}
```

### libs/util/lib/__scalar/accessLog/accessLog.constant.ts

```typescript
import { dayjs, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class AccessLog extends via((field) => ({
  period: field(Int, { default: 0 }),
  at: field(Date, { default: () => dayjs() }),
})) {}
```

### apps/myapp/common/dayLabel.ts

```typescript
import { type Dayjs, dayjs } from "akanjs/base";

export const dayLabel = (at: Dayjs) => (at.isSame(dayjs(), "day") ? at.format("HH:mm") : at.format("YYYY-MM-DD"));
```

### apps/myapp/lib/job/job.constant.ts

```typescript
import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class JobStatus extends enumOf("jobStatus", ["ready", "running", "done"] as const) {}

export class JobInput extends via((field) => ({
  status: field(JobStatus, { default: "ready" }),
})) {}
```

### apps/myapp/srvkit/publicHost.ts

```typescript
import { getEnv } from "akanjs/base";

export const publicHost = () => {
  const { operationMode, appName, environment, serveDomain } = getEnv();
  if (operationMode === "local") return "localhost";
  return `${appName}-${environment}.${serveDomain}`;
};
```

### libs/shared/page/oauth/consent/_index.tsx

```tsx
import { usePage } from "@libs/shared/client";
import { getApiPrefix } from "akanjs/base";
import { page } from "akanjs/client";
import { buttonRecipe } from "akanjs/ui";

export default page()
  .search("request", String)
  .render(({ request }) => {
    const { l } = usePage();
    const approveAction = `${getApiPrefix()}/approveOAuthConsent/${request ?? ""}`;
    return (
      <form method="post" action={approveAction}>
        <button type="submit" className={buttonRecipe({ variant: "primary" })}>
          {l("oauth.approve")}
        </button>
      </form>
    );
  });
```

### libs/shared/lib/admin/admin.store.ts

```typescript
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class AdminStore extends store(sig.admin, () => ({
  me: new cnst.Admin(),
})) {
  async addAdminRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await fetch.addAdminRole(adminId, role);
    const { adminList } = this.get();
    this.set({ adminList: adminList.set(admin).save() });
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

