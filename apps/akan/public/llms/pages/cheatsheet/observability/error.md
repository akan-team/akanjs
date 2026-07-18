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

Akan errors are built around one simple rule: server code throws a typed dictionary key, and the client shows the translated message for that key.

Declare user-facing errors in the module dictionary.

Throw `Err` from document or service code when a business rule fails.

Let fetch restore the response as an `Err`, then show it with `msg.error()`.

Declare Errors

Start in the dictionary. The keys you declare here become the only valid keys for `Err`, so typo mistakes are caught by TypeScript.

Throw Err

Use `Err` for business rules that users can understand and fix. A document method is a good place for state rules because every service shares the same rule.

Choose Status

`new Err()` uses 400 by default. When the HTTP meaning matters, pick a named helper. This keeps API responses clear without making every rule verbose.

`Err.NotFound`: a requested record does not exist.

`Err.Conflict`: the current state cannot accept this action.

`Err.Forbidden`: the user is known but may not do this action.

Use Data

Pass `data` when the translated message needs values. The server keeps the dictionary key as `error`, and sends `data` beside it for interpolation.

Client Handling

Akan fetch restores an error response as `Err`. In UI code, catch it and pass its key and data to `msg.error()`.

Response Shape

HTTP and websocket errors use the same simple shape. Most app code does not need to build this by hand, but knowing it makes debugging easier.

Tips

Use `Err` for user-facing domain failures. Use normal `Error` for programmer mistakes, missing setup, or impossible states.

Put repeated state rules in document methods. Put cross-model checks and loading logic in services.

Name keys by domain and reason: `order.error.notDraft`, `order.error.stockNotEnough`, `user.error.wrongPassword`.

Do not translate on the server. Send the key and data, then let the client choose the user's language.

## Code Examples

### order.dictionary.ts

```ts
export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Order", "주문"]).desc(["Order description", "주문 설명"]))
  .error({
    notDraft: ["Only draft orders can be edited", "초안 주문만 수정할 수 있습니다."],
    productNotFound: ["Product not found", "상품을 찾을 수 없습니다."],
    stockNotEnough: [
      "{productName} needs {quantity} items",
      "{productName} 재고가 {quantity}개 필요합니다.",
    ],
  });
```

### order.document.ts

```ts
import { Err } from "../dict";

export class Order extends by(cnst.Order) {
  editTitle(title: string) {
    if (this.status !== "draft") throw new Err("order.error.notDraft");
    this.title = title;
    return this;
  }
}
```

### order.service.ts

```ts
async addItem(orderId: string, productId: string, quantity: number) {
  const order = await this.getOrder(orderId);
  if (order.status !== "draft") throw new Err.Conflict("order.error.notDraft");

  const product = await this.productService.loadProduct(productId);
  if (!product) throw new Err.NotFound("order.error.productNotFound");

  return await order.addItem(product, quantity).save();
}
```

### order.document.ts

```ts
addItem(product: Product, quantity: number) {
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

### Order.Util.tsx

```ts
import { Err, fetch, msg } from "@apps/myApp/client";

export const AddOrderItem = ({ orderId, productId }: Props) => {
  const addItem = async () => {
    try {
      await fetch.addItem(orderId, productId, 3);
      msg.success("order.addItemSuccess");
    } catch (error) {
      if (error instanceof Err) {
        msg.error(error.error, { data: error.data });
        return;
      }
      msg.error("order.error.unknown");
    }
  };

  return <button onClick={addItem}>Add item</button>;
};
```

### Error response

```ts
{
  "error": "order.error.stockNotEnough",
  "statusCode": 400,
  "data": {
    "productName": "Yogurt Icecream",
    "quantity": 3
  },
  "path": "/order/addItem",
  "timestamp": "2026-05-25T00:00:00.000Z"
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

