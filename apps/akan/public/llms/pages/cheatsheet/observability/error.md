# Error Handling

- Source: /cheatsheet/observability/error
- Mirror: /llms/pages/cheatsheet/observability/error.md
- Section: cheatsheet
- Category: Observability
- Priority: P2

## Headings

- Error Handling (#overview)
- Declare Errors (#declare-errors)
- Throw Err (#throw-err)
- Choose Status (#choose-status)
- Use Data (#use-data)
- Client Handling (#client-handling)
- Response Shape (#response-shape)
- Report Errors (#report-errors)
- Tips (#tips)

## Content

Error Handling

An order that is already paid cannot be edited, and the user should hear why in their own language. In Akan the server throws a dictionary key, and the client translates that key and shows it.

One error travels through four steps:

Where

What happens

- order.dictionary.ts: 1. Declare: register each error sentence as an `[en, ko]` pair in `.error({})`.

- order.document.ts, order.service.ts: 2. Throw: when a business rule fails, throw `new Err("order.error.notDraft")`.

- HTTP · WebSocket: 3. Send: the server answers with the untranslated key, a status code and `data`.

- order.store.ts: 4. Show: fetch restores it as `Err`, and the store action shows it as a translated toast.

Declare Errors

Start in the module's dictionary. The keys you declare in `.error({})` are the only keys `Err` accepts, so TypeScript catches a typo.

The snippet leaves out the other stages of the chain:

**The key path is fixed.** `notDraft` in the `order` dictionary is thrown as `order.error.notDraft`.

**Placeholders.** `{productName}` is filled from the `data` you throw with, as shown in Use Data below.

**Korean ends in '다.'** Write each Korean `.error()` sentence as a full sentence ending in `다.`

**Success messages are not errors.** A toast such as `order.addItemSuccess` is declared in `.translate({})`.

Throw Err

Throw `Err` when a business rule the user can understand and fix fails. A rule about the document's own state belongs in its document method, so every service shares the same check.

Only a draft order can change its title:

Where each rule lives

Rule

- order.document.ts: A precondition on the document's own state, such as only a draft order being editable.

- order.service.ts: A rule that loads or compares other documents, such as the product having to exist.

- order.signal.ts: Who may call the endpoint at all, such as only the order's owner, written as a guard.

Where to import Err

File

How

- *.document.ts, *.service.ts, *.signal.ts: Server files import it from the module's `dict` barrel. — Example: `import { Err } from "../dict";`

- *.tsx: UI files import it from the app's client entry; a lib uses `@libs/<lib>/client`. — Example: `import { Err } from "@apps/<app>/client";`

- common/**, env/**: No import path for `Err` exists here, so keep throwing code out of these folders.

**Never `throw new Error`.** The `no-throw-raw-error` lint rule fails the build everywhere in `apps/**` and `libs/**` except tests, `*.constant.ts`, `common/**` and `env/**`. A plain `Error` also reaches the user only as a generic 500.

Choose Status

`new Err()` answers with status 400. When the HTTP meaning matters, throw a named helper instead; each one takes the same arguments as `new Err()`.

- new Err(key) (400): The default: a business rule rejected the request.

- Err.BadRequest (400): The same 400, named explicitly.

- Err.Unauthorized (401): The caller has not signed in or proven who they are.

- Err.Forbidden (403): The user is known but may not do this action.

- Err.NotFound (404): The requested record does not exist.

- Err.Conflict (409): The current state cannot accept this action.

In a service, the order's state and the product's existence pick different statuses:

**`get` throws, `load` returns null.** `getOrder(id)` throws `NoDocumentError` when the record is missing, which the caller sees as a 404.

**A missing record is already a 404.** The generated `getProduct` and a `pick` that finds no live row answer 404 `base.error.documentNotFound`. To say more, call `loadProduct(id)` and throw your own `Err.NotFound` on `null`.

**It is the HTTP status too.** The response goes out with the same code, so proxies and access logs also see 404 or 409.

Use Data

Pass `data` when the translated sentence needs values. The server keeps the dictionary key in `error` and sends `data` beside it for interpolation.

The second argument of `Err` is that `data` object:

**Names match the placeholders.** `data.productName` fills `{productName}` in every language's sentence.

**Strings and numbers only.** The error toast fills only string and number values and drops anything else.

**A missing value stays visible.** A placeholder with no value is shown as written, like `{quantity}`, so the gap reads as a bug rather than as content.

Client Handling

fetch restores an error response as `Err`, and every store action already runs inside a wrapper that catches it. The wrapper translates the key into the user's language and shows a toast, so an action holds only the happy path, with no try/catch.

The store action calls the endpoint and handles success only:

The button knows nothing about failure. It calls the action and lets the wrapper answer:

**Toast, then rethrow.** After the toast the wrapper throws the error again, so code after `await st.do.addItemToOrder()` does not run when it fails.

**Network failures are covered.** A timeout, an unreachable server or a restarting one arrives as an `Err` with a `base.error.*` key and gets the same toast.

**Check input with `msg.error`.** For a client-side check before the call, run `msg.error("<key>")` and return early; never throw.

**`try/finally` is for spinners.** UI code may use it to reset a spinner; catching belongs to the wrapper.

Response Shape

HTTP and websocket errors carry almost the same fields. You rarely build this by hand, but knowing it makes debugging easier.

The `stockNotEnough` error from above arrives like this:

Field

- error: The dictionary key you threw, never a translated sentence.

- statusCode: 400 by default or the helper's status, and the HTTP response carries the same one.

- data: The placeholder values, present only when you passed them.

- details: Extra debugging detail, present only when set.

- path: The endpoint path, sent over HTTP only and never in a websocket error frame.

- timestamp: When the server answered, as an ISO string.

When a plain Error escapes

A plain `Error`, which is neither an `Err` nor a missing document, is answered as a 500, so the user never sees the dictionary sentence:

Thrown

What the caller gets

- Err, Err.*: Answered with its own `statusCode`, and `error` holds the dictionary key.

- NoDocumentError, getOrder(missingId): Answered as 404, and `error` holds `base.error.documentNotFound`.

- Error: Answered as 500, and a deployed build sets `error` to `Internal Server Error`.

**In development a plain Error shows everything.** Under `akan start` its response carries the real message and the stack.

**The stack is in the server log.** Every such 500 is logged with its stack, even when the response hides it.

**Debugging a deployed build.** Set `AKAN_ERROR_DETAIL=1` to put the real message back into the response.

Report Errors

A 500 lands in the server log, but a team usually wants it in an error tracker too, along with the errors that happen only in a user's browser. `option.setErrorReporter` hands each error to your function, and `option.setClientReport` makes pages send what their browser hit.

**Once, after the response.** Each error reaches the reporter at most once, after the answer has left. A reporter that throws or rejects is logged once and changes nothing else. Before a crashed process exits, it waits up to 2 seconds for the reporter.

**Never a 4xx.** An `Err` the user can fix is an answer, not a fault, so it never reaches the reporter.

**Where it runs.** In the server that answers: the solo server, or each replica. A render error in the RSC worker is carried to its server and reported there. The gateway loads no `option.ts`, so its own failures stay in its log.

**A bounded number a minute.** At most 600 errors per server process, 10 of them uncaught exceptions or unhandled rejections, and 3 render errors per request. Await what the reporter sends: a failed unawaited send counts toward those 10.

**One fault can arrive more than once.** Group by `traceId`: an endpoint answering 5xx during a page render arrives as `server` and `render`, and a streamed server error the browser re-renders as `render` and a `recoverable` `client` report.

What the reporter gets

The first argument is a real `Error` with its `cause` chain; a thrown value that is not one arrives wrapped, with the value as its `cause`. The second is the context:

- source: `server` for a 5xx answer, `render` for a page that failed to render, `process` for an uncaught exception or unhandled rejection, `client` for a browser report.

- traceId: The request id the response named as `x-request-id`. For a browser report, the id of the document the tab loaded, which a later in-app navigation keeps.

- endpoint: `<type>:<key>` of the endpoint that answered 5xx, such as `query:orderTotal`.

- routeId: The route pattern, such as `/:lang/orders/:orderId`, never the URL with its values.

- accountId: The signed-in account's id on a `server` report whose request had one. Null on a `render` report, since rendering a page runs no guard, and on a browser report, which carries no cookies.

- digest: The id a deployed build shows the browser for a render error, also on the server's log line.

Errors from the browser

With `setClientReport`, each sampled page view sends its React root's uncaught, caught and recoverable errors, `window.onerror` and unhandled rejections to `/_akan/client-report`, at most five each. Without the option the route does not exist. The server takes a report only with the signed id it gave that page view, for 30 to 60 minutes after serving the page.

A native app's page loads from `app://localhost` (iOS, macOS, Linux) or `https://app.localhost` (Android, Windows), so it starts without an id. At its first `window.onerror` or unhandled rejection, which covers React's uncaught and recoverable errors and a failed native plugin call, it asks `GET /_akan/client-report` for one. The ask counts against `perAddress` and is drawn against `sampleRate`.

- sampleRate (number, default 1): The share of page views, from 0 to 1, that send their errors, drawn from each page view's request id.

- perAddress (number, default 10): Requests one address may send the route a minute, kept or not. An IPv6 address counts as its /64.

- perServer (number, default 120): Reports one server process hands the reporter a minute from all addresses together.

The reporter gets a `BrowserError`, with `source: "client"`, whose `data` holds:

- kind: `uncaught`, `caught` or `recoverable` from React, `error` from `window.onerror`, `rejection` from an unhandled rejection.

- name, message, stack: What the browser's `Error` held, cleaned as below and cut to 100, 1,000 and 4,000 characters.

- routeId, digest: The page's route pattern, and the digest when the browser's error carried one. Dropped unless each has its expected shape.

- buildId, userAgent: Added by the server: the build it runs, and the request's `User-Agent` cut to 300 characters.

- shell: `ios`, `android`, `macos`, `windows` or `linux` when a native app's page sent it, taken only from a shell origin; `null` for a page a browser opened. The server logs such a report as `Native <shell> page error` instead of `Browser error`.

What the server drops

**Reports it did not ask for.** It keeps only a `text/plain` POST of 8 KB or less, from the app's own origin or a native app's shell origin, carrying that page view's id. Every request gets the same empty 204.

**Terminal escapes and control characters.** They are removed, and a line break in `name` or `message` is written as `\n`.

**Query strings, addresses and credentials.** A URL or path loses its query string and fragment, an email address becomes `[email]`, and a `Bearer …` value or JWT becomes `[redacted]`: once in the page, again on the server.

**An id another deployment signed.** By default an id is good only within one gateway's replicas, or one solo process until restart. With several gateways or pods, set the secret `AKAN_CLIENT_REPORT_KEY`, 32 characters or more, the same on each.

**What the limits leave.** Each server process counts alone, so N replicas take up to N times `perServer`. Visitors behind one address share its `perAddress`, and all visitors one `perServer`: past it, that minute's reports are dropped.

**What leaves the browser.** The page view's id, the route pattern, and the error's name, message, stack and digest, cleaned as above. No cookies, no referrer and no account. The cleaning knows shapes, not meanings, so keep personal data out of error messages, and name the service in your privacy notice when your reporter forwards to one.

**Pages that send nothing.** The id comes in the page's `Server-Timing` header, which a script sees only on `localhost` and over HTTPS. A page a shared cache may reuse (`AKAN_HTML_CACHE_CONTROL` set to `public, max-age=…` or `off`) carries no id. A tab open past those 30 to 60 minutes has its reports dropped until the next document load.

Tips

**Name keys by domain and reason.** For example `order.error.notDraft`, `order.error.stockNotEnough`, `user.error.wrongPassword`.

**Do not translate on the server.** Send the key and `data`, and let the client pick the user's language.

**Pass a remote `Err` through as is.** A server-to-server `fetch.x(…, { origin })` restores the remote `Err`, so rethrow it rather than wrapping it in `new Error` or a key of your own.

The full dictionary chain, including `.error()` and `.translate()`.

Chain methods that validate, mutate and return `this`.

When a store needs a custom action, and how to write one.

Logging

Tail and filter server logs with `akan logs` to find a 500's stack.

## Code Examples

### apps/myapp/lib/order/order.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Order", "주문"]).desc(["Order description", "주문 설명"]))
  .error({
    notDraft: ["Only draft orders can be edited", "초안 주문만 수정할 수 있습니다."],
    productNotFound: ["Product not found", "상품을 찾을 수 없습니다."],
    stockNotEnough: [
      "{productName} needs {quantity} items",
      "{productName} 재고가 {quantity}개 필요합니다.",
    ],
  })
  .translate({
    addItemSuccess: ["Item added", "상품을 담았습니다."],
  });
```

### apps/myapp/lib/order/order.document.ts

```ts
import { by } from "akanjs/document";

import * as cnst from "../cnst";
import { Err } from "../dict";

export class Order extends by(cnst.Order) {
  editTitle(title: string) {
    if (this.status !== "draft") throw new Err("order.error.notDraft");
    this.title = title;
    return this;
  }
}
```

### apps/myapp/lib/order/order.service.ts

```ts
async addItem(orderId: string, productId: string, quantity: number) {
  const order = await this.getOrder(orderId);
  if (order.status !== "draft") throw new Err.Conflict("order.error.notDraft");

  const product = await this.productService.loadProduct(productId);
  if (!product) throw new Err.NotFound("order.error.productNotFound");

  return await order.addItem(product, quantity).save();
}
```

### apps/myapp/lib/order/order.document.ts

```ts
addItem(product: cnst.Product, quantity: number) {
  if (product.stock < quantity) {
    throw new Err("order.error.stockNotEnough", {
      productName: product.name,
      quantity,
    });
  }

  this.items = [...this.items, { product: product.id, quantity }];
  return this;
}
```

### apps/myapp/lib/order/order.store.ts

```ts
import { store } from "akanjs/store";
import { fetch, msg, sig } from "../useClient";

export class OrderStore extends store(sig.order, () => ({
  // state
})) {
  // action
  async addItemToOrder(orderId: string, productId: string, quantity: number) {
    const order = await fetch.addItemToOrder(orderId, productId, quantity);
    this.setOrder(order);
    msg.success("order.addItemSuccess");
  }
}
```

### apps/myapp/lib/order/Order.Util.tsx

```ts
"use client";
import { st, usePage } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";

interface AddItemProps {
  className?: string;
  orderId: string;
  productId: string;
}
export const AddItem = ({ className, orderId, productId }: AddItemProps) => {
  const { l } = usePage();
  return (
    <button
      type="button"
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={() => st.do.addItemToOrder(orderId, productId, 3)}
      type="button"
    >
      {l("order.signal.addItemToOrder")}
    </button>
  );
};
```

### Code

```json
{
  "error": "order.error.stockNotEnough",
  "statusCode": 400,
  "data": {
    "productName": "Yogurt Icecream",
    "quantity": 3
  },
  "path": "/addItemToOrder",
  "timestamp": "2026-05-25T00:00:00.000Z"
}
```

### apps/myapp/srvkit/errorTracker.ts

```ts
import { BrowserError, type ErrorReporter } from "akanjs/signal";

export const errorTracker: ErrorReporter = async (error, context) => {
  const ingestUrl = process.env.ERROR_TRACKER_URL;
  if (!ingestUrl) return;
  await fetch(ingestUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...context,
      name: error.name,
      message: error.message,
      stack: error.stack,
      browser: error instanceof BrowserError ? error.data : null,
    }),
  });
};
```

### apps/myapp/lib/option.ts

```ts
import { errorTracker } from "../srvkit";

export const option = new AkanOption<ModulesOptions>()
  .setErrorReporter(errorTracker)
  .setClientReport({ sampleRate: 0.25 });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

