# Interact in Service

- Source: /docs/tutorials/service
- Mirror: /llms/pages/docs/tutorials/service.md
- Section: docs
- Category: Tutorials
- Priority: P1

## Headings

- Interact in Service (#interact-in-service)
- Declare Adapter (#declare-adapter)
- Use External API (#use-external-api)
- Query in Document (#query-in-document)
- Use Interval (#use-interval)

## Content

Interact in Service

When an order comes in, you need to inform the staff so that they can make ice cream, and when the ice cream is made, you need to notify the customer. Also, if the ice cream melts, you need to notify the customer again if they don't pick it up for a long time.

To achieve this, you need to add a service that sends periodic warnings if a served order is not finished, and a service that sends an alert message to the customer to remind them to pick up the order.

Declare Adapter

First, let's start by connecting an external API or module like an alert. You can connect an api that sends messages or emails, but in this tutorial, we'll create an api that simply prints to the console and connect it.

Modules like service, signal, document should not be directly connected to external systems, but rather created as adapters that are injected. First, let's create an adapter in the /srvkit folder as follows.

Then, export the module in the /srvkit/index.ts file.

Why use the adapter pattern? By injecting external dependencies as adapters rather than directly importing them in services, you gain several benefits:

(1) Testability - you can easily mock or replace the adapter in tests without modifying the service code

(2) Flexibility - you can swap implementations (e.g., switch from console logging to email notifications) without changing the service logic

(3) Separation of Concerns - the service focuses on business logic while adapters handle external interactions

(4) Reusability - the same adapter can be injected and shared across multiple services

Use External API

Now, in order to inject the adapter for the alarm into the server, you need to declare and register the adapter to be injected in the option.ts file.

Now, you can inject the alarmApi in the icecreamOrderService and use it.

Query in Document

Now, let's add a service function that sends a warning message if a served order is not finished. For easy testing, let's send a warning message after 15 seconds if the order is served.

However, how can we query only the served icecream orders? To do this, let's create a list query function by utilizing the feature of creating a query based on the given conditions in the icecreamOrder.document file.

Now, let's apply the query to the document.

By declaring the byStatuses query in IcecreamOrderFilter, you can use list, find, count, sample functions according to the given query conditions. For example, you can use listByStatuses, countByStatuses functions.

Why do we receive an array of statuses instead of a single status? This is useful when we need to query multiple statuses at once. If we think there is a possibility of querying multiple statuses, it is better to receive them as an array and process them.

Use Interval

Now, let's use interval to execute the service every 15 seconds. The interval trigger is a trigger that works internally, and can be declared in IcecreamOrderInternal.

Now, you can see the warning message printed to the console if the order is served for more than 15 seconds.

Signal file is a file that declares triggers for executing service functions, and Signal has Internal, Endpoint, Slice classes.

Internal is a class that declares triggers for executing service functions, and has init, interval, cron, queue, etc. triggers.

## Code Examples

### apps/koyo/srvkit/alarmApi.ts

```typescript
import { Logger } from "akanjs/common";

export class AlarmApi {
  readonly #logger = new Logger("AlarmApi");
  constructor(readonly name: string) {}

  warn(message: string) {
    this.#logger.warn(`${this.name}: ${message}`);
  }
}
```

### apps/koyo/srvkit/index.ts

```ts
export * from "./alarmApi";
```

### apps/koyo/lib/option.ts

```ts
import { AlarmApi } from "@apps/koyo/srvkit"; // [!code ++]
import { AkanOption } from "akanjs/server"; // [!code collapse:8]

import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  //
};

export const option = new AkanOption<ModulesOptions>().use((options) => ({
  alarmApi: new AlarmApi(options.appName), // [!code ++]
}));
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts

```ts
import { AlarmApi } from "@apps/koyo/srvkit"; // [!code ++]
import { serve } from "akanjs/service"; // [!code collapse:4]

import * as db from "../db";

export class IcecreamOrderService extends serve(db.icecreamOrder, ({ use, service }) => ({
  alarmApi: use<AlarmApi>(), // [!code ++]
})) {
  async processIcecreamOrder(icecreamOrderId: string) { // [!code collapse:16]
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.process().save();
  }
  async serveIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.serve().save();
  }
  async finishIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.finish().save();
  }
  async cancelIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.cancel().save();
  }
}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts

```ts
import { dayjs } from "akanjs/base"; // [!code ++]
import { serve } from "akanjs/service"; // [!code collapse:5]
import { AlarmApi } from "@apps/koyo/srvkit";

import * as db from "../db";

export class IcecreamOrderService extends serve(db.icecreamOrder, ({ use, service }) => ({
  alarmApi: use<AlarmApi>(),
})) {
  async processIcecreamOrder(icecreamOrderId: string) { // [!code collapse:16]
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.process().save();
  }
  async serveIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.serve().save();
  }
  async finishIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.finish().save();
  }
  async cancelIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await this.getIcecreamOrder(icecreamOrderId);
    return await icecreamOrder.cancel().save();
  }
  async warnIcecreamMeltingAll() { // [!code ++:7]
    const servedIcecreamOrders = await this.icecreamOrderModel.listByStatuses(["served"]);
    for (const icecreamOrder of servedIcecreamOrders) {
      if (icecreamOrder.createdAt.isAfter(dayjs().subtract(15, "seconds"))) continue;
      this.alarmApi.warn(`IcecreamOrder ${icecreamOrder.id} is melting 😱`);
    }
  }
}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.document.ts

```ts
import { by, from, into, type SchemaOf } from "akanjs/document"; // [!code collapse:5]

import * as cnst from "../cnst";
import { Err } from "../dict";

export class IcecreamOrderFilter extends from(cnst.IcecreamOrder, (filter) => ({
  query: {
    byStatuses: filter() // [!code ++:5]
      .opt("statuses", [cnst.IcecreamOrderStatus])
      .query((statuses, q) => ({
        ...(statuses?.length ? { status: q.oneOf(statuses) } : {}),
      })),
  },
  sort: {},
})) {}
// [!code collapse:30]
export class IcecreamOrder extends by(cnst.IcecreamOrder) {
  process() {
    if (this.status !== "active") throw new Err("icecreamOrder.error.onlyActiveCanBeProcessed");
    this.status = "processing";
    return this;
  }
  serve() {
    if (this.status !== "processing") throw new Err("icecreamOrder.error.onlyProcessingCanBeServed");
    this.status = "served";
    return this;
  }
  finish() {
    if (this.status !== "served") throw new Err("icecreamOrder.error.onlyServedCanBeFinished");
    this.status = "finished";
    return this;
  }
  cancel() {
    if (this.status !== "active") throw new Err("icecreamOrder.error.onlyActiveCanBeCanceled");
    this.status = "canceled";
    return this;
  }
}
export class IcecreamOrderModel extends into(IcecreamOrder, IcecreamOrderFilter, cnst.icecreamOrder, () => ({})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts

```ts
import { ID } from "akanjs/base"; // [!code collapse:7]
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, ({ interval }) => ({
  warnIcecreamMeltingAll: interval(10000).exec(async function () { // [!code ++:3]
    await this.icecreamOrderService.warnIcecreamMeltingAll();
  }),
})) {}
// [!code collapse:33]
export class IcecreamOrderSlice extends slice(
  srv.icecreamOrder,
  { guards: { root: Public, get: Public, cru: Public } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.icecreamOrderService.queryAny();
    }),
  })
) {}

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ query, mutation }) => ({
  processIcecreamOrder: mutation(cnst.IcecreamOrder) // [!code ++:20]
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.processIcecreamOrder(icecreamOrderId);
    }),
  serveIcecreamOrder: mutation(cnst.IcecreamOrder)
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.serveIcecreamOrder(icecreamOrderId);
    }),
  finishIcecreamOrder: mutation(cnst.IcecreamOrder)
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.finishIcecreamOrder(icecreamOrderId);
    }),
  cancelIcecreamOrder: mutation(cnst.IcecreamOrder)
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.cancelIcecreamOrder(icecreamOrderId);
    }),
})) {}
```

### Code

```bash
[AlarmApi] 44136 - 11/06/2025, 22:19:29 PM    WARN  myapp: IcecreamOrder 690c9f5d83050b6bb34b93bc is melting 😱 +331830ms
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

