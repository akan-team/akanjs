import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="srvkit-overview" title={l.trans({ en: "Server Utility Overview", ko: "서버 유틸리티 개요" })}>
        <Docs.Title>{l.trans({ en: "Server Utility Overview", ko: "서버 유틸리티 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The srvkit folder contains server-only logic used by services, signals, and server jobs. Put reusable server abstractions here so convention files can stay focused on business behavior.",
              ko: "srvkit 폴더는 service, signal, server job이 사용하는 서버 전용 로직을 담습니다. 재사용 가능한 서버 추상화를 이곳에 두면 convention 파일은 비즈니스 동작에만 집중할 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This is also the safe place to wrap external libraries. Major convention files such as *.service.ts are intentionally strict about arbitrary external imports, so vendor SDKs and low-level server APIs should usually pass through srvkit first.",
              ko: "외부 라이브러리를 감싸는 안전한 위치이기도 합니다. *.service.ts 같은 주요 convention 파일은 임의의 외부 import를 엄격하게 제한하므로, vendor SDK나 낮은 수준의 서버 API는 보통 srvkit을 한 번 거쳐서 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="what-belongs" title={l.trans({ en: "What Belongs In Srvkit", ko: "Srvkit에 두는 것" })}>
        <Docs.Title>{l.trans({ en: "What Belongs In srvkit/", ko: "srvkit/ 에 두는 것" })}</Docs.Title>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              title: "Guard",
              desc: l.trans({
                en: "Request protection logic used by signals, such as checking account roles before a mutation runs.",
                ko: "mutation 실행 전에 계정 role을 확인하는 것처럼 signal에서 사용하는 요청 방어 로직입니다.",
              }),
            },
            {
              title: "InternalArg",
              desc: l.trans({
                en: "Context-derived values injected into signal execution, such as account, self, or admin identity.",
                ko: "account, self, admin identity처럼 request context에서 읽어 signal 실행 인자로 주입하는 값입니다.",
              }),
            },
            {
              title: l.trans({ en: "Middleware And WebProxy", ko: "Middleware와 WebProxy" }),
              desc: l.trans({
                en: "Request pipeline extensions for attaching server context, redirecting, rewriting, or adding headers before app logic runs.",
                ko: "app logic 실행 전에 server context를 붙이거나 redirect, rewrite, header 추가를 처리하는 request pipeline 확장입니다.",
              }),
            },
            {
              title: l.trans({ en: "Server helper", ko: "서버 helper" }),
              desc: l.trans({
                en: "Reusable server logic such as hashing, encryption, file handling, image inspection, or token utilities.",
                ko: "hash, encryption, file handling, image inspection, token utility 같은 재사용 서버 로직입니다.",
              }),
            },
            {
              title: "Adaptor",
              desc: l.trans({
                en: "A service dependency wrapper for external systems such as storage, queues, email, payment, or vendor APIs.",
                ko: "storage, email, payment, vendor API 같은 외부 시스템을 service dependency로 감싸는 구조입니다.",
              }),
            },
            {
              title: l.trans({ en: "Class utility", ko: "Class utility" }),
              desc: l.trans({
                en: "Server-only classes such as logic abstractions or SDK clients that are injected into services through options.",
                ko: "로직 추상화를 위한 객체나 SDK client처럼 option을 통해 service에 주입되는 서버 전용 class입니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="server-level-appliance" title={l.trans({ en: "Server Level Appliance", ko: "서버 레벨 적용" })}>
        <Docs.Title>{l.trans({ en: "Server Level Appliance", ko: "서버 레벨 적용" })}</Docs.Title>
        <div className="space-y-6">
          <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <Docs.Description>
              <div>
                {l.trans({
                  en: "Server level appliances are registered once in the app or library option chain. WebProxy changes the web request before routing, and Middleware prepares request context before signal endpoint logic runs.",
                  ko: "서버 레벨 적용사항은 app 또는 library option chain에 한 번 등록합니다. WebProxy는 라우팅 전에 웹 요청을 바꾸고, Middleware는 signal endpoint 로직이 실행되기 전에 request context를 준비합니다.",
                })}
              </div>
            </Docs.Description>
            <div className="space-y-1 p-4">
              <div>
                {l.trans({
                  en: "WebProxy handles web routing before a page is selected.",
                  ko: "WebProxy는 page가 선택되기 전에 웹 라우팅을 처리합니다.",
                })}
              </div>
              <Docs.Mermaid
                chart={`flowchart LR
ApiCall["/api call"] --> Entry["Akan Server"]
Entry --> WebProxy["WebProxy: redirect, rewrite, headers"]
WebProxy --> Middleware["Middleware: attach context"]
Middleware --> SignalEndpoint["Signal endpoint"]`}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <Docs.Description>
              <div className="font-bold text-base-content">Middleware</div>
              <div>
                {l.trans({
                  en: "Middleware runs around signal requests and can attach server-derived values to the request context before business logic runs.",
                  ko: "Middleware는 signal 요청 주변에서 실행되며, 비즈니스 로직이 실행되기 전에 서버가 만든 값을 request context에 붙일 수 있습니다.",
                })}
              </div>
            </Docs.Description>
            <Code.Snippet
              title="srvkit/middlewares.ts"
              code={`import type { Middleware, SignalContext } from "akanjs/signal";

export class RequestUserMiddleware implements Middleware {
  static readonly refName = "RequestUserMiddleware";

  async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const req = context.getHttpContext<{ user?: { id: string } }>().req;
      req.user = await resolveUserFromRequest(req);
      return next();
    };
  }
}`}
            />
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <Docs.Description>
              <div className="font-bold text-base-content">WebProxy</div>
              <div>
                {l.trans({
                  en: "WebProxy runs before the web request reaches the page. Use it when you need redirects, rewrites, or request header changes for routing and rendering.",
                  ko: "WebProxy는 웹 요청이 page에 도달하기 전에 실행됩니다. routing과 rendering을 위해 redirect, rewrite, request header 변경이 필요할 때 사용합니다.",
                })}
              </div>
            </Docs.Description>
            <Code.Snippet
              title="srvkit/webProxies.ts"
              code={`import type { WebProxy } from "akanjs/server";

export class LegacyPageRedirect implements WebProxy {
  static readonly refName = "LegacyPageRedirect";

  use(request: Bun.BunRequest) {
    const url = new URL(request.url);
    if (url.pathname === "/old-docs") return Response.redirect(new URL("/docs", url), 308);
  }
}`}
            />
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <Docs.Description>
              <div className="font-bold text-base-content">Apply Them In Options</div>
              <div>
                {l.trans({
                  en: "After declaring them in srvkit, register middleware and web proxies in the app or library option chain.",
                  ko: "srvkit에 선언한 뒤에는 app 또는 library option chain에서 middleware와 web proxy를 등록합니다.",
                })}
              </div>
            </Docs.Description>
            <Code.Snippet
              title="lib/option.ts"
              code={`export const option = new AkanOption()
  .applyMiddleware(RequestUserMiddleware)
  .applyWebProxy(LegacyPageRedirect);`}
            />
          </div>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="signal-level-appliance"
        title={l.trans({ en: "Signal Level Appliance", ko: "Signal 레벨 적용" })}
      >
        <Docs.Title>{l.trans({ en: "Signal Level Appliance", ko: "Signal 레벨 적용" })}</Docs.Title>
        <div className="space-y-6">
          <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <Docs.Description>
              <div>
                {l.trans({
                  en: "Signal level appliances are applied per signal endpoint or slice. Guard decides whether the endpoint can run, and InternalArg converts trusted server context into exec arguments.",
                  ko: "Signal 레벨 적용사항은 signal endpoint 또는 slice 단위로 적용합니다. Guard는 endpoint 실행 가능 여부를 판단하고, InternalArg는 신뢰할 수 있는 서버 context를 exec 인자로 바꿉니다.",
                })}
              </div>
            </Docs.Description>
            <div className="space-y-1 p-4">
              <div>
                {l.trans({
                  en: "After server-level Middleware prepares context, signal-level appliances control each endpoint.",
                  ko: "서버 레벨 Middleware가 context를 준비한 뒤, signal 레벨 적용사항이 각 endpoint를 제어합니다.",
                })}
              </div>
              <Docs.Mermaid
                chart={`flowchart LR
SignalEndpoint["Signal endpoint"] --> Guard["Guard: allow or reject"]
Guard --> InternalArg["InternalArg: create exec args"]
InternalArg --> Exec["Signal exec"]
Exec --> Service["Service logic"]`}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <Docs.Description>
              <div className="font-bold text-base-content">Guard</div>
              <div>
                {l.trans({
                  en: "A Guard checks whether a request can run a signal. Use it for authentication, role checks, ownership checks, or any server-side request protection.",
                  ko: "Guard는 요청이 signal을 실행해도 되는지 확인합니다. 인증, role 확인, 소유권 확인, 서버 측 요청 방어에 사용합니다.",
                })}
              </div>
            </Docs.Description>
            <div className="grid gap-3 xl:grid-cols-2">
              <Code.Snippet
                title="srvkit/guards.ts"
                code={`import type { Guard, SignalContext } from "akanjs/signal";

export class SignedIn implements Guard {
  static name = "SignedIn";

  canPass(context: SignalContext): boolean {
    const user = context.getHttpContext<{ user?: { id: string } }>().req.user;
    return !!user;
  }
}`}
              />
              <Code.Snippet
                title="order.signal.ts"
                code={`import { SignedIn } from "@apps/myapp/srvkit";
export class OrderEndpoint extends endpoint(srv.order, ({ pubsub, query, mutation }) => ({
  cancelOrder: mutation(cnst.Order, { guards: [SignedIn] }) // [!code highlight:1]
    .param("orderId", ID)
    .exec(async function (orderId) {
      return await this.orderService.cancelOrder(orderId);
    })
})) {}`}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <Docs.Description>
              <div className="font-bold text-base-content">InternalArg</div>
              <div>
                {l.trans({
                  en: "An InternalArg reads request or websocket context and adds a server-derived value to the signal exec arguments. Use it when business logic needs context data without asking the client to send it.",
                  ko: "InternalArg는 request 또는 websocket context를 읽어 서버가 만든 값을 signal exec 인자로 추가합니다. 클라이언트에게 보내라고 요구하지 않고 context 데이터가 필요한 비즈니스 로직에 사용합니다.",
                })}
              </div>
            </Docs.Description>
            <div className="grid gap-3 xl:grid-cols-2">
              <Code.Snippet
                title="srvkit/internalArgs.ts"
                code={`import type { InternalArg, SignalContext } from "akanjs/signal";

export class CurrentUserId implements InternalArg {
  getArg(context: SignalContext) {
    return context.getHttpContext<{ user?: { id: string } }>().req.user?.id ?? null;
  }
}`}
              />
              <Code.Snippet
                title="signal exec shape"
                code={`import { SignedIn } from "@apps/myapp/srvkit";
export class OrderEndpoint extends endpoint(srv.order, ({ pubsub, query, mutation }) => ({
  cancelOrder: mutation(cnst.Order)
    .param("orderId", ID)
    .with(CurrentUserId, { nullable: true }) // [!code highlight:2]
    .exec(async function (orderId, currentUserId) {
      return await this.orderService.cancelOrder(orderId, { canceledBy: currentUserId });
    })
})) {}`}
              />
            </div>
          </div>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="service-logic"
        title={l.trans({ en: "Service Logic And External Libraries", ko: "서비스 로직과 외부 라이브러리" })}
      >
        <Docs.Title>
          {l.trans({ en: "Service Logic And External Libraries", ko: "서비스 로직과 외부 라이브러리" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "If service code needs crypto, AI SDKs, HTTP clients, or other server-only packages, wrap that logic in srvkit first. A service can import pure helpers directly, but class instances used with use<T>() must be provided from the option chain first.",
              ko: "service 코드가 crypto, AI SDK, HTTP client, 기타 서버 전용 패키지를 필요로 한다면 먼저 srvkit에서 감싸세요. 순수 helper는 service에서 바로 import할 수 있지만, use<T>()로 사용하는 class instance는 먼저 option chain에서 제공해야 합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="srvkit/createHash.ts"
            code={`import { createHash } from "crypto";

export function createOrderHash(orderId: string) {
  return createHash("sha256").update(orderId).digest("hex");
}`}
          />
          <Code.Snippet
            title="srvkit/EmailClient.ts"
            code={`import { Mailer } from "some-mail-provider";

export class EmailClient {
  #mailer: Mailer;

  constructor(apiKey: string) {
    this.#mailer = new Mailer({ apiKey });
  }

  sendReceipt(to: string, orderId: string) {
    return this.#mailer.send({ to, subject: \`Receipt for \${orderId}\` });
  }
}`}
          />
          <Code.Snippet
            title="option.ts"
            code={`import { EmailClient } from "../srvkit";

export const option = new AkanOption()
  .use((options) => ({
    emailClient: new EmailClient(options.mailer.apiKey),
  }));`}
          />
          <Code.Snippet
            title="order.service.ts"
            code={`import { createOrderHash, type EmailClient } from "../srvkit";

export class OrderService extends serve(db.order, ({ use }) => ({
  emailClient: use<EmailClient>(),
})) {
  async sendReceipt(order: db.Order) {
    const hash = createOrderHash(order.id);
    await this.emailClient.sendReceipt(order.email, hash);
  }
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="adaptor-plug" title={l.trans({ en: "Adaptor And plug", ko: "Adaptor와 plug" })}>
        <Docs.Title>{l.trans({ en: "Adaptor And plug", ko: "Adaptor와 plug" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Adaptors make external systems available through service dependencies. Define a small adaptor in srvkit, then plug it into the service that needs it. Adaptors can also plug other adaptors as long as they do not create a circular dependency.",
              ko: "Adaptor는 외부 시스템을 service dependency로 사용할 수 있게 만듭니다. srvkit에 작은 adaptor를 선언하고, 필요한 service에서 plug해서 사용합니다. 순환 의존성만 만들지 않는다면 adaptor끼리도 서로 plug할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="srvkit/paymentApi.ts"
            code={`import { adapt } from "akanjs/service";

interface PaymentOptions {
  endpoint: string;
}

export class PaymentApi extends adapt("paymentApi", ({ env }) => ({
  endpoint: env((option: PaymentOptions) => option.endpoint),
})) {
  async requestPayment(orderId: string, amount: number) {
    return fetch(\`\${this.endpoint}/payments\`, {
      method: "POST",
      body: JSON.stringify({ orderId, amount }),
    });
  }
}`}
          />
          <Code.Snippet
            title="order.service.ts"
            code={`import { PaymentApi } from "../srvkit";
import { serve } from "akanjs/service";

export class OrderService extends serve(db.order, ({ plug }) => ({
  paymentApi: plug(PaymentApi),
})) {
  async pay(order: db.Order) {
    return this.paymentApi.requestPayment(order.id, order.totalPrice);
  }
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Put server-only helper code in srvkit when a service or signal would otherwise become noisy.",
                ko: "service나 signal이 복잡해질 서버 전용 helper 코드는 srvkit에 둡니다.",
              }),
              l.trans({
                en: "Use srvkit for external libraries before importing them into convention files.",
                ko: "외부 라이브러리는 convention 파일에 직접 넣기 전에 srvkit에서 먼저 감싸 사용합니다.",
              }),
              l.trans({
                en: "Use Guards for request protection and InternalArgs for context-derived signal arguments.",
                ko: "요청 방어에는 Guard를, context에서 만든 signal 인자에는 InternalArg를 사용합니다.",
              }),
              l.trans({
                en: "Use adapt and plug when a service needs a reusable external system dependency.",
                ko: "service가 재사용 가능한 외부 시스템 dependency를 필요로 하면 adapt와 plug를 사용합니다.",
              }),
              l.trans({
                en: "Keep app-specific integrations in app srvkit and reusable integrations in library srvkit.",
                ko: "앱 전용 연동은 app srvkit에, 재사용 가능한 연동은 library srvkit에 둡니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
