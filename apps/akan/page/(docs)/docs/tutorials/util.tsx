import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="modifying-status" title={l.trans({ en: "Modifying Status", ko: "상태 변경하기" })}>
        <Docs.Title>{l.trans({ en: "Modifying Status", ko: "상태 변경하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now that customers can create and view ice cream orders, let's add functionality for shop staff to manage the order lifecycle. In a real ice cream shop, orders need to progress through different stages: from "active" (newly placed) to "processing" (being prepared) to "served" (completed) or "canceled" if needed.`,
              ko: `고객들이 아이스크림 주문을 생성하고 볼 수 있게 되었으니, 이제 가게 직원이 주문 생명주기를 관리할 수 있는 기능을 추가해봅시다. 실제 아이스크림 가게에서는 주문이 다양한 단계를 거쳐야 합니다: "활성"(새로 접수됨)에서 "처리중"(준비 중)으로, "서빙완료"(완료됨)로, 필요시 "취소됨"으로 말입니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Think of status modification like the workflow in a real ice cream shop. When a customer places an order, it starts as "active" - like a ticket on the order board. Then staff begins preparation ("processing"), and finally serves it to the customer ("served"). This tutorial shows you how to implement this natural workflow with proper validation and user-friendly controls.`,
              ko: `상태 수정을 실제 아이스크림 가게의 워크플로우처럼 생각해보세요. 고객이 주문을 하면 "활성" 상태로 시작됩니다 - 주문판에 붙은 티켓처럼요. 그 다음 직원이 준비를 시작하고("처리중"), 마지막으로 고객에게 서빙합니다("서빙완료"). 이 튜토리얼에서는 적절한 검증과 사용자 친화적인 제어를 통해 이러한 자연스러운 워크플로우를 구현하는 방법을 보여드립니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Before implementing the functionality, let's understand the business logic behind ice cream order status transitions:`,
              ko: `기능을 구현하기 전에, 아이스크림 주문 상태 전환의 비즈니스 로직을 이해해봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">Active</strong> → Processing
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `When a customer places an order, it starts as "active". Staff can begin processing it by clicking "Process".`,
                  ko: `고객이 주문을 하면 "활성" 상태로 시작됩니다. 직원이 "작업시작"을 클릭하여 처리를 시작할 수 있습니다.`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">Processing</strong> → Served
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `While an order is being prepared, it's in "processing" status. Once ready, staff can mark it as "served".`,
                  ko: `주문이 준비되는 동안은 "처리중" 상태입니다. 준비가 완료되면 직원이 "서빙완료"로 표시할 수 있습니다.`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">Served</strong> → Finished
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `Once the customer has picked up the order, staff closes it as "finished".`,
                  ko: `고객이 주문을 받아 가면 직원이 "완료"로 마무리합니다.`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">Active</strong> → Canceled
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `Only active orders can be canceled. Once processing begins, cancellation is no longer allowed.`,
                  ko: `활성 상태의 주문만 취소할 수 있습니다. 처리가 시작되면 더 이상 취소할 수 없습니다.`,
                })}
              </div>
            </div>
          </div>
          <div className={panelRecipe({ radius: "lg" })}>
            <div className="mb-2">
              <strong className="text-primary">{l.trans({ en: "Business Rules", ko: "비즈니스 규칙" })}</strong>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-foreground/70 text-sm">
              <li>
                {l.trans({
                  en: "Only active orders can be processed or canceled",
                  ko: "활성 상태의 주문만 처리하거나 취소할 수 있습니다",
                })}
              </li>
              <li>
                {l.trans({ en: "Only processing orders can be served", ko: "처리중인 주문만 서빙할 수 있습니다" })}
              </li>
              <li>
                {l.trans({ en: "Only served orders can be finished", ko: "서빙완료된 주문만 완료할 수 있습니다" })}
              </li>
              <li>
                {l.trans({
                  en: "Finished and canceled orders are final states",
                  ko: "완료와 취소됨은 최종 상태입니다",
                })}
              </li>
            </ul>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide
        id="document-logic"
        title={l.trans({ en: "Implement Document Business Logic", ko: "도큐먼트 비즈니스 로직 구현하기" })}
      >
        <Docs.Title>
          {l.trans({ en: "Implement Document Business Logic", ko: "도큐먼트 비즈니스 로직 구현하기" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Just like a real ice cream shop has rules about when orders can be processed or canceled, we need to implement these business rules in our code. The document layer is where we define these rules - think of it as the "shop policies" that ensure orders are handled correctly no matter who is working or how busy it gets.`,
              ko: `실제 아이스크림 가게에 주문을 언제 처리하거나 취소할 수 있는지에 대한 규칙이 있는 것처럼, 우리도 코드에서 이러한 비즈니스 규칙을 구현해야 합니다. 도큐먼트 레이어는 이러한 규칙을 정의하는 곳입니다 - 누가 일하고 있든, 얼마나 바쁘든 관계없이 주문이 올바르게 처리되도록 보장하는 "가게 정책"이라고 생각하면 됩니다.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.document.ts"
            code={`
import { by, from, into } from "akanjs/document"; // [!code collapse:3]

import * as cnst from "../cnst";
import { Err } from "../dict"; // [!code ++]
// [!code collapse:6]
export class IcecreamOrderFilter extends from(cnst.IcecreamOrder, (filter) => ({
  query: {},
  sort: {},
})) {}

export class IcecreamOrder extends by(cnst.IcecreamOrder) {
  process() { // [!code ++:20]
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
// [!code collapse:2]
export class IcecreamOrderModel extends into(IcecreamOrder, IcecreamOrderFilter, cnst.icecreamOrder, () => ({})) {}`}
          />
          <div>
            {l.trans({
              en: `These methods implement our business rules directly in the data model:`,
              ko: `이러한 메서드들은 비즈니스 규칙을 데이터 모델에 직접 구현합니다:`,
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              <strong>process()</strong>:{" "}
              {l.trans({
                en: "Checks if status is 'active' before changing to 'processing'",
                ko: "'처리중'으로 변경하기 전에 상태가 '활성'인지 확인합니다",
              })}
            </li>
            <li>
              <strong>serve()</strong>:{" "}
              {l.trans({
                en: "Validates that status is 'processing' before marking as 'served'",
                ko: "'서빙완료'로 표시하기 전에 상태가 '처리중'인지 검증합니다",
              })}
            </li>
            <li>
              <strong>cancel()</strong>:{" "}
              {l.trans({
                en: "Ensures only 'active' orders can be canceled",
                ko: "'활성' 상태의 주문만 취소될 수 있도록 보장합니다",
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: `When validation fails, we throw an Err with a dictionary key for user-friendly error messages. Let's add these error messages to our dictionary:`,
              ko: `검증이 실패하면 사용자 친화적인 오류 메시지를 위해 dictionary 키와 함께 Err를 던집니다. 이러한 오류 메시지를 dictionary에 추가해봅시다:`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
            code={`
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:5]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:37]
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "IcecreamOrder is an option that customers can choose when ordering icecream at koyo store.",
      "아이스크림 주문은 koyo 가게에서 고객이 아이스크림을 주문할 때 커스텀할 수 있는 옵션들을 선택할 수 있습니다.",
    ]),
  )
  .model<IcecreamOrder>((t) => ({
    size: t(["Size", "사이즈"]).desc(["Size of the icecream order", "아이스크림 주문의 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings of the icecream order", "아이스크림 주문의 토핑"]),
    status: t(["Status", "상태"]).desc(["Status of the icecream order", "아이스크림 주문의 상태"]),
  }))
  .enum<IcecreamOrderStatus>("icecreamOrderStatus", (t) => ({
    active: t(["Active", "활성"]).desc(["Active status of the icecream order", "아이스크림 주문의 활성 상태"]),
    processing: t(["Processing", "처리중"]).desc([
      "Processing status of the icecream order",
      "아이스크림 주문의 처리중 상태",
    ]),
    served: t(["Served", "서빙완료"]).desc(["Served status of the icecream order", "아이스크림 주문의 서빙완료 상태"]),
    finished: t(["Finished", "완료"]).desc(["Finished status of the icecream order", "아이스크림 주문의 완료 상태"]),
    canceled: t(["Canceled", "취소"]).desc(["Canceled status of the icecream order", "아이스크림 주문의 취소 상태"]),
  }))
  .enum<Topping>("topping", (t) => ({
    fruitRings: t(["Fruit Rings", "과일 링"]).desc(["Fruit Rings topping", "과일 링 토핑"]),
    oreo: t(["Oreo", "오레오"]).desc(["Oreo topping", "오레오 토핑"]),
    strawberry: t(["Strawberry", "딸기"]).desc(["Strawberry topping", "딸기 토핑"]),
    mango: t(["Mango", "망고"]).desc(["Mango topping", "망고 토핑"]),
    cheeseCube: t(["Cheese Cube", "치즈 큐브"]).desc(["Cheese Cube topping", "치즈 큐브 토핑"]),
    corn: t(["Corn", "옥수수"]).desc(["Corn topping", "옥수수 토핑"]),
    granola: t(["Granola", "그래놀라"]).desc(["Granola topping", "그래놀라 토핑"]),
    banana: t(["Banana", "바나나"]).desc(["Banana topping", "바나나 토핑"]),
    fig: t(["Fig", "피그"]).desc(["Fig topping", "피그 토핑"]),
  }))
  .insight<IcecreamOrderInsight>((t) => ({}))
  .slice<IcecreamOrderSlice>((fn) => ({
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({})),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({}))
  .error({
    onlyActiveCanBeProcessed: ["Only active orders can be processed", "활성 상태의 주문만 처리할 수 있습니다"], // [!code ++:4]
    onlyProcessingCanBeServed: ["Only processing orders can be served", "처리중인 주문만 서빙할 수 있습니다"],
    onlyServedCanBeFinished: ["Only served orders can be finished", "서빙완료된 주문만 완료할 수 있습니다"],
    onlyActiveCanBeCanceled: ["Only active orders can be canceled", "활성 상태의 주문만 취소할 수 있습니다"],
  })
  .translate({}); // [!code collapse:1]
`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide
        id="manage-service"
        title={l.trans({ en: "Implement Service Layer", ko: "서비스 레이어 구현하기" })}
      >
        <Docs.Title>{l.trans({ en: "Implement Service Layer", ko: "서비스 레이어 구현하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now we need service methods that act like the shop manager - coordinating between the business rules (document layer) and the actual data storage (database). When a staff member wants to process an order, the service layer fetches the order, applies the business rules, and saves the changes safely.`,
              ko: `이제 가게 매니저처럼 역할하는 서비스 메서드가 필요합니다 - 비즈니스 규칙(도큐먼트 레이어)과 실제 데이터 저장(데이터베이스) 사이를 조율하는 것이죠. 직원이 주문을 처리하려고 할 때, 서비스 레이어는 주문을 가져오고, 비즈니스 규칙을 적용하고, 변경사항을 안전하게 저장합니다.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts"
            code={`
import { serve } from "akanjs/service"; // [!code collapse:4]

import * as db from "../db";

export class IcecreamOrderService extends serve(db.icecreamOrder, ({ use, service }) => ({})) {
  async processIcecreamOrder(icecreamOrderId: string) { // [!code ++:16]
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
}`}
          />
          <div>
            {l.trans({
              en: `Each service method follows the same pattern:`,
              ko: `각 서비스 메서드는 동일한 패턴을 따릅니다:`,
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              <strong>{l.trans({ en: "Fetch", ko: "가져오기" })}</strong>:{" "}
              {l.trans({
                en: "Retrieve the order from database using getIcecreamOrder()",
                ko: "getIcecreamOrder()를 사용하여 데이터베이스에서 주문을 가져옵니다",
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Execute", ko: "실행" })}</strong>:{" "}
              {l.trans({
                en: "Call the business logic method (process(), serve(), or cancel())",
                ko: "비즈니스 로직 메서드를 호출합니다 (process(), serve(), 또는 cancel())",
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Save", ko: "저장" })}</strong>:{" "}
              {l.trans({
                en: "Persist the changes to database with save()",
                ko: "save()로 변경사항을 데이터베이스에 저장합니다",
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: `This pattern ensures that business rules are enforced at the document level while the service handles database transactions safely.`,
              ko: `이 패턴은 서비스가 데이터베이스 트랜잭션을 안전하게 처리하는 동안 비즈니스 규칙이 도큐먼트 레벨에서 강제되도록 보장합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide
        id="signal-endpoints"
        title={l.trans({ en: "Create Signal Endpoints", ko: "시그널 엔드포인트 생성하기" })}
      >
        <Docs.Title>{l.trans({ en: "Create Signal Endpoints", ko: "시그널 엔드포인트 생성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Think of signal endpoints as the communication system between the frontend (like the shop's order display screen) and the backend (the kitchen and management system). When staff clicks a "Process" button on the screen, it needs to communicate with the backend to actually update the order. Akan.js serves every endpoint over HTTP and over the websocket, and publishes it to AI agents over MCP when its guards allow, so every caller reaches the same kitchen through the same hatch.`,
              ko: `시그널 엔드포인트를 프론트엔드(가게의 주문 표시 화면 같은)와 백엔드(주방과 관리 시스템) 사이의 의사소통 시스템이라고 생각해보세요. 직원이 화면의 "작업시작" 버튼을 클릭하면, 실제로 주문을 업데이트하기 위해 백엔드와 통신해야 합니다. Akan.js는 모든 엔드포인트를 HTTP와 websocket으로 함께 제공하고, guard가 허용하면 MCP를 통해 AI 에이전트에게도 공개하므로, 모든 호출자가 같은 창구로 같은 주방에 도달합니다.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
            code={`
import { ID } from "akanjs/base"; // [!code ++]
import { endpoint, internal, None, Public, slice } from "akanjs/signal"; // [!code collapse:7]

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, ({ interval }) => ({})) {}

export class IcecreamOrderSlice extends slice(
  srv.icecreamOrder,
  { guards: { root: None, get: Public, cru: None, create: Public } },
  (init) => ({
    inPublic: init({ guards: [Public] }).exec(function () {
      return this.icecreamOrderService.queryAny();
    }),
  }),
) {}

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ query, mutation }) => ({
  processIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Public] }) // [!code ++:20]
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.processIcecreamOrder(icecreamOrderId);
    }),
  serveIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Public] })
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.serveIcecreamOrder(icecreamOrderId);
    }),
  finishIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Public] })
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.finishIcecreamOrder(icecreamOrderId);
    }),
  cancelIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Public] })
    .param("icecreamOrderId", ID)
    .exec(function (icecreamOrderId) {
      return this.icecreamOrderService.cancelIcecreamOrder(icecreamOrderId);
    }),
})) {}`}
          />
          <div>
            {l.trans({
              en: `Each signal endpoint is defined using the mutation() builder, specifying the return type and accepting the order ID as a parameter via .param(). The .exec() callback delegates to the corresponding service method to perform the actual business logic.`,
              ko: `각 시그널 엔드포인트는 mutation() 빌더를 사용하여 정의되며, .param()을 통해 주문 ID를 매개변수로 받습니다. .exec() 콜백은 해당 서비스 메서드에 위임하여 실제 비즈니스 로직을 수행합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `The second argument to slice() is the guard map, not boilerplate: root is the generated admin query API and stays closed (None here, Admin once your workspace has libs/shared), get covers reads, and cru covers create, update and remove — create is opened on its own because the kiosk takes anonymous orders. Leaving root: Public hands that admin query API to every anonymous caller, and to every AI agent through /mcp.`,
              ko: `slice()의 두 번째 인자는 guard map이며 형식적인 boilerplate가 아닙니다. root는 생성된 admin query API라서 닫아 둡니다(여기서는 None, 워크스페이스에 libs/shared가 있다면 Admin). get은 읽기, cru는 create/update/remove를 담당하며, 키오스크가 익명 주문을 받으므로 create만 따로 열었습니다. root: Public으로 두면 그 admin query API가 모든 익명 호출자에게, 그리고 /mcp를 통해 모든 AI 에이전트에게 그대로 열립니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Every custom endpoint names its own guards too. This shop has no sign-in yet, so the staff actions use guards: [Public] and anyone can call them. Once you add sign-in, replace Public with a staff guard such as Admin.`,
              ko: `직접 만든 엔드포인트도 각자 guards를 지정합니다. 아직 이 가게에는 로그인이 없으므로 직원용 동작은 guards: [Public]으로 두었고, 누구나 호출할 수 있습니다. 로그인을 추가하면 Public을 Admin 같은 직원용 guard로 바꾸세요.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `We also need to add dictionary entries for these API endpoints so they display properly in the UI:`,
              ko: `이러한 API 엔드포인트가 UI에서 제대로 표시되도록 dictionary 항목도 추가해야 합니다:`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
            code={`
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:5]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => // [!code collapse:36]
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "IcecreamOrder is an option that customers can choose when ordering icecream at koyo store.",
      "아이스크림 주문은 koyo 가게에서 고객이 아이스크림을 주문할 때 커스텀할 수 있는 옵션들을 선택할 수 있습니다.",
    ]),
  )
  .model<IcecreamOrder>((t) => ({
    size: t(["Size", "사이즈"]).desc(["Size of the icecream order", "아이스크림 주문의 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings of the icecream order", "아이스크림 주문의 토핑"]),
    status: t(["Status", "상태"]).desc(["Status of the icecream order", "아이스크림 주문의 상태"]),
  }))
  .enum<IcecreamOrderStatus>("icecreamOrderStatus", (t) => ({
    active: t(["Active", "활성"]).desc(["Active status of the icecream order", "아이스크림 주문의 활성 상태"]),
    processing: t(["Processing", "처리중"]).desc([
      "Processing status of the icecream order",
      "아이스크림 주문의 처리중 상태",
    ]),
    served: t(["Served", "서빙완료"]).desc(["Served status of the icecream order", "아이스크림 주문의 서빙완료 상태"]),
    finished: t(["Finished", "완료"]).desc(["Finished status of the icecream order", "아이스크림 주문의 완료 상태"]),
    canceled: t(["Canceled", "취소"]).desc(["Canceled status of the icecream order", "아이스크림 주문의 취소 상태"]),
  }))
  .enum<Topping>("topping", (t) => ({
    fruitRings: t(["Fruit Rings", "과일 링"]).desc(["Fruit Rings topping", "과일 링 토핑"]),
    oreo: t(["Oreo", "오레오"]).desc(["Oreo topping", "오레오 토핑"]),
    strawberry: t(["Strawberry", "딸기"]).desc(["Strawberry topping", "딸기 토핑"]),
    mango: t(["Mango", "망고"]).desc(["Mango topping", "망고 토핑"]),
    cheeseCube: t(["Cheese Cube", "치즈 큐브"]).desc(["Cheese Cube topping", "치즈 큐브 토핑"]),
    corn: t(["Corn", "옥수수"]).desc(["Corn topping", "옥수수 토핑"]),
    granola: t(["Granola", "그래놀라"]).desc(["Granola topping", "그래놀라 토핑"]),
    banana: t(["Banana", "바나나"]).desc(["Banana topping", "바나나 토핑"]),
    fig: t(["Fig", "피그"]).desc(["Fig topping", "피그 토핑"]),
  }))
  .insight<IcecreamOrderInsight>((t) => ({}))
  .slice<IcecreamOrderSlice>((fn) => ({
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({})),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({
    processIcecreamOrder: fn(["Process", "작업시작"]) // [!code ++:20]
      .desc(["Start processing an ice cream order", "아이스크림 주문 처리를 시작합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to process", "처리할 주문의 ID"]),
      })),
    serveIcecreamOrder: fn(["Serve", "서빙완료"])
      .desc(["Mark an ice cream order as served", "아이스크림 주문을 서빙완료로 표시합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to serve", "서빙할 주문의 ID"]),
      })),
    finishIcecreamOrder: fn(["Finish", "완료"])
      .desc(["Mark an ice cream order as finished", "아이스크림 주문을 완료로 표시합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to finish", "완료할 주문의 ID"]),
      })),
    cancelIcecreamOrder: fn(["Cancel", "주문취소"])
      .desc(["Cancel an ice cream order", "아이스크림 주문을 취소합니다"])
      .arg((t) => ({
        icecreamOrderId: t(["Order ID", "주문 ID"]).desc(["ID of the order to cancel", "취소할 주문의 ID"]),
      })),
  }))
  .error({ // [!code collapse:7]
    onlyActiveCanBeProcessed: ["Only active orders can be processed", "활성 상태의 주문만 처리할 수 있습니다"],
    onlyProcessingCanBeServed: ["Only processing orders can be served", "처리중인 주문만 서빙할 수 있습니다"],
    onlyServedCanBeFinished: ["Only served orders can be finished", "서빙완료된 주문만 완료할 수 있습니다"],
    onlyActiveCanBeCanceled: ["Only active orders can be canceled", "활성 상태의 주문만 취소할 수 있습니다"],
  })
  .translate({});`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide
        id="store-actions"
        title={l.trans({ en: "Create Frontend Store Actions", ko: "프론트엔드 스토어 액션 생성하기" })}
      >
        <Docs.Title>
          {l.trans({ en: "Create Frontend Store Actions", ko: "프론트엔드 스토어 액션 생성하기" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The store layer is like the control panel that staff actually interact with. It takes the complex API communications and turns them into simple actions like "processOrder()" that components can easily use. When a button is clicked, the store handles calling the API and updating the display automatically - just like how pressing a button on a shop's POS system updates both the backend and the screen.`,
              ko: `스토어 레이어는 직원이 실제로 상호작용하는 제어판과 같습니다. 복잡한 API 통신을 가져와서 컴포넌트가 쉽게 사용할 수 있는 "processOrder()"와 같은 간단한 액션으로 변환합니다. 버튼을 클릭하면 스토어가 API 호출과 화면 업데이트를 자동으로 처리합니다 - 가게 POS 시스템의 버튼을 누르면 백엔드와 화면이 모두 업데이트되는 것처럼요.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.store.ts"
            code={`
import { store } from "akanjs/store"; // [!code collapse:4]

import { fetch, sig } from "../useClient";

export class IcecreamOrderStore extends store(sig.icecreamOrder, () => ({
  // state // [!code collapse:1]
})) {
  async processIcecreamOrder(icecreamOrderId: string) { // [!code ++:16]
    const icecreamOrder = await fetch.processIcecreamOrder(icecreamOrderId);
    this.setIcecreamOrder(icecreamOrder);
  }
  async serveIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await fetch.serveIcecreamOrder(icecreamOrderId);
    this.setIcecreamOrder(icecreamOrder);
  }
  async finishIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await fetch.finishIcecreamOrder(icecreamOrderId);
    this.setIcecreamOrder(icecreamOrder);
  }
  async cancelIcecreamOrder(icecreamOrderId: string) {
    const icecreamOrder = await fetch.cancelIcecreamOrder(icecreamOrderId);
    this.setIcecreamOrder(icecreamOrder);
  }
}`}
          />
          <div>
            {l.trans({
              en: `Each store action follows this pattern:`,
              ko: `각 스토어 액션은 이 패턴을 따릅니다:`,
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              <strong>{l.trans({ en: "API Call", ko: "API 호출" })}</strong>:{" "}
              {l.trans({
                en: "Make an API request to signal endpoints through fetch methods",
                ko: "fetch 메서드를 통해 시그널 엔드포인트로 API 요청을 만듭니다",
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "State Update", ko: "상태 업데이트" })}</strong>:{" "}
              {l.trans({
                en: "Update the local store state with the new order data using setIcecreamOrder()",
                ko: "setIcecreamOrder()를 사용하여 새 주문 데이터로 로컬 스토어 상태를 업데이트합니다",
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: `This ensures that when status changes happen, the UI automatically reflects the updated state without requiring a page refresh.`,
              ko: `이렇게 하면 상태 변경이 발생할 때 페이지 새로고침 없이도 UI가 자동으로 업데이트된 상태를 반영합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide
        id="util-components"
        title={l.trans({ en: "Create Utility Components", ko: "유틸리티 컴포넌트 생성하기" })}
      >
        <Docs.Title>{l.trans({ en: "Create Utility Components", ko: "유틸리티 컴포넌트 생성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Just like a real ice cream shop might have labeled buttons or stamps for different order stages, we'll create reusable button components for each action. These "digital buttons" can be placed anywhere in our interface - on order Unit cards, in detailed views, or on staff dashboards. By creating them once as utility components, we ensure consistent behavior and styling throughout the entire application.`,
              ko: `실제 아이스크림 가게에 다른 주문 단계를 위한 라벨이 붙은 버튼이나 스탬프가 있는 것처럼, 각 액션에 대한 재사용 가능한 버튼 컴포넌트를 만들어봅시다. 이러한 "디지털 버튼"은 인터페이스의 어디든 배치할 수 있습니다 - 주문 Unit 카드, 상세 뷰, 직원 대시보드에 말이죠. 유틸리티 컴포넌트로 한 번 만들어두면 전체 애플리케이션에서 일관된 동작과 스타일링을 보장할 수 있습니다.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Util.tsx"
            code={`
"use client"; // [!code collapse:3]
import { st, usePage } from "@apps/koyo/client";
import { buttonRecipe } from "akanjs/ui";

interface ProcessProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Process = ({ className, icecreamOrderId, disabled }: ProcessProps) => {
  const { l } = usePage();
  return (
    <button
      className={buttonRecipe({ variant: "secondary" }, className)}
      disabled={disabled}
      onClick={() => {
        void st.do.processIcecreamOrder(icecreamOrderId);
      }}
    >
      {l("icecreamOrder.signal.processIcecreamOrder")}
    </button>
  );
};

interface ServeProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Serve = ({ className, icecreamOrderId, disabled }: ServeProps) => {
  const { l } = usePage();
  return (
    <button
      className={buttonRecipe({ variant: "accent" }, className)}
      disabled={disabled}
      onClick={() => {
        void st.do.serveIcecreamOrder(icecreamOrderId);
      }}
    >
      {l("icecreamOrder.signal.serveIcecreamOrder")}
    </button>
  );
};

interface FinishProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Finish = ({ className, icecreamOrderId, disabled }: FinishProps) => {
  const { l } = usePage();
  return (
    <button
      className={buttonRecipe({ variant: "success" }, className)}
      disabled={disabled}
      onClick={() => {
        void st.do.finishIcecreamOrder(icecreamOrderId);
      }}
    >
      {l("icecreamOrder.signal.finishIcecreamOrder")}
    </button>
  );
};

interface CancelProps {
  className?: string;
  icecreamOrderId: string;
  disabled?: boolean;
}
export const Cancel = ({ className, icecreamOrderId, disabled }: CancelProps) => {
  const { l } = usePage();
  return (
    <button
      className={buttonRecipe({ variant: "warning" }, className)}
      disabled={disabled}
      onClick={() => {
        void st.do.cancelIcecreamOrder(icecreamOrderId);
      }}
    >
      {l("icecreamOrder.signal.cancelIcecreamOrder")}
    </button>
  );
};`}
          />
          <div>
            {l.trans({
              en: `Each button component includes:`,
              ko: `각 버튼 컴포넌트는 다음을 포함합니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">{l.trans({ en: "Consistent Styling", ko: "일관된 스타일링" })}</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `Each button has its own variant: secondary for Process, accent for Serve, success for Finish, and warning for Cancel`,
                  ko: `각 버튼은 고유한 variant를 가집니다: Process는 secondary, Serve는 accent, Finish는 success, Cancel은 warning`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">{l.trans({ en: "Disabled State", ko: "비활성화 상태" })}</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `Buttons can be disabled when actions aren't allowed based on current status`,
                  ko: `현재 상태에 따라 작업이 허용되지 않을 때 버튼을 비활성화할 수 있습니다`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">{l.trans({ en: "Internationalization", ko: "국제화" })}</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `Button labels come from dictionary entries for proper multilingual support`,
                  ko: `버튼 레이블은 적절한 다국어 지원을 위해 dictionary 항목에서 가져옵니다`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide
        id="apply-to-components"
        title={l.trans({ en: "Apply To Unit & View Components", ko: "유닛 & 뷰 컴포넌트에 적용하기" })}
      >
        <Docs.Title>
          {l.trans({ en: "Apply To Unit & View Components", ko: "유닛 & 뷰 컴포넌트에 적용하기" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now we'll put all the pieces together. Just like adding action buttons to the order tickets in a real shop, we'll integrate our status management buttons directly into the order Unit cards and detailed views. Staff won't need to navigate to separate pages or menus - they can process orders right from wherever they're viewing them.`,
              ko: `이제 모든 조각을 하나로 합칩니다. 실제 가게의 주문 티켓에 액션 버튼을 추가하는 것처럼, 상태 관리 버튼을 주문 Unit 카드와 상세 뷰에 직접 통합합니다. 직원들은 별도의 페이지나 메뉴로 이동할 필요 없이 주문을 보고 있는 곳에서 바로 처리할 수 있습니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Let's update the Unit component to include status management buttons:`,
              ko: `상태 관리 버튼을 포함하도록 Unit 컴포넌트를 업데이트해봅시다:`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx"
            code={`
import { type cnst, fetch, IcecreamOrder, usePage } from "@apps/koyo/client"; // [!code collapse:3]
import { cn, type ModelProps } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui";

export const Card = ({ icecreamOrder }: ModelProps<"icecreamOrder", cnst.LightIcecreamOrder>) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl bg-linear-to-br from-background via-muted to-border px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center"> // [!code collapse:25]
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className="inline-block rounded bg-muted px-2 py-1 font-bold text-xs uppercase tracking-wider">
            {l("icecreamOrder.id")}
          </span>
          <span className="ml-2 font-mono text-primary">#{icecreamOrder.id.slice(-4)}</span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-block rounded border border-border bg-background px-2 py-1 font-bold text-primary text-xs uppercase tracking-wider">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={cn(
              "ml-2 rounded-full px-3 py-1 font-semibold text-sm",
              icecreamOrder.status === "active" && "border border-primary/40 bg-background text-primary",
              icecreamOrder.status === "processing" && "border border-warning/40 bg-background text-warning",
              icecreamOrder.status === "served" && "border border-info/40 bg-info text-info-foreground",
              icecreamOrder.status === "finished" && "border border-accent/40 bg-background text-accent",
              icecreamOrder.status === "canceled" && "border border-border bg-background text-foreground/70",
            )}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 rounded-xl bg-background p-4">
        <Model.ViewWrapper slice={fetch.slice.icecreamOrder} modelId={icecreamOrder.id}>
          <button className={buttonRecipe({ variant: "primary" })}>
            <span>{l.trans({ en: "View", ko: "보기" })}</span>
          </button>
        </Model.ViewWrapper>
        <IcecreamOrder.Util.Process icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} /> // [!code ++:4]
        <IcecreamOrder.Util.Serve icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "processing"} />
        <IcecreamOrder.Util.Finish icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "served"} />
        <IcecreamOrder.Util.Cancel icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
      </div>
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: `Now let's also add the buttons to the detailed view modal:`,
              ko: `이제 상세 뷰 모달에도 버튼을 추가해봅시다:`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.View.tsx"
            code={`
import { type cnst, IcecreamOrder, usePage } from "@apps/koyo/client"; // [!code collapse:8]
import { cn } from "akanjs/client";

interface GeneralProps {
  className?: string;
  icecreamOrder: cnst.IcecreamOrder;
}

export const General = ({ className, icecreamOrder }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={cn(className, "mx-auto w-full space-y-6 rounded-xl p-8 shadow-lg")}>
      <div className="flex items-center gap-3 border-b pb-4"> // [!code collapse:43]
        <span className="font-extrabold text-3xl text-primary">🍦</span>
        <span className="font-bold text-2xl">{l("icecreamOrder.modelName")}</span>
        <span className="ml-auto text-foreground/50 text-xs">#{icecreamOrder.id}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.size")}</div>
        <div>{icecreamOrder.size} cc</div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.toppings")}</div>
        <div className="flex flex-wrap gap-2">
          {icecreamOrder.toppings.length === 0 ? (
            <span className="text-foreground/70 italic">{l.trans({ en: "No toppings", ko: "토핑 없음" })}</span>
          ) : (
            icecreamOrder.toppings.map((topping) => (
              <span
                key={topping}
                className="inline-block rounded-full bg-background px-2 py-1 font-medium text-primary text-xs"
              >
                {l(\`topping.\${topping}\`)}
              </span>
            ))
          )}
        </div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.status")}</div>
        <div>
          <span
            className={cn(
              "inline-block rounded-full px-2 py-1 font-semibold text-xs",
              icecreamOrder.status === "active" && "border border-primary/40 bg-background text-primary",
              icecreamOrder.status === "processing" && "border border-warning/40 bg-background text-warning",
              icecreamOrder.status === "served" && "border border-info/40 bg-info text-info-foreground",
              icecreamOrder.status === "finished" && "border border-accent/40 bg-background text-accent",
              icecreamOrder.status === "canceled" && "border border-border bg-background text-foreground/70",
            )}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.createdAt")}</div>
        <div className="text-foreground/70">{icecreamOrder.createdAt.format("YYYY-MM-DD HH:mm:ss")}</div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.updatedAt")}</div>
        <div className="text-foreground/70">{icecreamOrder.updatedAt.format("YYYY-MM-DD HH:mm:ss")}</div>
      </div>
      <div className="flex items-center justify-end gap-2"> // [!code ++:6]
        <IcecreamOrder.Util.Process icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
        <IcecreamOrder.Util.Serve icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "processing"} />
        <IcecreamOrder.Util.Finish icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "served"} />
        <IcecreamOrder.Util.Cancel icecreamOrderId={icecreamOrder.id} disabled={icecreamOrder.status !== "active"} />
      </div>
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: `Key features of this implementation:`,
              ko: `이 구현의 주요 특징:`,
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              <strong>{l.trans({ en: "Smart Disabling", ko: "스마트 비활성화" })}</strong>:{" "}
              {l.trans({
                en: "Buttons are disabled when actions aren't allowed based on current status",
                ko: "현재 상태에 따라 작업이 허용되지 않을 때 버튼이 비활성화됩니다",
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Responsive Layout", ko: "반응형 레이아웃" })}</strong>:{" "}
              {l.trans({
                en: "Buttons wrap gracefully on smaller screens with flex-wrap",
                ko: "버튼들이 flex-wrap으로 작은 화면에서 우아하게 줄바꿈됩니다",
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Visual Hierarchy", ko: "시각적 계층구조" })}</strong>:{" "}
              {l.trans({
                en: "Different button styles indicate action priority and type",
                ko: "다른 버튼 스타일이 작업 우선순위와 유형을 나타냅니다",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide
        id="test-implementation"
        title={l.trans({ en: "Test Status Management", ko: "상태 관리 테스트하기" })}
      >
        <Docs.Title>{l.trans({ en: "Test Status Management", ko: "상태 관리 테스트하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Let's test our status management implementation to ensure everything works correctly:`,
              ko: `모든 것이 올바르게 작동하는지 확인하기 위해 상태 관리 구현을 테스트해봅시다:`,
            })}
          </div>
          <div className={panelRecipe({ radius: "lg" }, "my-4")}>
            <div className="mb-2 font-semibold text-primary">
              {l.trans({ en: "Testing Steps:", ko: "테스트 단계:" })}
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-foreground/70 text-sm">
              <li>
                {l.trans({
                  en: "Navigate to http://localhost:8282",
                  ko: "http://localhost:8282 로 이동",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Create a new ice cream order (it will start as 'active')",
                  ko: "새 아이스크림 주문 생성 ('활성' 상태로 시작됨)",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Notice that only 'Process' and 'Cancel' buttons are enabled",
                  ko: "'작업시작'과 '주문취소' 버튼만 활성화된 것을 확인",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Click 'Process' - the status should change to 'processing'",
                  ko: "'작업시작' 클릭 - 상태가 '처리중'으로 변경되어야 함",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Now only the 'Serve' button should be enabled",
                  ko: "이제 '서빙완료' 버튼만 활성화되어야 함",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Click 'Serve' - the status should change to 'served'",
                  ko: "'서빙완료' 클릭 - 상태가 '서빙완료'로 변경되어야 함",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Click 'Finish' - the status should change to 'finished'",
                  ko: "'완료' 클릭 - 상태가 '완료'로 변경되어야 함",
                })}
              </li>
              <li>
                {l.trans({
                  en: "All action buttons should now be disabled (final state)",
                  ko: "모든 액션 버튼이 이제 비활성화되어야 함 (최종 상태)",
                })}
              </li>
            </ol>
          </div>
          <div className={panelRecipe({ radius: "lg" }, "my-4")}>
            <div className="mb-2 font-semibold text-primary">
              {l.trans({ en: "Expected Behavior:", ko: "예상 동작:" })}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-foreground/70 text-sm">
              <li>
                {l.trans({ en: "Status changes should be instant and visible", ko: "상태 변경이 즉시 표시되어야 함" })}
              </li>
              <li>
                {l.trans({
                  en: "Button states should update automatically",
                  ko: "버튼 상태가 자동으로 업데이트되어야 함",
                })}
              </li>
              <li>
                {l.trans({ en: "Invalid actions should be prevented", ko: "유효하지 않은 작업이 방지되어야 함" })}
              </li>
              <li>
                {l.trans({
                  en: "Error messages should appear if business rules are violated",
                  ko: "비즈니스 규칙이 위반되면 오류 메시지가 나타나야 함",
                })}
              </li>
            </ul>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="next-steps" title={l.trans({ en: "What's Next?", ko: "다음은 무엇인가요?" })}>
        <Docs.Title>{l.trans({ en: "What's Next?", ko: "다음은 무엇인가요?" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `In the next tutorial, we'll connect the service layer to the outside world: notify staff and customers through an external API, and run a scheduled job that checks on orders.`,
              ko: `다음 튜토리얼에서는 서비스 레이어를 바깥 세계와 연결합니다. 외부 API로 직원과 고객에게 알림을 보내고, 주기적으로 주문을 확인하는 작업을 실행해봅니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
