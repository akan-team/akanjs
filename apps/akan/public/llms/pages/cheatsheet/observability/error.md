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

**`get` throws, `load` returns null.** `getOrder(id)` throws a plain error when the record is missing, so the caller sees a generic 500.

**Answer a missing record yourself.** When a user can reach an id that does not exist, call `loadProduct(id)` and throw `Err.NotFound` on `null`.

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

Anything that is not an `Err` is answered as a 500, so the user never sees the dictionary sentence:

Thrown

What the caller gets

- Err, Err.*: Answered with its own `statusCode`, and `error` holds the dictionary key.

- Error, getOrder(missingId): Answered as 500, and a deployed build sets `error` to `Internal Server Error`.

**In development you see everything.** Under `akan start` the response carries the real message and the stack.

**The stack is in the server log.** Every such 500 is logged with its stack, even when the response hides it.

**Debugging a deployed build.** Set `AKAN_ERROR_DETAIL=1` to put the real message back into the response.

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

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

