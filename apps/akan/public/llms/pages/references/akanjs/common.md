# akanjs/common

- Source: /references/akanjs/common
- Mirror: /llms/pages/references/akanjs/common.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/common (#akanjs-common)
- Logger (#Logger)
- sleep (#sleep)
- capitalize / lowerlize (#capitalize / lowerlize)
- formatPhone / isPhoneNumber (#formatPhone / isPhoneNumber)
- isEmail (#isEmail)
- RestClient (#RestClient)
- pathGet / pathSet (#pathGet / pathSet)
- randomPick / randomPicks (#randomPick / randomPicks)

## Content

akanjs/common

`akanjs/common` holds small helpers that depend on no platform. The same import works in a page, a store, a service and a CLI script.

On this page

Export

- Logger: Writes leveled log lines and hands them to the sinks you register.

- sleep: Waits the given number of milliseconds.

- capitalize, lowerlize: Changes the case of the first character only.

- formatPhone, isPhoneNumber: Adds dashes to a Korean phone number and checks the dashed form.

- isEmail: Checks that a string looks like an email address.

- RestClient: Calls a REST API that is not an Akan server.

- pathGet, pathSet: Reads and writes a nested value by a path such as `items[0].name`.

- randomPick, randomPicks: Picks one or several random items from a list.

More in akanjs/common

- clamp: Keeps a number between `min` and `max`. — Example: `clamp(120, 0, 100); // 100`

- formatNumber: Adds thousands separators to a number string and keeps the decimals as written. — Example: `formatNumber("1234567.89"); // "1,234,567.89"`

- isValidDate: Tells whether a `YYYY-MM-DD` string, `Date` or `Dayjs` parses, though `2024-02-30` still passes.

- isDayjs: Tells whether a value is a `Dayjs`.

- splitVersion, mergeVersion: Splits "1.2.3" into major, minor and patch, and joins them back. — Example: `splitVersion("1.2.3"); // { major: "1", minor: "2", patch: "3" }`

- objectify, plainFieldsOf: Copy data fields without methods, and only `plainFieldsOf` keeps a model's `Date` fields.

- deepObjectify: Makes a deep plain copy, JSON-ready when you pass `serializable` or `convertDate`.

- decodeJwtPayload: Reads a JWT's payload without checking its signature, so never trust it for access.

- isThenable: Tells whether a value can be awaited.

- interpolateTranslation: Fills `{name}` placeholders and leaves one whose value is missing as written. — Example: `interpolateTranslation("Hi {name}", { name: "Akan" }); // "Hi Akan"`

The same import also carries route-convention helpers and wire contracts that the framework uses itself. App code rarely needs them.

Logger

Akan's leveled logger. A service already has one as `this.logger`, named after its class, and an `adapt()` adapter has one named after its key. Anywhere else, create `new Logger("Name")` or call the static methods.

A script that logs through an instance, a static call, a structured record and a sink:

**Six levels, lowest first:** `trace`, `verbose`, `debug`, `info`, `warn`, `error`. A line prints at or above the console level, and `error` lines go to stderr.

**The second argument is the context.** `logger.warn("retrying charge", "stripe")` prints `[stripe]` before the message.

**Secret-looking keys are masked.** An `attrs` key containing a word such as password, token, secret, cookie or api key reads `[redacted]` before any sink sees it.

**Give every sink a floor.** A sink without `minLevel` takes every level down to `AKAN_LOG_FILE_LEVEL` (trace), so each `verbose` call gets rendered.

Methods

- logger.info(msg, context?): One method per level: `trace`, `verbose`, `debug`, `info`, `warn`, `error`.

- Logger.info(msg, context?, name?): The same methods as statics, with `name` defaulting to `App`.

- Logger.setLevel(level): Changes the console level while the process runs.

- Logger.shouldLog(level): Tells whether a line at that level would go anywhere, before you build a costly message.

- Logger.addSink(sink, { minLevel }): Passes each record at or above `minLevel` to your function and returns its remover.

- Logger.removeSink(sink): Stops passing records to that sink.

- Logger.emit({ level, name, message, attrs }): Writes one record with `key=value` attributes after the message.

Environment variables

- AKAN_PUBLIC_LOG_LEVEL (LogLevel, default info): The console level, below which lines are not printed.

- AKAN_LOG_STDOUT_LEVEL (LogLevel, default AKAN_PUBLIC_LOG_LEVEL): The level the container's stdout carries, and it overrides `AKAN_PUBLIC_LOG_LEVEL` when set.

- AKAN_LOG_FILE_LEVEL (LogLevel, default trace): The floor for a sink that sets no `minLevel`.

**Never call `.log()`.** It is deprecated and writes at `info`, so it looks like its own level but is not; lint rejects it. `AKAN_PUBLIC_LOG_LEVEL=log` likewise means `info`.

Log Levels

The six levels, their severity numbers and what each one is for.

File Logging & Rotation

Where the log file lives and how it rotates.

sleep

`sleep(ms)` returns a Promise that resolves after `ms` milliseconds. It is used for polling, retry waits, tests and the CLI's cloud sign-in loop.

The shared file helper polls an upload until it leaves `uploading`:

**It does not block.** Other work keeps running during the wait; only the function that awaits it pauses.

capitalize / lowerlize

Change the case of the first character and leave the rest as written. Use them to turn a model name such as `story` into a class-style `Story` and back:

formatPhone / isPhoneNumber

`formatPhone` adds dashes to a Korean phone number as it is typed, and `isPhoneNumber` accepts only the dashed form. `Field.Phone` already runs both, so a form seldom calls them itself.

Call

Result

- formatPhone("0101234567") — "010-123-4567"

- formatPhone("010-123-45678") — "010-1234-5678"

- formatPhone("01012345678") — "01012345678"

- isPhoneNumber("010-1234-5678") — true

- isPhoneNumber("031-123-4567") — true

- isPhoneNumber("01012345678") — false

- isPhoneNumber("02-1234-5678") — false

**It counts characters, not area codes.** At 10 characters it splits 3-3-4; at 13 it drops the dashes and splits 3-4-4. Any other length, 11 bare digits included, comes back unchanged.

**Why 10 and 13.** One more digit typed after `010-123-4567` makes 13 characters, which re-splits it as `010-1234-5678`.

**Seoul's `02` numbers do not fit.** `formatPhone("0212345678")` gives `021-234-5678`, and the dashed `02` form fails `isPhoneNumber`.

In a form, bind `Field.Phone`. It formats while the user types and shows an error for an invalid number:

isEmail

`isEmail` tells whether a string looks like an email address. It returns `false` for `null`, `undefined` and an empty string, so it needs no guard in front.

- isEmail("user@example.com") — true

- isEmail("user.name@example.co.kr") — true

- isEmail("user+tag@example.com") — false

- isEmail("user@example.c") — false

- isEmail(null) — false

**`+` is not accepted.** Before the `@` only letters, digits, `_`, `.` and `-` may appear, so plus-addressed mail fails.

**The last domain part needs 2 to 8 characters**, as in `.com` or `.co.kr`.

**`Input.Email` already runs it** and shows the invalid-email message. Call it yourself to gate a button or an action.

The shared sign-up form disables its button the same way:

RestClient

`RestClient` is a small `fetch` wrapper for a REST API that is not an Akan server. It keeps one base URL, shared headers and a timeout, and sends and parses JSON for you.

Constructor options

Pass an options object, or just a base URL: `new RestClient("https://api.example.com")` is short for `{ baseUrl: "https://api.example.com" }`.

- baseUrl (string): Joined in front of a relative path, while an absolute `http(s)` URL ignores it.

- headers (HeadersInit): Sent with every request, and a call's own `headers` win on a clash.

- timeout (number (ms)): Aborts a slower request; unset means no limit, and a call's own `timeout` wins.

Method

- get<T>(url, options?): Sends GET and resolves with the response body.

- post<T>(url, data?, options?): Sends POST with `data` as the body.

- put<T>(url, data?, options?): Sends PUT with `data` as the body.

- delete<T>(url, options?): Sends DELETE.

A client with shared headers and a timeout, plus a header on one call only:

**Request body.** A plain object is sent as JSON with `Content-Type: application/json`. A string, `FormData`, `URLSearchParams`, `Blob` or `ArrayBuffer` goes as is.

**Response.** A JSON content type is parsed, and anything else resolves as text. `204` and an empty body resolve `undefined`.

**Failure.** A non-2xx status rejects with a plain `Error` whose message is the response body. In an adapter, catch it, `logger.error` it and return `null`.

**Four verbs only.** There is no `patch`. `options` also takes other `fetch` settings such as `credentials` or `cache`.

**Calling an Akan server? Use `fetch.*`.** `RestClient` knows nothing of signals, guards or `Err`, so a server `Err` arrives as a plain `Error`.

pathGet / pathSet

Read or write a value deep inside an object by a path string. Reach for them when the path is data, such as a field name held in a variable.

Signature

- pathGet(path, obj, separator = ".", fallback = null): Returns the value at `path`, or `fallback` when a step is missing or `null`.

- pathSet(obj, path, value): Writes `value` in place, creating missing objects and arrays, and returns the same `obj`.

The same path in three spellings, and a write that builds what is missing:

**The argument order differs.** `pathGet` takes the path first, `pathSet` the object first.

**Three spellings, one path.** `links[0].url`, `links.0.url` and `["links", 0, "url"]` reach the same value. Passing your own `separator` to `pathGet` turns the bracket form off.

**`Map` fields work.** A `Map` value is read and written through `get` and `set`, not as properties.

**`pathSet` changes the object you pass.** Copy it first if the original must stay. For store state, write a form path with `st.do.writeOn<Model>(path, value)` instead.

randomPick / randomPicks

Pick random items from a list. Akan's test data generator `sampleOf` fills an enum field with `randomPick`.

- randomPick(list): One random item, or `undefined` for an empty list.

- randomPicks(list, count = 1, allowDuplicate = false): `count` random items, never the same one twice unless `allowDuplicate` is on.

One pick, two distinct picks, and three picks that may repeat:

**A short list comes back whole.** With duplicates off and `count` at or above the list length, you get the same array back, in order and not copied.

**Not for secrets.** They use `Math.random`, so never build a token or a verification code with them.

## Code Examples

### apps/myapp/script/syncInvoices.ts

```typescript
import { Logger } from "akanjs/common";

const logger = new Logger("InvoiceSync");
logger.info("invoice synced");
logger.warn("retrying charge", "stripe");

Logger.warn("missing optional config", "startup");

Logger.emit({
  level: "info",
  name: "InvoiceSync",
  message: "charge settled",
  attrs: { amount: 1200, apiKey: "sk_live_..." },
}); // ... charge settled amount=1200 apiKey=[redacted]

const errorLines: string[] = [];
const removeSink = Logger.addSink(
  ({ plainMessage }) => {
    errorLines.push(plainMessage);
  },
  { minLevel: "error" },
);
removeSink();
```

### libs/shared/webkit/addFileUntilActive.ts

```typescript
import { fetch } from "@libs/shared/client";
import { sleep } from "akanjs/common";

while (file.status === "uploading") {
  await sleep(1000);
  file = await fetch.file(file.id);
}
```

### apps/myapp/common/modelNames.ts

```typescript
import { capitalize, lowerlize } from "akanjs/common";

const ModelName = capitalize("story"); // "Story"
const modelName = lowerlize("Story"); // "story"
capitalize("aKan"); // "AKan": only the first character changes
```

### apps/myapp/lib/user/User.Template.tsx

```tsx
"use client";
import { st, usePage } from "@apps/myapp/client";
import { Field } from "akanjs/ui";

export const General = () => {
  const { l } = usePage();
  const userForm = st.use.userForm();
  return (
    <Field.Phone
      label={l("user.phone")}
      value={userForm.phone}
      onChange={st.do.setPhoneOnUser}
    />
  );
};
```

### apps/myapp/lib/org/Org.Util.tsx

```tsx
"use client";
import { st, usePage } from "@apps/myapp/client";
import { isEmail } from "akanjs/common";
import { Button } from "akanjs/ui";

export const Invite = () => {
  const { l } = usePage();
  const inviteEmail = st.use.inviteEmail();
  return (
    <Button
      disabled={!isEmail(inviteEmail)}
      onClick={() => st.do.inviteMember()}
    >
      {l("org.inviteMember")}
    </Button>
  );
};
```

### apps/myapp/srvkit/exampleApi.ts

```typescript
import { RestClient } from "akanjs/common";

const api = new RestClient({
  baseUrl: "https://api.example.com",
  headers: { "X-Client": "myapp" },
  timeout: 20_000,
});

const user = await api.get<{ id: string; name: string }>("/users/1");
const requestId = crypto.randomUUID();
await api.post(
  "/events",
  { type: "signup", userId: user.id },
  { headers: { "X-Request-Id": requestId } },
);
```

### apps/myapp/common/profilePath.ts

```typescript
import { pathGet, pathSet } from "akanjs/common";

const user = {
  profile: { nickname: "akan" },
  links: [{ url: "https://akanjs.com" }],
};

pathGet("profile.nickname", user); // "akan"
pathGet("links[0].url", user); // "https://akanjs.com"
pathGet(["links", 0, "url"], user); // "https://akanjs.com"
pathGet("profile.age", user, ".", 0); // 0

pathSet(user, "profile.nickname", "Akan"); // returns user, now changed
pathSet(user, "tags[0]", "core"); // creates tags: ["core"]
```

### apps/myapp/lib/story.signal.spec.ts

```typescript
import { randomPick, randomPicks } from "akanjs/common";

const color = randomPick(["red", "blue", "green"]);
const tags = randomPicks(["api", "ui", "db"], 2); // two different tags
const rolls = randomPicks([1, 2, 3, 4, 5, 6], 3, true); // repeats allowed
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

