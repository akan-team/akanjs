# Using Scalar

- Source: /docs/tutorials/scalar
- Mirror: /llms/pages/docs/tutorials/scalar.md
- Section: docs
- Category: Tutorials
- Priority: P1

## Headings

- Use Setting Module (#use-setting-module)
- Create Scalar (#create-scalar)
- Create Inventory (#create-inventory)
- Business Logic (#business-logic)
- Connect Service (#connect-service)
- Connect Signal (#connect-signal)
- Interact on UI (#interact-on-ui)

## Content

Using Scalar

Use Setting Module

Now the ice cream shop can receive and process orders, and with many customers coming in, it's easy to run out of stock. Let's find out how to handle this situation.

You need to add a service that checks the remaining ice cream and toppings every morning, sets the inventory status in the system, and automatically disables orders when the inventory is depleted.

Create Scalar

First, let's create a Scalar to represent individual stock items. Think of a Scalar as a reusable data building block - like Lego pieces that can be combined into larger structures. Unlike a full Model that has its own database collection, a Scalar is embedded within other models. In our case, the Stock scalar will be used inside the Inventory model.

Use the CLI to generate the scalar structure:

Now define the Stock scalar with the item type and quantity tracking:

Let's understand the Stock scalar structure:

An enum combining yogurt ice cream with all available toppings. This allows tracking inventory for all product types in one system.

Track both the starting amount and current remaining quantity. This helps calculate usage and identify when restocking is needed.

Add dictionary entries for the scalar. Notice how we reuse the topping translations from the icecreamOrder dictionary:

Create Inventory

Now let's create an Inventory module to manage daily stock records. Think of this like the daily inventory sheet that a shop manager fills out each morning - it contains all the stock items and their quantities for that specific day.

Create the inventory module using the CLI:

Define the Inventory model with embedded Stock scalars:

Key features of the Inventory model:

An array of Stock scalars. This is where our reusable Scalar shines - we embed multiple Stock objects directly in the Inventory document.

A date field that defaults to midnight of the current day. This allows creating one inventory record per day and easily finding today's inventory.

Add dictionary entries with helpful error messages for inventory operations:

Business Logic

Now let's implement the core business logic for inventory management. Just like a real ice cream shop needs rules for using stock and refilling supplies, we need to encode these operations in our document and service layers.

First, define the document methods for stock operations and daily inventory generation:

Let's understand the key document methods:

Decrements stock quantity when orders are placed. Validates that stock exists and has sufficient quantity, throwing Err errors with dictionary messages if not.

Restocks all items to their default quantities. Smart enough to only add what's needed - if you have 3 of 10 toppings left, it adds 7 more.

Automatically creates a new inventory record for today if one doesn't exist. Returns existing inventory if already created - ensuring one record per day.

Now create the service layer to expose these operations:

Connect Service

Now comes the magic - connecting the inventory system to our existing ice cream order flow. When a customer places an order, the system should automatically deduct the used ingredients from inventory. This is like how a real POS system updates stock counts in real-time as sales are made.

Inject the InventoryService into IcecreamOrderService and use the _preCreate hook to deduct stock:

Key aspects of this integration:

Dependency injection allows IcecreamOrderService to access InventoryService methods

A lifecycle hook that runs before creating a new order. Perfect for validation and side effects like inventory deduction.

Usage Calculation

The order size determines yogurt usage, and each topping uses 1 unit from inventory.

Connect Signal

To allow the frontend to interact with inventory, we need API endpoints. Staff should be able to view today's inventory and refill stock when running low. Let's create the signal endpoints and frontend store.

Create the inventory endpoints:

Add dictionary entries for the endpoints:

Now create the frontend store to manage inventory state:

Interact on UI

Now let's bring everything together in the UI. The customer-facing order form needs to check inventory and disable options that are out of stock. Staff also need a dashboard to monitor inventory levels and refill when needed. This creates a complete inventory management system!

First, update the order template to check inventory before displaying options:

Key features of the inventory-aware template:

Called in useEffect to load inventory data when the component mounts. Shows a loading spinner until data is ready.

Out of Stock Check

If yogurt ice cream is completely out of stock, shows a friendly message instead of the form. No point ordering if we can't make it!

Each size and topping option checks if sufficient stock exists. Disabled options are grayed out but still visible, so customers know what's normally available.

Add the isInStock helper method to the Inventory constant:

Now let's create utility components for staff to refill inventory:

Create a visual dashboard showing stock levels with color-coded status indicators:

Add helper methods to the Stock scalar for status calculation:

Create a Zone component for real-time inventory monitoring:

Finally, put it all together in the main page with both inventory dashboard and order management:

🎉 What You've Accomplished:

Created a reusable Stock scalar for inventory items

Built an Inventory module with daily records

Implemented stock usage and refill business logic

Connected inventory to order creation flow

Created visual dashboard with real-time updates

Disabled out-of-stock options in customer UI

In the next tutorial, we'll explore Insight - a powerful feature for aggregating and analyzing data across your models. This will allow you to create analytics dashboards and gain business intelligence from your ice cream shop data.

## Code Examples

### Terminal

```bash
akan create-scalar stock
# then select koyo application
```

### apps/koyo/lib/__scalar/stock/stock.constant.ts

```ts
import { enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

import { Topping } from "../../icecreamOrder/icecreamOrder.constant";

export class StockType extends enumOf("stockType", ["yogurtIcecream", ...Topping.values] as const) {}

export class Stock extends via((field) => ({
  type: field(StockType),
  totalQty: field(Int, { default: 0, min: 0 }),
  currentQty: field(Int, { default: 0, min: 0 }),
})) {}
```

### apps/koyo/lib/__scalar/stock/stock.dictionary.ts

```ts
import { scalarDictionary } from "akanjs/dictionary";

import { type Topping } from "../../icecreamOrder/icecreamOrder.constant";
import { dictionary as icecreamOrder } from "../../icecreamOrder/icecreamOrder.dictionary";
import type { Stock, StockType } from "./stock.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Stock", "재고"]).desc([
      "Stock is a collection of items that are available for purchase",
      "재고는 구매 가능한 아이템들의 모음입니다",
    ])
  )
  .model<Stock>((t) => ({
    type: t(["Type", "타입"]).desc(["Type of the stock", "재고의 타입"]),
    totalQty: t(["Total Quantity", "총 수량"]).desc(["Total Quantity", "총 수량"]),
    currentQty: t(["Current Quantity", "현재 수량"]).desc(["Current quantity of the stock", "재고의 현재 수량"]),
  }))
  .enum<StockType>("stockType", (t) => ({
    yogurtIcecream: t(["Yogurt Icecream", "요거트 아이스크림"]).desc([
      "Yogurt Icecream stock",
      "요거트 아이스크림 재고",
    ]),
    ...icecreamOrder.getEnum<Topping>("topping"),
  }));
```

### Terminal

```bash
akan create-module inventory
# then select koyo application
```

### apps/koyo/lib/inventory/inventory.constant.ts

```ts
import { via } from "akanjs/constant";
import { dayjs } from "akanjs/base"; // [!code ++]

import { Stock } from "../__scalar/stock/stock.constant"; // [!code ++]

export class InventoryInput extends via((field) => ({
  field: field(String).optional(), // [!code --]
  stocks: field([Stock]), // [!code ++]
})) {}

export class InventoryObject extends via(InventoryInput, (field) => ({
  at: field(Date, { default: () => dayjs().set("hour", 0).set("minute", 0).set("second", 0).set("millisecond", 0) }), // [!code ++]
})) {}
// [!code collapse:6]
export class LightInventory extends via(InventoryObject, [] as const, (resolve) => ({})) {}

export class Inventory extends via(InventoryObject, LightInventory, (resolve) => ({})) {}

export class InventoryInsight extends via(Inventory, (field) => ({})) {}
```

### apps/koyo/lib/inventory/inventory.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:5]

import type { Inventory, InventoryInsight } from "./inventory.constant";
import type { InventoryEndpoint, InventorySlice } from "./inventory.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Inventory", "Inventory"]).desc([
      "Inventory is a record of stock items at a specific time",
      "Inventory는 특정 시점의 재고 항목들을 기록한 레코드입니다",
    ])
  )
  .model<Inventory>((t) => ({
    stocks: t(["Stocks", "재고"]).desc([
      "A list of stock items associated with inventory record. Each entry represents a type of item and its current stock level.",
      "인벤토리 레코드와 관련된 재고 항목들의 목록입니다. 각 항목은 아이템 종류와 현재 재고량을 의미합니다.",
    ]),
    at: t(["At", "일시"]).desc([
      "The timestamp indicating when inventory record was created or is valid for.",
      "인벤토리 레코드가 생성된 시점 또는 해당되는 일자를 나타내는 타임스탬프입니다.",
    ]),
  }))
  .insight<InventoryInsight>((t) => ({})) // [!code collapse:5]
  .slice<InventorySlice>((fn) => ({
    inPublic: fn(["Inventory In Public", "Inventory 공개"]).arg((t) => ({})),
  }))
  .endpoint<InventoryEndpoint>((fn) => ({}))
  .error({
    stockNotFound: ["Stock not found: {type}", "재고를 찾을 수 없습니다: {type}"],
    stockNotEnough: ["Stock not enough: {type}, {quantity}", "재고가 부족합니다: {type}, {quantity}"],
  })
  .translate({
    outOfStock: ["Out of stock", "재고가 부족합니다"],
  });
```

### apps/koyo/lib/inventory/inventory.document.ts

```ts
import { dayjs } from "akanjs/base"; // [!code ++]
import { by, from, into, type SchemaOf } from "akanjs/document"; // [!code collapse:3]

import * as cnst from "../cnst";
import { Err } from "../dict"; // [!code ++]

export class InventoryFilter extends from(cnst.Inventory, (filter) => ({
  query: {},
  sort: {
    latestAt: { at: -1 }, // [!code ++]
  },
})) {}

export class Inventory extends by(cnst.Inventory) {
  useStocks(usages: { type: cnst.StockType["value"]; quantity: number }[]) { // [!code ++:27]
    for (const usage of usages) this.useStock(usage.type, usage.quantity);
    return this;
  }
  useStock(type: cnst.StockType["value"], quantity: number) {
    const stock = this.stocks.find((stock) => stock.type === type);
    if (!stock) throw new Err("inventory.error.stockNotFound", { type });
    if (stock.currentQty < quantity) throw new Err("inventory.error.stockNotEnough", { type, quantity });
    stock.currentQty -= quantity;
    return this;
  }
  refill() {
    const YOGURT_ICECREAM_QUANTITY = 1000;
    const TOPPING_QUANTITY = 10;
    const refillStocks: { type: cnst.StockType["value"]; fillQty: number }[] = [
      { type: "yogurtIcecream", fillQty: YOGURT_ICECREAM_QUANTITY },
      ...cnst.Topping.map((topping) => ({ type: topping, fillQty: TOPPING_QUANTITY })),
    ];
    const filledStocks = refillStocks.map((stock) => {
      const existingStock = this.stocks.find((s) => s.type === stock.type);
      if (!existingStock) return { type: stock.type, totalQty: stock.fillQty, currentQty: stock.fillQty };
      const fillQty = Math.max(stock.fillQty - existingStock.currentQty, 0);
      return { type: stock.type, totalQty: existingStock.totalQty, currentQty: existingStock.currentQty + fillQty };
    });
    this.stocks = filledStocks;
    return this;
  }
}

export class InventoryModel extends into(Inventory, InventoryFilter, cnst.inventory, () => ({})) {
  async generateTodaysInventory() { // [!code ++:6]
    const today = dayjs().set("hour", 0).set("minute", 0).set("second", 0).set("millisecond", 0);
    const latestInventory = await this.findAny({ sort: "latestAt" });
    if (latestInventory?.at.isSame(today)) return latestInventory;
    return await new this.Inventory({ at: today }).refill().save();
  }
}
```

### apps/koyo/lib/inventory/inventory.service.ts

```ts
import { serve } from "akanjs/service"; // [!code collapse:5]

import * as cnst from "../cnst";
import * as db from "../db";

export class InventoryService extends serve(db.inventory, ({ use, service }) => ({})) {
  async getTodaysInventory() { // [!code ++:11]
    return await this.inventoryModel.generateTodaysInventory();
  }
  async refillTodaysInventory() {
    const inventory = await this.getTodaysInventory();
    return await inventory.refill().save();
  }
  async useStocks(usages: {type: cnst.StockType["value"], quantity: number}[]) {
    const inventory = await this.getTodaysInventory();
    return await inventory.useStocks(usages).save();
  }
}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts

```ts
import { dayjs } from "akanjs/base"; // [!code collapse:5]
import { serve } from "akanjs/service";
import { AlarmApi } from "@apps/koyo/srvkit";

import * as db from "../db";
import type * as srv from "../srv"; // [!code ++]

export class IcecreamOrderService extends serve(db.icecreamOrder, ({ use, service }) => ({
  alarmApi: use<AlarmApi>(),
  inventoryService: service<srv.InventoryService>(), // [!code ++]
})) {
  override async _preCreate(data: db.IcecreamOrderInput) { // [!code ++:7]
    await this.inventoryService.useStocks([
      { type: "yogurtIcecream", quantity: data.size },
      ...data.toppings.map((topping) => ({ type: topping, quantity: 1 })),
    ]);
    return data;
  }
  async processIcecreamOrder(icecreamOrderId: string) { // [!code collapse:23]
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
  async warnIcecreamMeltingAll() {
    const servedIcecreamOrders = await this.icecreamOrderModel.listByStatuses(["served"]);
    for (const icecreamOrder of servedIcecreamOrders) {
      if (icecreamOrder.createdAt.isAfter(dayjs().subtract(15, "seconds"))) continue;
      this.alarmApi.warn(`IcecreamOrder ${icecreamOrder.id} is melting 😱`);
    }
  }
}
```

### apps/koyo/lib/inventory/inventory.signal.ts

```ts
import { endpoint, internal, Public, slice } from "akanjs/signal"; // [!code collapse:17]
import * as cnst from "../cnst";
import * as srv from "../srv";

export class InventoryInternal extends internal(srv.inventory, ({ interval }) => ({})) {}

export class InventorySlice extends slice(
  srv.inventory,
  { guards: { root: Public, get: Public, cru: Public } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.inventoryService.queryAny();
    }),
  })
) {}

export class InventoryEndpoint extends endpoint(srv.inventory, ({ query, mutation }) => ({
  getTodaysInventory: query(cnst.Inventory).exec(async function () { // [!code ++:6]
    return await this.inventoryService.getTodaysInventory();
  }),
  refillTodaysInventory: query(cnst.Inventory).exec(async function () {
    return await this.inventoryService.refillTodaysInventory();
  }),
})) {}
```

### apps/koyo/lib/inventory/inventory.dictionary.ts

```ts
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:5]

import type { Inventory, InventoryInsight } from "./inventory.constant";
import type { InventoryEndpoint, InventorySlice } from "./inventory.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:20]
    t(["Inventory", "Inventory"]).desc([
      "Inventory is a record of stock items at a specific time",
      "Inventory는 특정 시점의 재고 항목들을 기록한 레코드입니다",
    ])
  )
  .model<Inventory>((t) => ({
    stocks: t(["Stocks", "재고"]).desc([
      "A list of stock items associated with inventory record. Each entry represents a type of item and its current stock level.",
      "인벤토리 레코드와 관련된 재고 항목들의 목록입니다. 각 항목은 아이템 종류와 현재 재고량을 의미합니다.",
    ]),
    at: t(["At", "일시"]).desc([
      "The timestamp indicating when inventory record was created or is valid for.",
      "인벤토리 레코드가 생성된 시점 또는 해당되는 일자를 나타내는 타임스탬프입니다.",
    ]),
  }))
  .insight<InventoryInsight>((t) => ({}))
  .slice<InventorySlice>((fn) => ({
    inPublic: fn(["Inventory In Public", "Inventory 공개"]).arg((t) => ({})),
  }))
  .endpoint<InventoryEndpoint>((fn) => ({
    getTodaysInventory: fn(["Get Todays Inventory", "오늘 재고 조회"]).desc([ // [!code ++:8]
      "Get today's inventory. If not exists, create it.",
      "오늘의 인벤토리를 조회합니다. 없으면 생성합니다.",
    ]),
    refillTodaysInventory: fn(["Refill Todays Inventory", "오늘 재고 채우기"]).desc([
      "Refill today's inventory.",
      "오늘의 인벤토리를 채웁니다.",
    ]),
  }))
  .error({ // [!code collapse:7]
    stockNotFound: ["Stock not found: {type}", "재고를 찾을 수 없습니다: {type}"],
    stockNotEnough: ["Stock not enough: {type}, {quantity}", "재고가 부족합니다: {type}, {quantity}"],
  })
  .translate({
    outOfStock: ["Out of stock", "재고가 부족합니다"],
  });
```

### apps/koyo/lib/inventory/inventory.store.ts

```ts
import { store } from "akanjs/store"; // [!code collapse:5]

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class InventoryStore extends store(sig.inventory, () => ({
  todaysInventory: null as cnst.Inventory | null, // [!code ++]
})) {
  async loadTodaysInventory() { // [!code ++:8]
    const todaysInventory = await fetch.getTodaysInventory();
    this.set({ todaysInventory });
  }
  async refillTodaysInventory() {
    const todaysInventory = await fetch.refillTodaysInventory();
    this.set({ todaysInventory });
  }
}
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx

```ts
"use client"; // [!code collapse:4]
import { clsx } from "akanjs/client";
import { Field, Layout } from "akanjs/ui";
import { cnst, st, usePage } from "@apps/koyo/client";
import { Loading } from "akanjs/ui"; // [!code ++:2]
import { useEffect } from "react";
// [!code collapse:5]
interface GeneralProps {
  className?: string;
  showServeType?: boolean;
}

export const General = ({ className, showServeType = true }: GeneralProps) => {
  const { l } = usePage();
  const icecreamOrderForm = st.use.icecreamOrderForm();
  const todaysInventory = st.use.todaysInventory(); // [!code ++:7]
  useEffect(() => {
    void st.do.loadTodaysInventory();
  }, []);
  if (!todaysInventory) return <Loading.Area />;
  else if (!todaysInventory.isInStock("yogurtIcecream"))
    return <div className="flex size-full items-center justify-center text-xl">{l("inventory.outOfStock")}</div>;
  return (
    <Layout.Template className={clsx("w-full space-y-6", className)}>
      {showServeType ? ( // [!code collapse:15]
        <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🍦</span>
              <h2 className="text-2xl font-semibold text-primary">{l("icecreamOrder.serveType")}</h2>
            </div>
            <Field.ToggleSelect
              items={cnst.ServeType}
              value={icecreamOrderForm.serveType}
              onChange={st.do.setServeTypeOnIcecreamOrder}
            />
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3"> // [!code collapse:4]
            <span className="text-3xl">📏</span>
            <h2 className="text-2xl font-semibold text-primary">{l("icecreamOrder.size")}</h2>
          </div>
          <Field.ToggleSelect
            items={[50, 100, 200].map((size) => ({
              label: `${size}cc`,
              value: size,
              disabled: !todaysInventory.isInStock("yogurtIcecream", size), // [!code highlight]
            }))}
            value={icecreamOrderForm.size}
            onChange={st.do.setSizeOnIcecreamOrder}
          />
        </div>
      </div>
      <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3"> // [!code collapse:4]
            <span className="text-3xl">🍓</span>
            <h2 className="text-2xl font-semibold text-primary">{l("icecreamOrder.toppings")}</h2>
          </div>
          <Field.MultiToggleSelect
            items={cnst.Topping.map((topping) => ({ // [!code highlight:5]
              label: topping,
              value: topping,
              disabled: !todaysInventory.isInStock(topping),
            }))}
            value={icecreamOrderForm.toppings}
            onChange={st.do.setToppingsOnIcecreamOrder}
          />
        </div>
      </div>
      <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-md backdrop-blur-sm"> // [!code collapse:13]
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📱</span>
            <h2 className="text-2xl font-semibold text-primary">{l("icecreamOrder.phone")}</h2>
          </div>
          <Field.Phone
            placeholder="010-0000-0000"
            value={icecreamOrderForm.phone}
            onChange={st.do.setPhoneOnIcecreamOrder}
          />
        </div>
      </div>
    </Layout.Template>
  );
};
```

### apps/koyo/lib/inventory/inventory.constant.ts

```ts
import { dayjs } from "akanjs/base"; // [!code collapse:4]
import { via } from "akanjs/constant";

import { Stock } from "../__scalar/stock/stock.constant";
import { StockType } from "../__scalar/stock/stock.constant"; // [!code ++]
// [!code collapse:11]
export class InventoryInput extends via((field) => ({
  stocks: field([Stock]),
})) {}

export class InventoryObject extends via(InventoryInput, (field) => ({
  at: field(Date, { default: () => dayjs().set("hour", 0).set("minute", 0).set("second", 0).set("millisecond", 0) }),
})) {}

export class LightInventory extends via(InventoryObject, [] as const, (resolve) => ({})) {}

export class Inventory extends via(InventoryObject, LightInventory, (resolve) => ({})) {
  isInStock(type: StockType["value"], quantity = 1) { // [!code ++:5]
    const stock = this.stocks.find((stock) => stock.type === type);
    if (!stock) return false;
    return stock.currentQty >= quantity;
  }
}
// [!code collapse:2]
export class InventoryInsight extends via(Inventory, (field) => ({})) {}
```

### apps/koyo/lib/inventory/Inventory.Util.tsx

```ts
"use client";
import { clsx } from "akanjs/client";
import { st, usePage } from "@apps/koyo/client";
import { BiRefresh } from "react-icons/bi";

interface RefillProps {
  className?: string;
}
export const Refill = ({ className }: RefillProps) => {
  const { l } = usePage();
  return (
    <button
      className={clsx("btn btn-primary", className)}
      onClick={() => {
        void st.do.refillTodaysInventory();
      }}
    >
      <BiRefresh /> {l("inventory.signal.refillTodaysInventory")}
    </button>
  );
};
```

### apps/koyo/lib/inventory/Inventory.View.tsx

```ts
import { dayjs } from "akanjs/base";
import { clsx } from "akanjs/client";
import { cnst, usePage } from "@apps/koyo/client";

interface GeneralProps {
  className?: string;
  inventory: cnst.Inventory;
}

export const General = ({ className, inventory }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("w-full space-y-2 rounded-xl border border-base-300 bg-base-100 p-4", className)}>
      <div className="text-lg font-bold text-primary">{dayjs(inventory.at).format("YYYY-MM-DD")}</div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {inventory.stocks.map((stock, index) => {
          const status = stock.getStatus();
          const percentage = stock.getPercentage();
          return (
            <div
              key={`${stock.type}-${index}`}
              className={clsx("space-y-3 rounded-xl border bg-base-100 px-6 py-4 shadow-md", {
                "border-base-300": status === "empty",
                "border-warning/40": status === "low",
                "border-success/40": status === "normal",
              })}
            >
              <div className="flex items-center justify-between">
                <div
                  className={clsx("rounded px-2 py-1 text-xs font-bold", {
                    "border border-base-300 bg-base-100 text-base-content/70": status === "empty",
                    "border border-warning/40 bg-base-100 text-warning": status === "low",
                    "border border-success/40 bg-base-100 text-success": status === "normal",
                  })}
                >
                  {l(`stockType.${stock.type}`)}
                </div>
                <div
                  className={clsx("text-2xl font-bold", {
                    "text-primary": status === "empty",
                    "text-warning": status === "low",
                    "text-success": status === "normal",
                  })}
                >
                  {stock.currentQty} / {stock.totalQty}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-base-200">
                  <div
                    className={clsx("h-full", {
                      "bg-base-300": status === "empty",
                      "bg-warning": status === "low",
                      "bg-success": status === "normal",
                    })}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
                <div
                  className={clsx("text-right text-xs font-bold", {
                    "text-primary": status === "empty",
                    "text-warning": status === "low",
                    "text-success": status === "normal",
                  })}
                >
                  {Math.round(percentage)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

### apps/koyo/lib/__scalar/stock/stock.constant.ts

```ts
import { enumOf, Int } from "akanjs/base"; // [!code collapse:7]
import { via } from "akanjs/constant";

import { Topping } from "../../icecreamOrder/icecreamOrder.constant";

export class StockType extends enumOf("stockType", ["yogurtIcecream", ...Topping.values] as const) {}

export class Stock extends via((field) => ({
  type: field(StockType), // [!code collapse:3]
  totalQty: field(Int, { default: 0, min: 0 }),
  currentQty: field(Int, { default: 0, min: 0 }),
})) {
  getPercentage() { // [!code ++:9]
    if (this.totalQty === 0) return 0;
    return (this.currentQty / this.totalQty) * 100;
  }
  getStatus() {
    const percentage = this.getPercentage();
    if (percentage === 0) return "empty";
    if (percentage < 30) return "low";
    return "normal";
  }
}
```

### apps/koyo/lib/inventory/Inventory.Zone.tsx

```ts
"use client"; // [!code collapse:4]
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";
import { cnst, Inventory } from "@apps/koyo/client";
import { useInterval } from "akanjs/webkit"; // [!code ++:3]
import { Loading } from "akanjs/ui";
import { st } from "@apps/koyo/client";
// [!code collapse:25]
interface CardProps {
  className?: string;
  init: ClientInit<"inventory", cnst.LightInventory>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(inventory: cnst.LightInventory) => (
        <Inventory.Unit.Card key={inventory.id} inventory={inventory} />
      )}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"inventory", cnst.Inventory>;
}
export const View = ({ view }: ViewProps) => {
  return <Load.View view={view} renderView={(inventory) => <Inventory.View.General inventory={inventory} />} />;
};

interface TodayProps { // [!code ++:11]
  className?: string;
}
export const Today = ({ className }: TodayProps) => {
  const todaysInventory = st.use.todaysInventory();
  useInterval(() => {
    void st.do.loadTodaysInventory();
  }, 1000);
  if (!todaysInventory) return <Loading.Area />;
  return <Inventory.View.General inventory={todaysInventory} />;
};
```

### apps/koyo/page/_index.tsx

```ts
import { Load, Model } from "akanjs/ui"; // [!code collapse:2]
import { cnst, fetch, IcecreamOrder, usePage } from "@apps/koyo/client";
import { Inventory } from "@apps/koyo/client"; // [!code ++]

export default async function Page() {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = await fetch.initIcecreamOrderInPublic();
  const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
        
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-5xl font-black"> // [!code ++:5]
        <div className="text-5xl font-black">{l("inventory.modelName")}</div>
        <Inventory.Util.Refill className="absolute top-2 right-2" />
      </div>
      <Inventory.Zone.Today />
      <div className="flex items-center gap-4 text-5xl font-black"> // [!code collapse:16]
        <div className="text-5xl font-bold">{l("icecreamOrder.modelName")}</div>
        <Model.New
          className="btn btn-primary"
          slice={fetch.slice.icecreamOrderInPublic}
          renderTitle="name"
          partial={icecreamOrderForm}
        >
          <IcecreamOrder.Template.General />
        </Model.New>
      </div>
      <IcecreamOrder.Zone.Card
        className="space-y-2"
        init={icecreamOrderInitInPublic}
        slice={fetch.slice.icecreamOrderInPublic}
      />
    </div>
  );
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

