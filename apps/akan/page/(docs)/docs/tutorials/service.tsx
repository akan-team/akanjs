import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="interact-in-service" title={l.trans({ en: "Interact in Service", ko: "서비스와 상호작용" })}>
        <Docs.Title>{l.trans({ en: "Interact in Service", ko: "서비스와 상호작용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `When an order comes in, you need to inform the staff so that they can make ice cream, and when the ice cream is made, you need to notify the customer. Also, if the ice cream melts, you need to notify the customer again if they don't pick it up for a long time.`,
              ko: `주문이 들어오면 직원에게는 아이스크림을 만들 수 있도록 정보를 전달하고, 아이스크림이 만들어지면 손님에게 알리는 것이 필요합니다. 또, 손님이 아이스크림이 녹을 정도로 오랫동안 가져가지 않으면 다시 알림을 보내는 것이 필요합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `To achieve this, you need to add a service that sends periodic warnings if a served order is not finished, and a service that sends an alert message to the customer to remind them to pick up the order.`,
              ko: `이를 위해 서빙된 주문이 완료처리되지 않을 경우에 주기적으로 경고를 보내는 작업을 추가해야 합니다. 또, 손님에게 주문을 수령하도록 촉구하는 알람 메세지를 보내는 작업을 추가해야 합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="declare-adapter" title={l.trans({ en: "Declare Adapter", ko: "어댑터 선언하기" })}>
        <Docs.Title>{l.trans({ en: "Declare Adapter", ko: "어댑터 선언하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `First, let's start by connecting an external API or module like an alert. You can connect an api that sends messages or emails, but in this tutorial, we'll create an api that simply prints to the console and connect it.`,
              ko: `먼저, 알람과 같은 외부 API 또는 모듈을 연결하는 것부터 시작해봅시다. 메세지나 이메일을 보내는 api를 연동할 수 있지만, 이번 튜토리얼에서는 단순히 콘솔을 출력하는 api를 만들어 연결해봅시다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Modules like service, signal, document should not be directly connected to external systems, but rather created as adapters that are injected. First, let's create an adapter in the /srvkit folder as follows.`,
              ko: `service, signal, document와 같은 모듈 기능은 바로 외부와 연동하지 않고, 별도로 어댑터를 만들어 이를 주입하는 방식이 바람직합니다. 먼저, /srvkit 폴더에서 다음과 같이 어댑터를 생성해봅시다.`,
            })}
          </div>
          <Code.Snippet
            language="typescript"
            title="apps/koyo/srvkit/alarmApi.ts"
            code={`
import { Logger } from "akanjs/common";

export class AlarmApi {
  readonly #logger = new Logger("AlarmApi");
  constructor(readonly name: string) {}

  warn(message: string) {
    this.#logger.warn(\`\${this.name}: \${message}\`);
  }
}`}
          />
          <div>
            {l.trans({
              en: `Then, export the module in the /srvkit/index.ts file.`,
              ko: `그런 다음, /srvkit/index.ts 파일에서 모듈을 내보냅니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/srvkit/index.ts"
            code={`
export * from "./alarmApi";`}
          />
          <Docs.Alert>
            <div>
              {l.trans({
                en: `Why use the adapter pattern? By injecting external dependencies as adapters rather than directly importing them in services, you gain several benefits:`,
                ko: `왜 어댑터 패턴을 사용해야 할까요? 서비스에서 외부 의존성을 직접 import하지 않고 어댑터로 주입하면 다음과 같은 이점을 얻을 수 있습니다:`,
              })}
            </div>
            <div>
              {l.trans({
                en: `(1) Testability - you can easily mock or replace the adapter in tests without modifying the service code`,
                ko: `(1) 테스트 용이성 - 서비스 코드를 수정하지 않고도 테스트에서 어댑터를 쉽게 모킹하거나 교체할 수 있습니다`,
              })}
            </div>
            <div>
              {l.trans({
                en: `(2) Flexibility - you can swap implementations (e.g., switch from console logging to email notifications) without changing the service logic`,
                ko: `(2) 유연성 - 서비스 로직을 변경하지 않고도 구현체를 교체할 수 있습니다(예: 콘솔 로깅에서 이메일 알림으로 전환)`,
              })}
            </div>
            <div>
              {l.trans({
                en: `(3) Separation of Concerns - the service focuses on business logic while adapters handle external interactions`,
                ko: `(3) 관심사의 분리 - 서비스는 비즈니스 로직에 집중하고 어댑터는 외부 상호작용을 처리합니다`,
              })}
            </div>
            <div>
              {l.trans({
                en: `(4) Reusability - the same adapter can be injected and shared across multiple services`,
                ko: `(4) 재사용성 - 동일한 어댑터를 여러 서비스에서 주입하여 공유할 수 있습니다`,
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="use-external-api" title={l.trans({ en: "Use External API", ko: "외부 API 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use External API", ko: "외부 API 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now, in order to inject the adapter for the alarm into the server, you need to declare and register the adapter to be injected in the option.ts file.`,
              ko: `이제 알람을 위한 어댑터를 서버에 주입하기 위해서는 option.ts파일에서 주입할 어댑터를 선언하고 등록해야 합니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/option.ts"
            code={`
import { AlarmApi } from "@apps/koyo/srvkit"; // [!code ++]
import { AkanOption } from "akanjs/server"; // [!code collapse:8]

import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  //
};

export const option = new AkanOption<ModulesOptions>().use((options) => ({
  alarmApi: new AlarmApi(options.appName), // [!code ++]
}));`}
          />
        </Docs.Description>

        <div>
          {l.trans({
            en: `Now, you can inject the alarmApi in the icecreamOrderService and use it.`,
            ko: `이제 icecreamOrderService에서 alarmApi를 주입하여 사용할 수 있습니다.`,
          })}
        </div>

        <Code.Snippet
          title="apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts"
          code={`
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
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="query-in-document"
        title={l.trans({ en: "Query in Document", ko: "도큐먼트에서 쿼리 적용하기" })}
      >
        <Docs.Title>{l.trans({ en: "Query in Document", ko: "도큐먼트에서 쿼리 적용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now, let's add a service function that sends a warning message if a served order is not finished. For easy testing, let's send a warning message after 15 seconds if the order is served.`,
              ko: `이제, 서빙된 주문이 완료처리되지 않으면 경고 메세지를 보내는 서비스 기능을 추가해봅시다. 테스트가 용이하게 주문이 서빙된 후 15초가 지나면 경고 메세지를 보내도록 해봅시다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.service.ts"
            code={`
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
      this.alarmApi.warn(\`IcecreamOrder \${icecreamOrder.id} is melting 😱\`);
    }
  }
}`}
          />
          <div>
            {l.trans({
              en: `However, how can we query only the served icecream orders? To do this, let's create a list query function by utilizing the feature of creating a query based on the given conditions in the icecreamOrder.document file.`,
              ko: `하지만, 어떻게 아이스크림 주문들 중 서빙된 주문들만 조회할 수 있을까요? 이를 위해서는 document 파일에서 주어진 조건에 맞게 쿼리를 생성하는 기능을 활용해서 리스트 조회 기능을 만들어봅시다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Now, let's apply the query to the document.`,
              ko: `이제 도큐먼트에서 쿼리를 적용해봅시다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.document.ts"
            code={`
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
export class IcecreamOrderModel extends into(IcecreamOrder, IcecreamOrderFilter, cnst.icecreamOrder, () => ({})) {}`}
          />
          <div>
            {l.trans({
              en: `By declaring the byStatuses query in IcecreamOrderFilter, you can use list, find, count, sample functions according to the given query conditions. For example, you can use listByStatuses, countByStatuses functions.`,
              ko: `IcecreamOrderFilter에서 byStatuses 쿼리를 선언하면, 주어진 조건의 쿼리에 맞게 list, find, count, sample 등의 기능을 사용할 수 있습니다. 예를 들면, listByStatuses, countByStatuses 등의 기능을 사용할 수 있습니다.`,
            })}
          </div>
          <Docs.Alert>
            <div>
              {l.trans({
                en: `Why do we receive an array of statuses instead of a single status? This is useful when we need to query multiple statuses at once. If we think there is a possibility of querying multiple statuses, it is better to receive them as an array and process them.`,
                ko: `왜 status가 아닌 statuses 배열을 받아서 쿼리문을 처리할까요? 이는 여러 상태를 동시에 조회하는 경우가 필요할 때에 유용하기 때문입니다. 여러 상태를 동시에 쿼리할 가능성이 있다고 판단되면 배열로 받아서 처리하면 재사용이 가능합니다.`,
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>

      <div className="divider" />

      <Scroll.Slide id="use-interval" title={l.trans({ en: "Use Interval", ko: "인터벌 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use Interval", ko: "인터벌 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now, let's use interval to execute the service every 15 seconds. The interval trigger is a trigger that works internally, and can be declared in IcecreamOrderInternal.`,
              ko: `이제 15초마다 해당 서비스를 실행하도록 interval을 사용해봅시다. interval trigger는 내부에서 발생하는 트리거로 작동하는 구조로, IcecreamOrderInternal에서 선언할 수 있습니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts"
            code={`
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
})) {}`}
          />
          <div>
            {l.trans({
              en: `Now, you can see the warning message printed to the console if the order is served for more than 15 seconds.`,
              ko: `served 상태의 주문이 15초 이상 지나면 콘솔에 경고 메세지가 출력되는 것을 확인할 수 있습니다.`,
            })}
          </div>
          <Code.Snippet
            language="bash"
            code={`[AlarmApi] 44136 - 11/06/2025, 22:19:29 PM    WARN  myapp: IcecreamOrder 690c9f5d83050b6bb34b93bc is melting 😱 +331830ms`}
          />
          <Docs.Alert>
            <div>
              {l.trans({
                en: `Signal file is a file that declares triggers for executing service functions, and Signal has Internal, Endpoint, Slice classes.`,
                ko: `Signal 파일은 서비스 함수를 실행하기 위한 트리거를 선언하는 파일이며, Signal에는 Internal, Endpoint, Slice 클래스가 있습니다.`,
              })}
            </div>
            <div>
              {l.trans({
                en: `Internal is a class that declares triggers for executing service functions, and has init, interval, cron, queue, etc. triggers.`,
                ko: `Internal은 시스템 내부의 트리거를 선언하는 클래스로, init, interval, cron, queue 등의 트리거를 가지고 있습니다.`,
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
