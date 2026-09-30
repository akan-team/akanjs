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

`akanjs/base` holds the value types models and signals are built from, plus a few runtime helpers. It imports nothing else from Akan, so server files, client files and `common/` can all use it.

Export

- ID: A document id: a 24-character hex string.

- Int, Float: Whole numbers and decimals. JavaScript `Number` is not a field type.

- Any: An open value Akan does not check. You name its shape with a type argument.

- Binary: Raw bytes in a signal argument or return.

- Upload: A file in the body of the upload mutation.

- dayjs, Dayjs: The date library and its type. Every `Date` field holds a `Dayjs`.

- enumOf: Turns a fixed list of values into an enum class.

- getEnv: The running app's name, environment and server addresses.

- getApiPrefix, getWsPrefix: The paths that signals and the websocket are served under.

- DataList: A list keyed by id. Every model list in a store is one.

Where Each Type Goes

Type

Model field — field()

Signal argument — .body() .param()

Signal return — query() mutation()

- Import from `akanjs/base`

  - ID: Document ids.

  - Int · Float: Counts and decimals.

  - Any: Payloads whose shape stays open.

  - Binary: Keep stored bytes in a `File` model.

  - Upload: Only in the body of a `fileUpload: true` mutation.

- JavaScript globals, no import

  - String: Plain text.

  - Boolean: Text such as "true", "false", "1" and "0" is read as a boolean.

  - Date: The value is a `Dayjs`, not a JavaScript `Date`.

Can be used

Not used here

**Arrays wrap the type.** `field([Float])` is a list of decimals, and `.body("files", [Upload])` takes several files.

**The three globals need no import.** Akan extends `String`, `Boolean` and `Date` so they work as types as they are.

Values Without a Default

A required field with no `default` starts at the value below. An `.optional()` field starts at `null`.

TypeScript value

Without a default

- ID — string — ""

- Int · Float — number — 0

- Any — T — field<T>(Any) — null

- String — string — ""

- Boolean — boolean — false

- Date — Dayjs — dayjs(new Date(-1))

ID

`ID` is a document id: a 24-character hex string, not a UUID. Use it for an id a model keeps without a relation, and for id arguments of a signal.

The file meta scalar keeps the id of a file it does not load:

**A relation uses the model class.** `field(File)` stores a relation to a file; `field(ID)` stores only the id string.

**The format is checked.** Anything but 24 hex characters is refused. The empty string `""` passes as the placeholder for an id not set yet.

**Name the owner with ref.** `field(ID, { ref: "org", cascade: "removeWith" })` removes this document when that org is removed.

Int

`Int` is a whole number: counters, quantities, page numbers, metric samples. A value that is not a safe integer is refused.

The access stat scalar counts four things, each starting at zero:

**`Number` is not a type.** `field(Number)` and `.body("x", Number)` fail to typecheck. Pick `Int` or `Float`.

**Text is converted.** A query-string or form value such as `"3"` arrives as the number `3`.

Float

`Float` is any finite number: coordinates, rates, balances, resource metrics. Use it when a fraction is valid data; `NaN` and `Infinity` are refused.

The coordinate scalar keeps a longitude/latitude pair and an altitude:

**Whole numbers stay Int.** A count, a quantity or an index is `Int`, even when it could be stored as a float.

**Text is converted.** `"1.5"` from a query string arrives as `1.5`.

Any

`Any` is a value whose shape Akan does not check. Use it for integration payloads and loose metadata; when the shape is stable, declare real fields instead.

An event payload that keeps its body open but typed:

**Name the shape.** The type argument in `field<Record<string, unknown>>` keeps the value typed in TypeScript, though nothing checks it at runtime.

**Give an object default as a function.** A literal `{}` is one object shared by every instance; `() => ({})` gives each its own.

**Agents do not get it.** A signal that returns `Any`, or takes a required `Any` argument, is not published to MCP.

**Never carry bytes in Any.** A `Buffer` becomes `{ type: "Buffer", data: [...] }` in JSON, about 3.6 times the size, and never turns back into bytes. Declare `Binary`.

Binary

`Binary` carries raw bytes in a signal argument or return. It is a `Uint8Array` on both sides, and a Node `Buffer` is one, so you can pass it straight in.

Requests and Responses

Sent as a base64 string in JSON. Either side accepts base64 or bytes.

Sent as a websocket binary frame, with no JSON and no base64. Only when the whole return is Binary.

A stream endpoint with one lossy room and one room that must see every frame:

**A slow subscriber gets the newest frame.** By default a `pubsub(Binary)` room keeps only the latest frame, which suits telemetry and video.

**`backpressure: "queue"` keeps every frame.** Use it for a sequence such as deltas; the send buffer then grows with the slowest subscriber.

**Agents do not get it.** A signal that returns `Binary` is not published to MCP.

**Binary is never a model field.** A model that declares `field(Binary)` fails to load. Keep the bytes in a `File` model and store a relation to it.

Upload

`Upload` is a file in the body of the upload mutation, and nowhere else. An app that mounts `libs/shared` already has that mutation:

**Only with `fileUpload: true`.** `Upload` is valid only in the body of a mutation flagged this way, and that mutation is never published to MCP.

**One per app.** The generated `fetch.add<Model>Files(fileList)` and store action `upload<Field>On<Model>(fileList)` both post to the mutation marked `fileUpload: true`. With two, only the first is used.

**The body is fixed.** The client always sends `files`, `metas`, `type` and `parentId`, and `fileList` may be a `File[]` or the `FileList` from `input.files`.

**Models reference `File`.** Declare `image: field(File).optional()` or `images: field([File])`, never `field(Upload)`.

dayjs / Dayjs

`akanjs/base` re-exports the `dayjs` function and its `Dayjs` type. Every `Date` field holds a `Dayjs`, so documents, stores, services and UI all use the same API.

A date field whose default is the moment each record is made:

Reading the value is ordinary dayjs; import the type the same way:

**Import it from `akanjs/base`.** Pages and module files may not import a third-party package, so `import dayjs from "dayjs"` fails lint there.

**"Now" is a function.** `default: () => dayjs()` runs for each record; `default: dayjs()` would freeze the time the module loaded.

enumOf

`enumOf(name, values)` turns a fixed list of values into an enum class. Use the class as a field or argument type; its static helpers read the list.

A job status declared once and used as a field:

Static Helpers

Member

- values: The list exactly as declared. — Example: `JobStatus.values; // ["ready", "running", "done"]`

- has(value): Whether the value is in the list. — Example: `JobStatus.has("ready"); // true`

- indexOf(value): The value's position. Throws when the value is not in the list.

- find(fn), findIndex(fn): Like the Array methods, but throw when nothing matches.

- filter(fn), map(fn), forEach(fn): Same as the Array methods. — Example: `JobStatus.map((value) => value.toUpperCase());`

- JobStatus["value"]: The type of one value: the union of the list. — Example: `const statusClass: { [key in JobStatus["value"]]: string } = { ready: "text-foreground/60", running: "text-primary", done: "text-success" };`

**camelCase name, `as const` list.** The first argument names the enum; without `as const` the values widen to `string`.

**The list decides the type.** Strings make a `String` enum, whole numbers an `Int` enum, other numbers a `Float` enum. An empty list throws.

**Signal arguments are checked.** An argument typed with an enum refuses any value outside the list.

**Labels live in the dictionary.** Translate each value in the module dictionary's `.enum()` stage.

getEnv

`getEnv()` tells running code about its app: the name, the environment, and where the web and API servers are. The first call reads the environment variables; later calls return the same cached object.

- appName (string): From `AKAN_PUBLIC_APP_NAME`. Required.

- repoName (string): From `AKAN_PUBLIC_REPO_NAME`. Required.

- serveDomain (string): From `AKAN_PUBLIC_SERVE_DOMAIN`. Required.

- environment ("testing" | "debug" | "develop" | "main" | "local", default "debug"): From `AKAN_PUBLIC_ENV`.

- operationMode ("local" | "edge" | "cloud" | "module", default "cloud"): From `AKAN_PUBLIC_OPERATION_MODE`. It is `"local"` when `environment` is `"local"`.

- databaseMode ("single" | "multiple" | "cluster" | undefined): From `AKAN_DATABASE_MODE`, else the mode the app declares. `undefined` in the browser.

- side ("server" | "client"): Whether this code is running on the server or in the browser.

- renderMode ("ssr" | "csr", default "csr"): From `AKAN_PUBLIC_RENDER_ENV`.

- apiPrefix (string, default "/api"): The value `getApiPrefix()` returns.

- wsPrefix (string, default "/ws"): The value `getWsPrefix()` returns.

- clientHttpUri (string): The web origin, such as `http://localhost:8282`. Also split into `clientHost` and `clientPort`.

- serverHttpUri (string): The API base with the prefix, such as `http://localhost:8282/api`.

- serverWsUri (string): The websocket origin without a path, such as `ws://localhost:8282`.

A helper that builds the app's public host from the env:

**Runs on both sides.** `side` says whether the code is on the server or in the browser.

**The types are exported too.** `ClientEnv` is what `getEnv()` returns, `Environment` is the union of environment names, and `BackendEnv` types the server options.

**Call getEnv() inside a function, never at module scope.** `akan build` loads modules without the three required variables, and `getEnv()` throws there. Use a method body, a default thunk, or `env(() => getEnv())` in an `adapt()` class.

getApiPrefix / getWsPrefix

`getApiPrefix()` returns the path signals are served under, and `getWsPrefix()` the websocket's path under it. Build URLs with them instead of writing `/api` or `/ws`, because an app can move both.

Where

Setting

Who follows it

- main.ts — new AkanApp({ prefix, websocketPrefix }) — The server's routes, and every page the server renders.

- akan.config.ts — api: { prefix, websocketPrefix } — A prebuilt CSR shell and a native app bundle, which no server renders.

- (nothing set) — "/api" · "/ws" — The defaults.

The OAuth consent page posts to a signal endpoint under the prefix:

**A leading slash, never a trailing one.** Appending `"/path"` is always safe. A blank value or a bare `/` counts as not set.

**The websocket sits under the API prefix.** The client connects to `serverHttpUri` plus `getWsPrefix()`, which is `ws://localhost:8282/api/ws` by default.

**Call it where you build the URL.** A moved prefix reaches the browser too, so there is no need to pass it down as a prop.

DataList

`DataList` is a list of light models that also finds rows by `id`. Every list a slice puts in a store is one: `<model>List`, `<model>InitList` and `<model>Selection`.

A store action that puts an updated admin back into its list:

**Finish with `.save()`.** `set` and `delete` change the list in place, so the store would still hold the same object. `.save()` hands it a new one it can tell has changed.

Methods

- new DataList(rows): Builds a list from an array. A repeated id keeps the last row. — Example: `const users = new DataList([{ id: "a", nickname: "Akan" }]);`

- set(row): Replaces the row with the same id, or appends it. Changes this list and returns it. — Example: `users.set({ id: "b", nickname: "Akan" });`

- delete(id): Removes the row with that id. Changes this list and returns it.

- save(): A new DataList with the same rows. Hand this to `this.set()`.

- get(id), pick(id): The row with that id. `get` returns `undefined` when it is missing; `pick` throws. — Example: `const user = users.pick("a");`

- has(id), indexOf(id), at(idx), pickAt(idx): Look up by id or position. `indexOf` and `pickAt` throw when nothing is there.

- filter, slice, sort: Return a new DataList.

- map, forEach, find, some, every, reduce: Same as the Array methods. `for...of` works too.

- values, length: The rows as a plain array, and how many there are.

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

