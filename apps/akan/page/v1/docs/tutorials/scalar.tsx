import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="use-setting-module" title={l.trans({ en: "Use Setting Module", ko: "설정 모듈 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use Setting Module", ko: "설정 모듈 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now the ice cream shop can receive and process orders, and with many customers coming in, it's easy to run out of stock. Let's find out how to handle this situation.`,
              ko: `이제 요거트 가게는 많은 주문을 받고 처리할 수 있게 되었고, 손님들이 많이 와서 쉽게 품절되는 상황이 발생했습니다. 이제 재고를 관리하고 주문을 처리하는 방법을 알아봅시다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `You need to add a service that checks the remaining ice cream and toppings every morning, sets the inventory status in the system, and automatically disables orders when the inventory is depleted.`,
              ko: `당신은 매일 오전 가게에 남은 요거트와 토핑의 재고를 확인하고, 재고현황을 시스템에 설정한 후, 재고가 소진되면 자동으로 주문을 불가하게 하는 서비스를 추가해야 합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="create-scalar" title={l.trans({ en: "Create Scalar", ko: "스칼라 생성하기" })}>
        <Docs.Title>{l.trans({ en: "Create Scalar", ko: "스칼라 생성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `First, let's create a Scalar to represent individual stock items. Think of a Scalar as a reusable data building block - like Lego pieces that can be combined into larger structures. Unlike a full Model that has its own database collection, a Scalar is embedded within other models. In our case, the Stock scalar will be used inside the Inventory model.`,
              ko: `먼저, 개별 재고 아이템을 표현하는 Scalar를 만들어봅시다. Scalar를 레고 조각처럼 재사용 가능한 데이터 빌딩 블록으로 생각해보세요 - 더 큰 구조물로 조합할 수 있습니다. 자체 데이터베이스 컬렉션을 가진 Model과 달리, Scalar는 다른 모델 안에 내장됩니다. 우리의 경우, Stock 스칼라는 Inventory 모델 안에서 사용될 것입니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Use the CLI to generate the scalar structure:`,
              ko: `CLI를 사용하여 스칼라 구조를 생성합니다:`,
            })}
          </div>
          <Code.Snippet
            language="bash"
            title="Terminal"
            code={`
akan create-scalar stock
# then select koyo application`}
          />
          <div>
            {l.trans({
              en: `Now define the Stock scalar with the item type and quantity tracking:`,
              ko: `이제 아이템 유형과 수량 추적을 포함한 Stock 스칼라를 정의합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/__scalar/stock/stock.constant.ts"
            code={`
import { enumOf, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

import { Topping } from "../../icecreamOrder/icecreamOrder.constant";

export class StockType extends enumOf("stockType", ["yogurtIcecream", ...Topping.values] as const) {}

export class Stock extends via((field) => ({
  type: field(StockType),
  totalQty: field(Int, { default: 0, min: 0 }),
  currentQty: field(Int, { default: 0, min: 0 }),
})) {}
`}
          />
          <div>
            {l.trans({
              en: `Let's understand the Stock scalar structure:`,
              ko: `Stock 스칼라 구조를 이해해봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">📦</span>
              <div>
                <strong>StockType</strong>:{" "}
                {l.trans({
                  en: "An enum combining yogurt ice cream with all available toppings. This allows tracking inventory for all product types in one system.",
                  ko: "요거트 아이스크림과 모든 토핑을 결합한 열거형입니다. 이를 통해 모든 제품 유형의 재고를 하나의 시스템에서 추적할 수 있습니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">📊</span>
              <div>
                <strong>totalQty / currentQty</strong>:{" "}
                {l.trans({
                  en: "Track both the starting amount and current remaining quantity. This helps calculate usage and identify when restocking is needed.",
                  ko: "시작 수량과 현재 남은 수량을 모두 추적합니다. 이를 통해 사용량을 계산하고 재입고가 필요한 시점을 파악할 수 있습니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Add dictionary entries for the scalar. Notice how we reuse the topping translations from the icecreamOrder dictionary:`,
              ko: `스칼라에 대한 dictionary 항목을 추가합니다. icecreamOrder dictionary에서 토핑 번역을 재사용하는 방법에 주목하세요:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/__scalar/stock/stock.dictionary.ts"
            code={`
import { scalarDictionary } from "@akanjs/dictionary";

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
  }));`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="create-inventory" title={l.trans({ en: "Create Inventory", ko: "인벤토리 생성하기" })}>
        <Docs.Title>{l.trans({ en: "Create Inventory", ko: "인벤토리 생성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's create an Inventory module to manage daily stock records. Think of this like the daily inventory sheet that a shop manager fills out each morning - it contains all the stock items and their quantities for that specific day.`,
              ko: `이제 일일 재고 기록을 관리하는 Inventory 모듈을 만들어봅시다. 이것은 가게 매니저가 매일 아침 작성하는 일일 재고 시트처럼 생각해보세요 - 특정 날짜의 모든 재고 아이템과 수량을 포함합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Create the inventory module using the CLI:`,
              ko: `CLI를 사용하여 inventory 모듈을 생성합니다:`,
            })}
          </div>
          <Code.Snippet
            language="bash"
            title="Terminal"
            code={`
akan create-module inventory
# then select koyo application`}
          />
          <div>
            {l.trans({
              en: `Define the Inventory model with embedded Stock scalars:`,
              ko: `내장된 Stock 스칼라들을 포함한 Inventory 모델을 정의합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/inventory.constant.ts"
            code={`
import { via } from "@akanjs/constant";
import { dayjs } from "@akanjs/base"; // [!code ++]

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
`}
          />
          <div>
            {l.trans({
              en: `Key features of the Inventory model:`,
              ko: `Inventory 모델의 주요 특징:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">📋</span>
                <strong className="text-blue-800">{"stocks: field([Stock])"}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `An array of Stock scalars. This is where our reusable Scalar shines - we embed multiple Stock objects directly in the Inventory document.`,
                  ko: `Stock 스칼라들의 배열입니다. 여기서 재사용 가능한 Scalar가 빛을 발합니다 - 여러 Stock 객체를 Inventory 문서에 직접 내장합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">📅</span>
                <strong className="text-green-800">at</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `A date field that defaults to midnight of the current day. This allows creating one inventory record per day and easily finding today's inventory.`,
                  ko: `현재 날짜의 자정으로 기본 설정되는 날짜 필드입니다. 이를 통해 하루에 하나의 재고 기록을 만들고 오늘의 재고를 쉽게 찾을 수 있습니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Add dictionary entries with helpful error messages for inventory operations:`,
              ko: `재고 작업에 대한 유용한 오류 메시지와 함께 dictionary 항목을 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/inventory.dictionary.ts"
            code={`
import { modelDictionary } from "@akanjs/dictionary"; // [!code collapse:5]

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
  });`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="business-logic" title={l.trans({ en: "Business Logic", ko: "비즈니스 로직" })}>
        <Docs.Title>{l.trans({ en: "Business Logic", ko: "비즈니스 로직" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's implement the core business logic for inventory management. Just like a real ice cream shop needs rules for using stock and refilling supplies, we need to encode these operations in our document and service layers.`,
              ko: `이제 재고 관리를 위한 핵심 비즈니스 로직을 구현해봅시다. 실제 아이스크림 가게에서 재고 사용과 보충에 대한 규칙이 필요하듯이, 이러한 작업을 document와 service 레이어에 인코딩해야 합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `First, define the document methods for stock operations and daily inventory generation:`,
              ko: `먼저, 재고 작업과 일일 재고 생성을 위한 document 메서드를 정의합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/inventory.document.ts"
            code={`
import { dayjs } from "@akanjs/base"; // [!code ++]
import { beyond, by, from, into, type SchemaOf } from "@akanjs/document"; // [!code collapse:3]

import * as cnst from "../cnst";
import { Revert } from "../dict"; // [!code ++]

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
    if (!stock) throw new Revert("inventory.error.stockNotFound", { type });
    if (stock.currentQty < quantity) throw new Revert("inventory.error.stockNotEnough", { type, quantity });
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
// [!code collapse:6]
export class InventoryMiddleware extends beyond(InventoryModel, Inventory) {
  onSchema(schema: SchemaOf<InventoryModel, Inventory>) {
    // schema.index({ status: 1 })
  }
}`}
          />
          <div>
            {l.trans({
              en: `Let's understand the key document methods:`,
              ko: `주요 document 메서드들을 이해해봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">📉</span>
                <strong className="text-blue-800">useStock / useStocks</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Decrements stock quantity when orders are placed. Validates that stock exists and has sufficient quantity, throwing Revert errors with dictionary messages if not.`,
                  ko: `주문 시 재고 수량을 감소시킵니다. 재고가 존재하고 충분한 수량이 있는지 검증하며, 그렇지 않으면 dictionary 메시지와 함께 Revert 오류를 발생시킵니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">🔄</span>
                <strong className="text-green-800">refill</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `Restocks all items to their default quantities. Smart enough to only add what's needed - if you have 3 of 10 toppings left, it adds 7 more.`,
                  ko: `모든 아이템을 기본 수량으로 재입고합니다. 필요한 만큼만 추가할 정도로 똑똑합니다 - 토핑 10개 중 3개가 남아있으면 7개를 더 추가합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">📅</span>
                <strong className="text-purple-800">generateTodaysInventory</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: `Automatically creates a new inventory record for today if one doesn't exist. Returns existing inventory if already created - ensuring one record per day.`,
                  ko: `오늘의 재고 기록이 없으면 자동으로 새로 생성합니다. 이미 생성되어 있으면 기존 재고를 반환합니다 - 하루에 하나의 기록만 보장합니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Now create the service layer to expose these operations:`,
              ko: `이제 이러한 작업을 노출하는 서비스 레이어를 만듭니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/inventory.service.ts"
            code={`
import { serve } from "@akanjs/service"; // [!code collapse:5]

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
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="connect-service" title={l.trans({ en: "Connect Service", ko: "서비스 연결하기" })}>
        <Docs.Title>{l.trans({ en: "Connect Service", ko: "서비스 연결하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now comes the magic - connecting the inventory system to our existing ice cream order flow. When a customer places an order, the system should automatically deduct the used ingredients from inventory. This is like how a real POS system updates stock counts in real-time as sales are made.`,
              ko: `이제 마법이 시작됩니다 - 재고 시스템을 기존 아이스크림 주문 흐름에 연결합니다. 고객이 주문을 하면 시스템이 자동으로 사용된 재료를 재고에서 차감해야 합니다. 이는 실제 POS 시스템이 판매가 이루어질 때 실시간으로 재고 수량을 업데이트하는 것과 같습니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Inject the InventoryService into IcecreamOrderService and use the _preCreate hook to deduct stock:`,
              ko: `InventoryService를 IcecreamOrderService에 주입하고 _preCreate 훅을 사용하여 재고를 차감합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts"
            code={`
import { dayjs } from "@akanjs/base"; // [!code collapse:5]
import { serve } from "@akanjs/service";
import { AlarmApi } from "@koyo/nest";

import * as db from "../db";
import type * as srv from "../srv"; // [!code ++]

export class IcecreamOrderService extends serve(db.icecreamOrder, ({ use, service }) => ({
  alarmApi: use<AlarmApi>(),
  inventoryService: service<srv.InventoryService>(), // [!code ++]
})) {
  async _preCreate(data: db.IcecreamOrderInput) { // [!code ++:7]
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
      this.alarmApi.warn(\`IcecreamOrder \${icecreamOrder.id} is melting 😱\`);
    }
  }
}`}
          />
          <div>
            {l.trans({
              en: `Key aspects of this integration:`,
              ko: `이 통합의 핵심 측면:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">🔌</span>
              <div>
                <strong>{"service<srv.InventoryService>()"}</strong>:{" "}
                {l.trans({
                  en: "Dependency injection allows IcecreamOrderService to access InventoryService methods",
                  ko: "의존성 주입을 통해 IcecreamOrderService가 InventoryService 메서드에 접근할 수 있습니다",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">⚡</span>
              <div>
                <strong>_preCreate</strong>:{" "}
                {l.trans({
                  en: "A lifecycle hook that runs before creating a new order. Perfect for validation and side effects like inventory deduction.",
                  ko: "새 주문을 생성하기 전에 실행되는 라이프사이클 훅입니다. 검증과 재고 차감 같은 부수 효과에 완벽합니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600">🍦</span>
              <div>
                <strong>{l.trans({ en: "Usage Calculation", ko: "사용량 계산" })}</strong>:{" "}
                {l.trans({
                  en: "The order size determines yogurt usage, and each topping uses 1 unit from inventory.",
                  ko: "주문 사이즈가 요거트 사용량을 결정하고, 각 토핑은 재고에서 1단위를 사용합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="connect-signal" title={l.trans({ en: "Connect Signal", ko: "신호 연결하기" })}>
        <Docs.Title>{l.trans({ en: "Connect Signal", ko: "신호 연결하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `To allow the frontend to interact with inventory, we need API endpoints. Staff should be able to view today's inventory and refill stock when running low. Let's create the signal endpoints and frontend store.`,
              ko: `프론트엔드가 재고와 상호작용할 수 있도록 API 엔드포인트가 필요합니다. 직원은 오늘의 재고를 보고 재고가 부족할 때 보충할 수 있어야 합니다. 시그널 엔드포인트와 프론트엔드 스토어를 만들어봅시다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Create the inventory endpoints:`,
              ko: `inventory 엔드포인트를 생성합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/inventory.signal.ts"
            code={`
import { Public } from "@akanjs/nest"; // [!code collapse:18]
import { endpoint, internal, slice } from "@akanjs/signal";

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
})) {}`}
          />
          <div>
            {l.trans({
              en: `Add dictionary entries for the endpoints:`,
              ko: `엔드포인트에 대한 dictionary 항목을 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/inventory.dictionary.ts"
            code={`
import { modelDictionary } from "@akanjs/dictionary"; // [!code collapse:5]

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
  });`}
          />
          <div>
            {l.trans({
              en: `Now create the frontend store to manage inventory state:`,
              ko: `이제 재고 상태를 관리하는 프론트엔드 스토어를 만듭니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/inventory.store.ts"
            code={`
import { store } from "@akanjs/store"; // [!code collapse:5]

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
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="interact-on-ui" title={l.trans({ en: "Interact on UI", ko: "UI와 상호작용하기" })}>
        <Docs.Title>{l.trans({ en: "Interact on UI", ko: "UI와 상호작용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's bring everything together in the UI. The customer-facing order form needs to check inventory and disable options that are out of stock. Staff also need a dashboard to monitor inventory levels and refill when needed. This creates a complete inventory management system!`,
              ko: `이제 모든 것을 UI에서 하나로 모아봅시다. 고객용 주문 양식은 재고를 확인하고 품절된 옵션을 비활성화해야 합니다. 직원도 재고 수준을 모니터링하고 필요할 때 보충할 수 있는 대시보드가 필요합니다. 이것으로 완전한 재고 관리 시스템이 만들어집니다!`,
            })}
          </div>
          <div>
            {l.trans({
              en: `First, update the order template to check inventory before displaying options:`,
              ko: `먼저, 옵션을 표시하기 전에 재고를 확인하도록 주문 템플릿을 업데이트합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx"
            code={`
"use client"; // [!code collapse:4]
import { clsx } from "@akanjs/client";
import { Field, Layout } from "@akanjs/ui";
import { cnst, st, usePage } from "@koyo/client";
import { Loading } from "@akanjs/ui"; // [!code ++:2]
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
        <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🍦</span>
              <h2 className="text-2xl font-semibold text-gray-800">{l("icecreamOrder.serveType")}</h2>
            </div>
            <Field.ToggleSelect
              items={cnst.ServeType}
              value={icecreamOrderForm.serveType}
              onChange={st.do.setServeTypeOnIcecreamOrder}
            />
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3"> // [!code collapse:4]
            <span className="text-3xl">📏</span>
            <h2 className="text-2xl font-semibold text-gray-800">{l("icecreamOrder.size")}</h2>
          </div>
          <Field.ToggleSelect
            items={[50, 100, 200].map((size) => ({
              label: \`\${size}cc\`,
              value: size,
              disabled: !todaysInventory.isInStock("yogurtIcecream", size), // [!code highlight]
            }))}
            value={icecreamOrderForm.size}
            onChange={st.do.setSizeOnIcecreamOrder}
          />
        </div>
      </div>
      <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm">
        <div className="space-y-6">
          <div className="flex items-center gap-3"> // [!code collapse:4]
            <span className="text-3xl">🍓</span>
            <h2 className="text-2xl font-semibold text-gray-800">{l("icecreamOrder.toppings")}</h2>
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
      <div className="rounded-2xl bg-white/70 p-8 shadow-xl backdrop-blur-sm"> // [!code collapse:13]
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📱</span>
            <h2 className="text-2xl font-semibold text-gray-800">{l("icecreamOrder.phone")}</h2>
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
};`}
          />
          <div>
            {l.trans({
              en: `Key features of the inventory-aware template:`,
              ko: `재고 인식 템플릿의 주요 기능:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🔄</span>
                <strong className="text-blue-800">loadTodaysInventory</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Called in useEffect to load inventory data when the component mounts. Shows a loading spinner until data is ready.`,
                  ko: `컴포넌트가 마운트될 때 재고 데이터를 로드하기 위해 useEffect에서 호출됩니다. 데이터가 준비될 때까지 로딩 스피너를 보여줍니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-red-600">🚫</span>
                <strong className="text-red-800">{l.trans({ en: "Out of Stock Check", ko: "품절 확인" })}</strong>
              </div>
              <div className="text-red-700 text-sm">
                {l.trans({
                  en: `If yogurt ice cream is completely out of stock, shows a friendly message instead of the form. No point ordering if we can't make it!`,
                  ko: `요거트 아이스크림이 완전히 품절이면 양식 대신 친절한 메시지를 보여줍니다. 만들 수 없다면 주문을 받을 필요가 없습니다!`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">⚠️</span>
                <strong className="text-yellow-800">{"disabled: !isInStock"}</strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: `Each size and topping option checks if sufficient stock exists. Disabled options are grayed out but still visible, so customers know what's normally available.`,
                  ko: `각 사이즈와 토핑 옵션이 충분한 재고가 있는지 확인합니다. 비활성화된 옵션은 회색으로 표시되지만 여전히 보이므로, 고객이 평소에 무엇이 가능한지 알 수 있습니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Add the isInStock helper method to the Inventory constant:`,
              ko: `Inventory 상수에 isInStock 헬퍼 메서드를 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/inventory.constant.ts"
            code={`
import { dayjs } from "@akanjs/base"; // [!code collapse:4]
import { via } from "@akanjs/constant";

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
export class InventoryInsight extends via(Inventory, (field) => ({})) {}`}
          />
          <div>
            {l.trans({
              en: `Now let's create utility components for staff to refill inventory:`,
              ko: `이제 직원이 재고를 보충할 수 있는 유틸리티 컴포넌트를 만들어봅시다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/Inventory.Util.tsx"
            code={`
"use client";
import { clsx } from "@akanjs/client";
import { st, usePage } from "@koyo/client";
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
};`}
          />
          <div>
            {l.trans({
              en: `Create a visual dashboard showing stock levels with color-coded status indicators:`,
              ko: `색상으로 구분된 상태 표시기와 함께 재고 수준을 보여주는 시각적 대시보드를 만듭니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/Inventory.View.tsx"
            code={`
import { dayjs } from "@akanjs/base";
import { clsx } from "@akanjs/client";
import { cnst, usePage } from "@koyo/client";

interface GeneralProps {
  className?: string;
  inventory: cnst.Inventory;
}

export const General = ({ className, inventory }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("w-full space-y-2 rounded-xl bg-purple-50 p-4", className)}>
      <div className="text-lg font-bold text-purple-900">{dayjs(inventory.at).format("YYYY-MM-DD")}</div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {inventory.stocks.map((stock, index) => {
          const status = stock.getStatus();
          const percentage = stock.getPercentage();
          return (
            <div
              key={\`\${stock.type}-\${index}\`}
              className={clsx("space-y-3 rounded-xl px-6 py-4 shadow-md", {
                "bg-red-50": status === "empty",
                "bg-yellow-50": status === "low",
                "bg-green-50": status === "normal",
              })}
            >
              <div className="flex items-center justify-between">
                <div
                  className={clsx("rounded px-2 py-1 text-xs font-bold", {
                    "bg-red-200 text-red-800": status === "empty",
                    "bg-yellow-200 text-yellow-800": status === "low",
                    "bg-green-200 text-green-800": status === "normal",
                  })}
                >
                  {l(\`stockType.\${stock.type}\`)}
                </div>
                <div
                  className={clsx("text-2xl font-bold", {
                    "text-red-700": status === "empty",
                    "text-yellow-700": status === "low",
                    "text-green-700": status === "normal",
                  })}
                >
                  {stock.currentQty} / {stock.totalQty}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/50">
                  <div
                    className={clsx("h-full", {
                      "bg-red-500": status === "empty",
                      "bg-yellow-500": status === "low",
                      "bg-green-500": status === "normal",
                    })}
                    style={{ width: \`\${Math.min(percentage, 100)}%\` }}
                  />
                </div>
                <div
                  className={clsx("text-right text-xs font-bold", {
                    "text-red-700": status === "empty",
                    "text-yellow-700": status === "low",
                    "text-green-700": status === "normal",
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
};`}
          />
          <div>
            {l.trans({
              en: `Add helper methods to the Stock scalar for status calculation:`,
              ko: `상태 계산을 위한 헬퍼 메서드를 Stock 스칼라에 추가합니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/__scalar/stock/stock.constant.ts"
            code={`
import { enumOf, Int } from "@akanjs/base"; // [!code collapse:7]
import { via } from "@akanjs/constant";

import { Topping } from "../../icecreamOrder/icecreamOrder.constant";

export class StockType extends enumOf("stockType", ["yogurtIcecream", ...Topping.values] as const) {}

export class Stock extends via((field) => ({
  type: field(StockType), // [!code collapse:3]
  totalQty: field(Int, { default: 0, min: 0 }),
  currentQty: field(Int, { default: 0, min: 0 }),
})) {
  getPercentage() { // [!code ++:9]
    return (this.currentQty / this.totalQty) * 100;
  }
  getStatus() {
    const percentage = this.getPercentage();
    if (percentage === 0) return "empty";
    if (percentage < 30) return "low";
    return "normal";
  }
}`}
          />
          <div>
            {l.trans({
              en: `Create a Zone component for real-time inventory monitoring:`,
              ko: `실시간 재고 모니터링을 위한 Zone 컴포넌트를 만듭니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/inventory/Inventory.Zone.tsx"
            code={`
"use client"; // [!code collapse:4]
import { ClientInit, ClientView } from "@akanjs/signal";
import { Load } from "@akanjs/ui";
import { cnst, Inventory } from "@koyo/client";
import { useInterval } from "@akanjs/next"; // [!code ++:3]
import { Loading } from "@akanjs/ui";
import { st } from "@koyo/client";
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
};`}
          />
          <div>
            {l.trans({
              en: `Finally, put it all together in the main page with both inventory dashboard and order management:`,
              ko: `마지막으로, 재고 대시보드와 주문 관리를 모두 포함한 메인 페이지에서 모든 것을 하나로 모읍니다:`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/app/[lang]/page.tsx"
            code={`
import { Load, Model } from "@akanjs/ui"; // [!code collapse:2]
import { cnst, fetch, IcecreamOrder, usePage } from "@koyo/client";
import { Inventory } from "@koyo/client"; // [!code ++]

export default function Page() {
  const { l } = usePage();
  return (
    <Load.Page
      of={Page} // [!code collapse:6]
      loader={async () => {
        const { icecreamOrderInitInPublic } = await fetch.initIcecreamOrderInPublic();
        const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
        return { icecreamOrderInitInPublic, icecreamOrderForm };
      }}
      render={({ icecreamOrderInitInPublic, icecreamOrderForm }) => {
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
                sliceName="icecreamOrderInPublic"
                renderTitle="name"
                partial={icecreamOrderForm}
              >
                <IcecreamOrder.Template.General />
              </Model.New>
            </div>
            <IcecreamOrder.Zone.Card
              className="space-y-2"
              init={icecreamOrderInitInPublic}
              sliceName="icecreamOrderInPublic"
            />
          </div>
        );
      }}
    />
  );
}`}
          />
          <div className="my-6 rounded-lg bg-gradient-to-r from-purple-100 to-green-100 p-6">
            <div className="mb-3 font-bold text-lg text-purple-800">
              {l.trans({ en: "🎉 What You've Accomplished:", ko: "🎉 달성한 것들:" })}
            </div>
            <ul className="space-y-2 text-purple-700 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "Created a reusable Stock scalar for inventory items",
                  ko: "재고 아이템을 위한 재사용 가능한 Stock 스칼라 생성",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Built an Inventory module with daily records",
                  ko: "일일 기록이 있는 Inventory 모듈 구축",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Implemented stock usage and refill business logic",
                  ko: "재고 사용 및 보충 비즈니스 로직 구현",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Connected inventory to order creation flow",
                  ko: "재고를 주문 생성 흐름에 연결",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Created visual dashboard with real-time updates",
                  ko: "실시간 업데이트가 있는 시각적 대시보드 생성",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Disabled out-of-stock options in customer UI",
                  ko: "고객 UI에서 품절 옵션 비활성화",
                })}
              </li>
            </ul>
          </div>
          <div>
            {l.trans({
              en: `In the next tutorial, we'll explore Insight - a powerful feature for aggregating and analyzing data across your models. This will allow you to create analytics dashboards and gain business intelligence from your ice cream shop data.`,
              ko: `다음 튜토리얼에서는 모델 전체에서 데이터를 집계하고 분석하는 강력한 기능인 Insight를 살펴볼 것입니다. 이를 통해 분석 대시보드를 만들고 아이스크림 가게 데이터에서 비즈니스 인사이트를 얻을 수 있게 됩니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
