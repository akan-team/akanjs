import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "Observability: 에러 처리 | Akan.js" : "Observability: Error Handling | Akan.js";
    const description =
      lang === "ko"
        ? "키를 선언하고 Err를 던져 상태 코드를 고르면, 클라이언트가 번역해 보여 줍니다."
        : "Declare a key, throw Err, choose the status, and let the client translate it.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const flowItems = [
      {
        name: "order.dictionary.ts",
        desc: l.trans({
          en: "1. Declare: register each error sentence as an `[en, ko]` pair in `.error({})`.",
          ko: "1. 선언: `.error({})`에 에러 문장을 `[en, ko]` 쌍으로 등록합니다.",
        }),
      },
      {
        name: ["order.document.ts", "order.service.ts"],
        desc: l.trans({
          en: '2. Throw: when a business rule fails, throw `new Err("order.error.notDraft")`.',
          ko: '2. 던지기: 비즈니스 규칙이 깨지면 `new Err("order.error.notDraft")`를 던집니다.',
        }),
      },
      {
        name: <span className="font-sans">HTTP · WebSocket</span>,
        desc: l.trans({
          en: "3. Send: the server answers with the untranslated key, a status code and `data`.",
          ko: "3. 전달: 서버는 번역하지 않은 key와 상태 코드, `data`를 응답으로 보냅니다.",
        }),
      },
      {
        name: "order.store.ts",
        desc: l.trans({
          en: "4. Show: fetch restores it as `Err`, and the store action shows it as a translated toast.",
          ko: "4. 표시: fetch가 응답을 `Err`로 복원하고, store action이 번역해 toast로 띄웁니다.",
        }),
      },
    ];

    const placementItems = [
      {
        name: "order.document.ts",
        desc: l.trans({
          en: "A precondition on the document's own state, such as only a draft order being editable.",
          ko: "초안 주문만 수정할 수 있다는 것처럼, 문서 자신의 상태에 대한 전제 조건입니다.",
        }),
      },
      {
        name: "order.service.ts",
        desc: l.trans({
          en: "A rule that loads or compares other documents, such as the product having to exist.",
          ko: "담으려는 상품이 존재해야 한다는 것처럼, 다른 문서를 불러오거나 비교하는 규칙입니다.",
        }),
      },
      {
        name: "order.signal.ts",
        desc: l.trans({
          en: "Who may call the endpoint at all, such as only the order's owner, written as a guard.",
          ko: "주문한 본인만 부를 수 있다는 것처럼, 누가 endpoint를 부를 수 있는지를 guard로 정합니다.",
        }),
      },
    ];

    const importItems = [
      {
        name: ["*.document.ts", "*.service.ts", "*.signal.ts"],
        desc: l.trans({
          en: "Server files import it from the module's `dict` barrel.",
          ko: "서버 파일은 모듈의 `dict` barrel에서 가져옵니다.",
        }),
        example: 'import { Err } from "../dict";',
      },
      {
        name: "*.tsx",
        desc: l.trans({
          en: "UI files import it from the app's client entry; a lib uses `@libs/<lib>/client`.",
          ko: "UI 파일은 앱의 client 진입점에서, lib에서는 `@libs/<lib>/client`에서 가져옵니다.",
        }),
        example: 'import { Err } from "@apps/<app>/client";',
      },
      {
        name: ["common/**", "env/**"],
        desc: l.trans({
          en: "No import path for `Err` exists here, so keep throwing code out of these folders.",
          ko: "`Err`를 import할 경로가 없으므로, 에러를 던지는 코드를 이 폴더에 두지 않습니다.",
        }),
      },
    ];

    const statusItems = [
      {
        key: "new Err(key)",
        type: "400",
        desc: l.trans({
          en: "The default: a business rule rejected the request.",
          ko: "기본값으로, 비즈니스 규칙이 요청을 거절했다는 뜻입니다.",
        }),
      },
      {
        key: "Err.BadRequest",
        type: "400",
        desc: l.trans({ en: "The same 400, named explicitly.", ko: "같은 400을 이름으로 드러냅니다." }),
      },
      {
        key: "Err.Unauthorized",
        type: "401",
        desc: l.trans({
          en: "The caller has not signed in or proven who they are.",
          ko: "호출자가 로그인하지 않았거나 신원을 증명하지 못했습니다.",
        }),
      },
      {
        key: "Err.Forbidden",
        type: "403",
        desc: l.trans({
          en: "The user is known but may not do this action.",
          ko: "사용자는 확인됐지만 이 동작은 할 수 없습니다.",
        }),
      },
      {
        key: "Err.NotFound",
        type: "404",
        desc: l.trans({ en: "The requested record does not exist.", ko: "요청한 레코드가 없습니다." }),
      },
      {
        key: "Err.Conflict",
        type: "409",
        desc: l.trans({
          en: "The current state cannot accept this action.",
          ko: "현재 상태에서는 이 동작을 받을 수 없습니다.",
        }),
      },
    ];

    const fieldItems = [
      {
        name: "error",
        desc: l.trans({
          en: "The dictionary key you threw, never a translated sentence.",
          ko: "번역된 문장이 아니라, 던진 dictionary key 그대로입니다.",
        }),
      },
      {
        name: "statusCode",
        desc: l.trans({
          en: "400 by default or the helper's status, and the HTTP response carries the same one.",
          ko: "기본 400 또는 helper의 상태 코드이며, HTTP 응답의 상태 코드도 같습니다.",
        }),
      },
      {
        name: "data",
        desc: l.trans({
          en: "The placeholder values, present only when you passed them.",
          ko: "치환에 쓸 값으로, 넘겼을 때만 들어갑니다.",
        }),
      },
      {
        name: "details",
        desc: l.trans({
          en: "Extra debugging detail, present only when set.",
          ko: "디버깅용 추가 정보로, 있을 때만 들어갑니다.",
        }),
      },
      {
        name: "path",
        desc: l.trans({
          en: "The endpoint path, sent over HTTP only and never in a websocket error frame.",
          ko: "endpoint 경로로, HTTP 응답에만 있고 websocket 에러 프레임에는 없습니다.",
        }),
      },
      {
        name: "timestamp",
        desc: l.trans({
          en: "When the server answered, as an ISO string.",
          ko: "서버가 응답한 시각(ISO 문자열)입니다.",
        }),
      },
    ];

    const escapeItems = [
      {
        name: ["Err", "Err.*"],
        desc: l.trans({
          en: "Answered with its own `statusCode`, and `error` holds the dictionary key.",
          ko: "자기 `statusCode`로 응답하고, `error`에는 dictionary key가 들어갑니다.",
        }),
      },
      {
        name: ["NoDocumentError", "getOrder(missingId)"],
        desc: l.trans({
          en: "Answered as 404, and `error` holds `base.error.documentNotFound`.",
          ko: "404로 응답하고, `error`에는 `base.error.documentNotFound`가 들어갑니다.",
        }),
      },
      {
        name: ["Error"],
        desc: l.trans({
          en: "Answered as 500, and a deployed build sets `error` to `Internal Server Error`.",
          ko: "500으로 응답하며, 배포된 빌드에서는 `error`가 `Internal Server Error`입니다.",
        }),
      },
    ];

    const reportContextItems = [
      {
        name: "source",
        desc: l.trans({
          en: "`server` for a 5xx answer, `render` for a page that failed to render, `process` for an uncaught exception or unhandled rejection, `client` for a browser report.",
          ko: "5xx 응답은 `server`, 렌더에 실패한 페이지는 `render`, 잡히지 않은 예외와 처리되지 않은 rejection은 `process`, 브라우저 보고는 `client`입니다.",
        }),
      },
      {
        name: "traceId",
        desc: l.trans({
          en: "The request id the response named as `x-request-id`. For a browser report, the id of the document the tab loaded, which a later in-app navigation keeps.",
          ko: "응답이 `x-request-id`로 알려 준 요청 id입니다. 브라우저 보고라면 그 탭이 불러온 문서의 id이며, 이후 앱 안에서 이동해도 그대로입니다.",
        }),
      },
      {
        name: "endpoint",
        desc: l.trans({
          en: "`<type>:<key>` of the endpoint that answered 5xx, such as `query:orderTotal`.",
          ko: "5xx로 응답한 endpoint의 `<type>:<key>`입니다. 예: `query:orderTotal`.",
        }),
      },
      {
        name: "routeId",
        desc: l.trans({
          en: "The route pattern, such as `/:lang/orders/:orderId`, never the URL with its values.",
          ko: "`/:lang/orders/:orderId` 같은 route 패턴이며, 값이 든 URL은 아닙니다.",
        }),
      },
      {
        name: "accountId",
        desc: l.trans({
          en: "The signed-in account's id on a `server` report whose request had one. Null on a `render` report, since rendering a page runs no guard, and on a browser report, which carries no cookies.",
          ko: "`server` 보고에서, 요청에 로그인한 계정이 있으면 그 id입니다. 페이지 렌더는 guard를 실행하지 않으므로 `render` 보고에는 없고, 쿠키를 싣지 않는 브라우저 보고에도 없습니다.",
        }),
      },
      {
        name: "digest",
        desc: l.trans({
          en: "The id a deployed build shows the browser for a render error, also on the server's log line.",
          ko: "배포된 빌드가 렌더 에러 대신 브라우저에 보여 주는 id이며, 서버 로그 줄에도 있습니다.",
        }),
      },
    ];

    const browserFieldItems = [
      {
        name: "kind",
        desc: l.trans({
          en: "`uncaught`, `caught` or `recoverable` from React, `error` from `window.onerror`, `rejection` from an unhandled rejection.",
          ko: "React가 알린 `uncaught`, `caught`, `recoverable`, `window.onerror`의 `error`, 처리되지 않은 rejection의 `rejection`입니다.",
        }),
      },
      {
        name: ["name", "message", "stack"],
        desc: l.trans({
          en: "What the browser's `Error` held, cleaned as below and cut to 100, 1,000 and 4,000 characters.",
          ko: "브라우저의 `Error`가 가진 값이며, 아래처럼 정리한 뒤 각각 100자, 1,000자, 4,000자로 자릅니다.",
        }),
      },
      {
        name: ["routeId", "digest"],
        desc: l.trans({
          en: "The page's route pattern, and the digest when the browser's error carried one. Dropped unless each has its expected shape.",
          ko: "페이지의 route 패턴과, 브라우저의 에러가 digest를 가졌다면 그 값입니다. 정해진 모양이 아니면 버립니다.",
        }),
      },
      {
        name: ["buildId", "userAgent"],
        desc: l.trans({
          en: "Added by the server: the build it runs, and the request's `User-Agent` cut to 300 characters.",
          ko: "서버가 붙입니다. 서버가 실행 중인 빌드와, 300자로 자른 요청의 `User-Agent`입니다.",
        }),
      },
    ];

    const clientSettingItems = [
      {
        key: "sampleRate",
        type: "number",
        default: "1",
        desc: l.trans({
          en: "The share of page views, from 0 to 1, that send their errors, drawn from each page view's request id.",
          ko: "에러를 보내는 페이지 뷰의 비율(0~1)이며, 페이지 뷰마다 요청 id로 정합니다.",
        }),
      },
      {
        key: "perAddress",
        type: "number",
        default: "10",
        desc: l.trans({
          en: "Requests one address may send the route a minute, kept or not. An IPv6 address counts as its /64.",
          ko: "한 주소가 1분에 이 route로 보낼 수 있는 요청 수이며, 받든 버리든 셉니다. IPv6 주소는 /64 단위로 셉니다.",
        }),
      },
      {
        key: "perServer",
        type: "number",
        default: "120",
        desc: l.trans({
          en: "Reports one server process hands the reporter a minute from all addresses together.",
          ko: "서버 프로세스 하나가 모든 주소를 합쳐 1분에 reporter로 넘기는 보고 수입니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Error Handling", ko: "에러 처리" })}>
          <Docs.Title>{l.trans({ en: "Error Handling", ko: "에러 처리" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "An order that is already paid cannot be edited, and the user should hear why in their own language. In Akan the server throws a dictionary key, and the client translates that key and shows it.",
                ko: "이미 결제된 주문은 수정할 수 없고, 사용자는 그 이유를 자신의 언어로 알 수 있어야 합니다. Akan에서는 서버가 dictionary key를 던지고, 클라이언트가 그 key를 번역해 보여줍니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "One error travels through four steps:",
                ko: "에러 하나는 다음 네 단계를 거칩니다:",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Where", ko: "위치" })}
              descLabel={l.trans({ en: "What happens", ko: "하는 일" })}
              items={flowItems}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="declare-errors" title={l.trans({ en: "Declare Errors", ko: "에러 선언하기" })}>
          <Docs.Title>{l.trans({ en: "Declare Errors", ko: "에러 선언하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Start in the module's dictionary. The keys you declare in <code>.error({"{}"})</code> are the only
                    keys <code>Err</code> accepts, so TypeScript catches a typo.
                  </span>
                ),
                ko: (
                  <span>
                    먼저 모듈의 dictionary에 선언합니다. <code>.error({"{}"})</code>에 선언한 key만 <code>Err</code>에
                    넣을 수 있으므로, 오타는 TypeScript가 잡아 줍니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "The snippet leaves out the other stages of the chain:",
                ko: "아래 코드는 체인의 나머지 단계를 생략했습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/order/order.dictionary.ts"
              code={`import { modelDictionary } from "akanjs/dictionary";

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
  });`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The key path is fixed.</strong> <code>notDraft</code> in the <code>order</code> dictionary
                      is thrown as <code>order.error.notDraft</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>key 경로는 정해져 있습니다.</strong> <code>order</code> dictionary의 <code>notDraft</code>
                      는 <code>order.error.notDraft</code>로 던집니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Placeholders.</strong> <code>{"{productName}"}</code> is filled from the <code>data</code>{" "}
                      you throw with, as shown in Use Data below.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>치환 자리.</strong> <code>{"{productName}"}</code>은 에러와 함께 넘긴 <code>data</code>{" "}
                      값으로 채워집니다. 아래 'Data 사용하기'에서 봅니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Korean ends in '다.'</strong> Write each Korean <code>.error()</code> sentence as a full
                      sentence ending in <code>다.</code>
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>한국어 문장은 '다.'로 끝냅니다.</strong> <code>.error()</code>의 한국어 문구는{" "}
                      <code>다.</code>로 끝나는 완결된 문장으로 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Success messages are not errors.</strong> A toast such as{" "}
                      <code>order.addItemSuccess</code> is declared in <code>.translate({"{}"})</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>성공 메시지는 에러가 아닙니다.</strong> <code>order.addItemSuccess</code> 같은 toast
                      문구는 <code>.translate({"{}"})</code>에 선언합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="throw-err" title={l.trans({ en: "Throw Err", ko: "Err 던지기" })}>
          <Docs.Title>{l.trans({ en: "Throw Err", ko: "Err 던지기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Throw <code>Err</code> when a business rule the user can understand and fix fails. A rule about the
                    document's own state belongs in its document method, so every service shares the same check.
                  </span>
                ),
                ko: (
                  <span>
                    사용자가 이해하고 고칠 수 있는 비즈니스 규칙이 깨지면 <code>Err</code>를 던집니다. 문서 자신의
                    상태에 대한 규칙은 document method에 두면 모든 service가 같은 검사를 공유합니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Only a draft order can change its title:",
                ko: "초안 상태인 주문만 제목을 바꿀 수 있습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/order/order.document.ts"
              code={`import { by } from "akanjs/document";

import * as cnst from "../cnst";
import { Err } from "../dict";

export class Order extends by(cnst.Order) {
  editTitle(title: string) {
    if (this.status !== "draft") throw new Err("order.error.notDraft");
    this.title = title;
    return this;
  }
}`}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Where each rule lives", ko: "규칙을 두는 곳" })}</Docs.SubSubTitle>
            <Docs.IntroTable
              type={l.trans({ en: "Where", ko: "두는 곳" })}
              descLabel={l.trans({ en: "Rule", ko: "규칙" })}
              items={placementItems}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Where to import Err", ko: "Err를 가져오는 곳" })}</Docs.SubSubTitle>
            <Docs.IntroTable
              type={l.trans({ en: "File", ko: "파일" })}
              descLabel={l.trans({ en: "How", ko: "가져오는 법" })}
              items={importItems}
            />
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never <code>throw new Error</code>.
                    </strong>{" "}
                    The <code>no-throw-raw-error</code> lint rule fails the build everywhere in <code>apps/**</code> and{" "}
                    <code>libs/**</code> except tests, <code>*.constant.ts</code>, <code>common/**</code> and{" "}
                    <code>env/**</code>. A plain <code>Error</code> also reaches the user only as a generic 500.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>throw new Error</code>는 쓰지 않습니다.
                    </strong>{" "}
                    <code>no-throw-raw-error</code> lint 규칙이 테스트, <code>*.constant.ts</code>,{" "}
                    <code>common/**</code>, <code>env/**</code>를 뺀 <code>apps/**</code>·<code>libs/**</code> 전체에서
                    빌드를 실패시킵니다. 또 일반 <code>Error</code>는 사용자에게 뭉뚱그린 500으로만 전달됩니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="choose-status" title={l.trans({ en: "Choose Status", ko: "상태 코드 고르기" })}>
          <Docs.Title>{l.trans({ en: "Choose Status", ko: "상태 코드 고르기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>new Err()</code> answers with status 400. When the HTTP meaning matters, throw a named helper
                    instead; each one takes the same arguments as <code>new Err()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>new Err()</code>는 상태 코드 400으로 응답합니다. HTTP 의미가 중요할 때만 이름 있는 helper를
                    던지세요. helper는 모두 <code>new Err()</code>와 같은 인자를 받습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={statusItems} />
            <div>
              {l.trans({
                en: "In a service, the order's state and the product's existence pick different statuses:",
                ko: "service에서는 주문 상태와 상품 존재 여부에 서로 다른 상태 코드를 고릅니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/order/order.service.ts"
              code={`async addItem(orderId: string, productId: string, quantity: number) {
  const order = await this.getOrder(orderId);
  if (order.status !== "draft") throw new Err.Conflict("order.error.notDraft");

  const product = await this.productService.loadProduct(productId);
  if (!product) throw new Err.NotFound("order.error.productNotFound");

  return await order.addItem(product, quantity).save();
}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>get</code> throws, <code>load</code> returns null.
                      </strong>{" "}
                      <code>getOrder(id)</code> throws <code>NoDocumentError</code> when the record is missing, which
                      the caller sees as a 404.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>get</code>은 에러를 던지고, <code>load</code>는 null을 돌려줍니다.
                      </strong>{" "}
                      <code>getOrder(id)</code>는 레코드가 없으면 <code>NoDocumentError</code>를 던지고, 호출자는 404를
                      받습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A missing record is already a 404.</strong> The generated <code>getProduct</code> and a{" "}
                      <code>pick</code> that finds no live row answer 404 <code>base.error.documentNotFound</code>. To
                      say more, call <code>loadProduct(id)</code> and throw your own <code>Err.NotFound</code> on{" "}
                      <code>null</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>없는 레코드는 이미 404입니다.</strong> 생성된 <code>getProduct</code>와 살아 있는 행을
                      찾지 못한 <code>pick</code>은 404 <code>base.error.documentNotFound</code>로 답합니다. 더 자세히
                      답하려면 <code>loadProduct(id)</code>를 부르고, <code>null</code>이면 <code>Err.NotFound</code>를
                      직접 던집니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It is the HTTP status too.</strong> The response goes out with the same code, so proxies
                      and access logs also see 404 or 409.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>HTTP 상태 코드도 같습니다.</strong> 응답이 같은 코드로 나가므로 프록시와 접근 로그에도
                      404나 409로 남습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="use-data" title={l.trans({ en: "Use Data", ko: "Data 사용하기" })}>
          <Docs.Title>{l.trans({ en: "Use Data", ko: "Data 사용하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Pass <code>data</code> when the translated sentence needs values. The server keeps the dictionary
                    key in <code>error</code> and sends <code>data</code> beside it for interpolation.
                  </span>
                ),
                ko: (
                  <span>
                    번역 문장에 값이 필요하면 <code>data</code>를 함께 넘깁니다. 서버는 dictionary key를{" "}
                    <code>error</code>에 그대로 두고, 치환할 값을 <code>data</code>로 옆에 보냅니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    The second argument of <code>Err</code> is that <code>data</code> object:
                  </span>
                ),
                ko: (
                  <span>
                    <code>Err</code>의 두 번째 인자가 그 <code>data</code> 객체입니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/order/order.document.ts"
              code={`addItem(product: cnst.Product, quantity: number) {
  if (product.stock < quantity) {
    throw new Err("order.error.stockNotEnough", {
      productName: product.name,
      quantity,
    });
  }

  this.items = [...this.items, { product: product.id, quantity }];
  return this;
}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Names match the placeholders.</strong> <code>data.productName</code> fills{" "}
                      <code>{"{productName}"}</code> in every language's sentence.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>이름이 치환 자리와 맞아야 합니다.</strong> <code>data.productName</code>이 모든 언어
                      문장의 <code>{"{productName}"}</code> 자리를 채웁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Strings and numbers only.</strong> The error toast fills only string and number values and
                      drops anything else.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>문자열과 숫자만 씁니다.</strong> 에러 toast는 문자열과 숫자 값만 채우고, 나머지는
                      버립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A missing value stays visible.</strong> A placeholder with no value is shown as written,
                      like <code>{"{quantity}"}</code>, so the gap reads as a bug rather than as content.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>빠진 값은 그대로 보입니다.</strong> 값이 없는 자리는 <code>{"{quantity}"}</code>처럼 쓴
                      그대로 나오므로, 빠진 값이 내용이 아니라 버그로 드러납니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="client-handling" title={l.trans({ en: "Client Handling", ko: "클라이언트 처리" })}>
          <Docs.Title>{l.trans({ en: "Client Handling", ko: "클라이언트 처리" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    fetch restores an error response as <code>Err</code>, and every store action already runs inside a
                    wrapper that catches it. The wrapper translates the key into the user's language and shows a toast,
                    so an action holds only the happy path, with no try/catch.
                  </span>
                ),
                ko: (
                  <span>
                    fetch는 에러 응답을 <code>Err</code>로 복원하고, 모든 store action은 그것을 잡는 wrapper 안에서
                    실행됩니다. wrapper가 key를 사용자 언어로 번역해 toast로 띄우므로, action에는 성공 경로만 쓰고
                    try/catch는 쓰지 않습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "The store action calls the endpoint and handles success only:",
                ko: "store action은 endpoint를 부르고 성공한 경우만 처리합니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/order/order.store.ts"
              code={`import { store } from "akanjs/store";
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
}`}
            />
            <div>
              {l.trans({
                en: "The button knows nothing about failure. It calls the action and lets the wrapper answer:",
                ko: "버튼은 실패를 전혀 모릅니다. action을 호출하고 나머지는 wrapper에 맡깁니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/order/Order.Util.tsx"
              code={`"use client";
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
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Toast, then rethrow.</strong> After the toast the wrapper throws the error again, so code
                      after <code>await st.do.addItemToOrder()</code> does not run when it fails.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>toast 뒤에 다시 던집니다.</strong> wrapper는 toast를 띄운 뒤 에러를 다시 던지므로,
                      실패하면 <code>await st.do.addItemToOrder()</code> 뒤의 코드는 실행되지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Network failures are covered.</strong> A timeout, an unreachable server or a restarting
                      one arrives as an <code>Err</code> with a <code>base.error.*</code> key and gets the same toast.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>네트워크 실패도 같습니다.</strong> 타임아웃, 서버 연결 실패, 서버 재시작도{" "}
                      <code>base.error.*</code> key를 가진 <code>Err</code>로 도착해 같은 toast로 보입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Check input with <code>msg.error</code>.
                      </strong>{" "}
                      For a client-side check before the call, run <code>{'msg.error("<key>")'}</code> and return early;
                      never throw.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        입력 검사는 <code>msg.error</code>로 합니다.
                      </strong>{" "}
                      서버를 부르기 전에 클라이언트에서 검사할 때는 <code>{'msg.error("<key>")'}</code>를 부르고 바로
                      return하며, throw하지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>try/finally</code> is for spinners.
                      </strong>{" "}
                      UI code may use it to reset a spinner; catching belongs to the wrapper.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>try/finally</code>는 spinner용입니다.
                      </strong>{" "}
                      UI 코드에서는 spinner를 되돌릴 때만 쓰고, 에러를 잡는 일은 wrapper에 맡깁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="response-shape" title={l.trans({ en: "Response Shape", ko: "응답 형태" })}>
          <Docs.Title>{l.trans({ en: "Response Shape", ko: "응답 형태" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "HTTP and websocket errors carry almost the same fields. You rarely build this by hand, but knowing it makes debugging easier.",
                ko: "HTTP와 websocket 에러는 거의 같은 필드를 가집니다. 직접 만들 일은 거의 없지만, 알아 두면 디버깅이 쉬워집니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    The <code>stockNotEnough</code> error from above arrives like this:
                  </span>
                ),
                ko: (
                  <span>
                    앞의 <code>stockNotEnough</code> 에러는 이렇게 도착합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              language="json"
              showLineNumbers={false}
              code={`{
  "error": "order.error.stockNotEnough",
  "statusCode": 400,
  "data": {
    "productName": "Yogurt Icecream",
    "quantity": 3
  },
  "path": "/addItemToOrder",
  "timestamp": "2026-05-25T00:00:00.000Z"
}`}
            />
            <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={fieldItems} />
            <Docs.SubSubTitle>
              {l.trans({ en: "When a plain Error escapes", ko: "일반 Error가 새어 나가면" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    A plain <code>Error</code>, which is neither an <code>Err</code> nor a missing document, is answered
                    as a 500, so the user never sees the dictionary sentence:
                  </span>
                ),
                ko: (
                  <span>
                    <code>Err</code>도 아니고 없는 레코드도 아닌 일반 <code>Error</code>는 500으로 응답하므로, 사용자는
                    dictionary 문장을 보지 못합니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Thrown", ko: "던진 것" })}
              descLabel={l.trans({ en: "What the caller gets", ko: "호출자가 받는 것" })}
              items={escapeItems}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>In development a plain Error shows everything.</strong> Under <code>akan start</code> its
                      response carries the real message and the stack.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>개발 중에는 일반 Error의 모든 것이 보입니다.</strong> <code>akan start</code>에서는 그
                      응답에 실제 메시지와 stack이 들어갑니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The stack is in the server log.</strong> Every such 500 is logged with its stack, even
                      when the response hides it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>stack은 서버 로그에 있습니다.</strong> 응답이 가리더라도 이런 500은 모두 stack과 함께
                      로그에 남습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Debugging a deployed build.</strong> Set <code>AKAN_ERROR_DETAIL=1</code> to put the real
                      message back into the response.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>배포된 빌드를 디버깅할 때.</strong> <code>AKAN_ERROR_DETAIL=1</code>을 설정하면 응답에
                      실제 메시지가 다시 들어갑니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="report-errors" title={l.trans({ en: "Report Errors", ko: "에러 보고하기" })}>
          <Docs.Title>{l.trans({ en: "Report Errors", ko: "에러 보고하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A 500 lands in the server log, but a team usually wants it in an error tracker too, along with the
                    errors that happen only in a user's browser. <code>option.setErrorReporter</code> hands each error
                    to your function, and <code>option.setClientReport</code> makes pages send what their browser hit.
                  </span>
                ),
                ko: (
                  <span>
                    500은 서버 로그에 남지만, 팀은 보통 에러 추적 서비스에서도 보고 싶어 하고, 사용자 브라우저에서만
                    나는 에러도 알고 싶어 합니다. <code>option.setErrorReporter</code>는 에러를 하나씩 내 함수에 넘기고,{" "}
                    <code>option.setClientReport</code>는 페이지가 브라우저에서 난 에러를 보내게 합니다.
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/srvkit/errorTracker.ts"
              code={`import { BrowserError, type ErrorReporter } from "akanjs/signal";

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
};`}
            />
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/option.ts"
              code={`import { errorTracker } from "../srvkit";

export const option = new AkanOption<ModulesOptions>()
  .setErrorReporter(errorTracker)
  .setClientReport({ sampleRate: 0.25 });`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Once, after the response.</strong> Each error reaches the reporter at most once, after the
                      answer has left. A reporter that throws or rejects is logged once and changes nothing else. Before
                      a crashed process exits, it waits up to 2 seconds for the reporter.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>응답이 나간 뒤, 한 번만.</strong> 에러 하나는 응답이 나간 뒤 reporter에 많아야 한 번
                      갑니다. reporter가 던지거나 reject하면 한 번만 로그에 남고 다른 것은 바뀌지 않습니다. 죽는
                      프로세스는 끝나기 전에 reporter를 2초까지 기다립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Never a 4xx.</strong> An <code>Err</code> the user can fix is an answer, not a fault, so
                      it never reaches the reporter.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>4xx는 보내지 않습니다.</strong> 사용자가 고칠 수 있는 <code>Err</code>는 장애가 아니라
                      응답이므로 reporter에 가지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Where it runs.</strong> In the server that answers: the solo server, or each replica. A
                      render error in the RSC worker is carried to its server and reported there. The gateway loads no{" "}
                      <code>option.ts</code>, so its own failures stay in its log.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>실행되는 곳.</strong> 응답하는 서버, 곧 solo 서버나 각 replica에서 실행됩니다. RSC
                      worker의 렌더 에러는 그 서버로 넘어가 거기서 보고됩니다. gateway는 <code>option.ts</code>를 읽지
                      않으므로 gateway 자신의 장애는 그 로그에만 남습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A bounded number a minute.</strong> One server process hands the reporter at most 600
                      errors a minute, at most 10 of them uncaught exceptions and unhandled rejections, and at most 3
                      render errors of one request. It logs one line when it starts skipping and drops the rest. Await
                      what the reporter sends: a send it does not await, failing, comes back as an unhandled rejection
                      of the process and counts toward those 10.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>1분에 정해진 수까지.</strong> 서버 프로세스 하나는 reporter에 1분에 에러를 600개까지, 그중
                      잡히지 않은 예외와 처리되지 않은 rejection은 10개까지, 한 요청의 렌더 에러는 3개까지 넘깁니다.
                      건너뛰기 시작할 때 로그를 한 줄 남기고 나머지는 버립니다. reporter가 보내는 것은 await 하세요.
                      await하지 않은 전송이 실패하면 프로세스의 처리되지 않은 rejection으로 돌아와 그 10개에 들어갑니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One fault can arrive more than once.</strong> Reports of one request share its{" "}
                      <code>traceId</code>, so group by it. An endpoint that answers 5xx while a page renders arrives as{" "}
                      <code>server</code>, with its <code>endpoint</code>, and as <code>render</code>, with the page's{" "}
                      <code>routeId</code> and <code>digest</code>. A server error streamed into a page arrives as{" "}
                      <code>render</code>, and when the browser re-renders that part of the page, also as a{" "}
                      <code>client</code> report of kind <code>recoverable</code> with the same <code>traceId</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>장애 하나가 여러 번 올 수 있습니다.</strong> 한 요청의 보고는 <code>traceId</code>가
                      같으므로 그것으로 묶으세요. 페이지를 렌더하는 중에 5xx로 응답한 endpoint는 <code>endpoint</code>를
                      가진 <code>server</code>로도, 페이지의 <code>routeId</code>와 <code>digest</code>를 가진{" "}
                      <code>render</code>로도 옵니다. 페이지로 스트리밍된 서버 에러는 <code>render</code>로 오고,
                      브라우저가 그 부분을 다시 렌더하면 같은 <code>traceId</code>를 가진 <code>recoverable</code>{" "}
                      종류의 <code>client</code> 보고로도 옵니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "What the reporter gets", ko: "reporter가 받는 것" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The first argument is a real <code>Error</code> with its <code>cause</code> chain; a thrown value
                    that is not one arrives wrapped, with the value as its <code>cause</code>. The second is the
                    context:
                  </span>
                ),
                ko: (
                  <span>
                    첫 인자는 <code>cause</code> 사슬을 가진 진짜 <code>Error</code>입니다. Error가 아닌 값을 던졌다면
                    그 값을 <code>cause</code>로 감싸서 옵니다. 둘째 인자는 context입니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={reportContextItems} />
            <Docs.SubSubTitle>{l.trans({ en: "Errors from the browser", ko: "브라우저의 에러" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    With <code>setClientReport</code>, each page view the sample draws sends its React root's uncaught,
                    caught and recoverable errors, <code>window.onerror</code> and unhandled rejections to{" "}
                    <code>/_akan/client-report</code>, at most five a page view. A page loads the sending code only on
                    its first error. Without the option the route does not exist and pages send nothing. The server
                    gives each such page view an id in the page's <code>Server-Timing</code> header, the request id with
                    a signature, and takes a report only with that id: for 30 to 60 minutes after the page was served,
                    and five times.
                  </span>
                ),
                ko: (
                  <span>
                    <code>setClientReport</code>를 켜면, 표본으로 뽑힌 페이지 뷰가 React root의 uncaught·caught·
                    recoverable 에러와 <code>window.onerror</code>, 처리되지 않은 rejection을 페이지 뷰마다 다섯 개까지{" "}
                    <code>/_akan/client-report</code>로 보냅니다. 보내는 코드는 첫 에러가 났을 때에만 불러옵니다. 옵션이
                    없으면 그 route가 없고 페이지도 아무것도 보내지 않습니다. 서버는 그런 페이지 뷰마다 페이지의{" "}
                    <code>Server-Timing</code> 헤더에 id(요청 id와 서명)를 실어 주고, 그 id가 있는 보고만 받습니다.
                    페이지를 내보낸 뒤 30~60분 동안, 다섯 번까지입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={clientSettingItems} />
            <div>
              {l.trans({
                en: (
                  <span>
                    The reporter gets a <code>BrowserError</code>, with <code>source: "client"</code>, whose{" "}
                    <code>data</code> holds:
                  </span>
                ),
                ko: (
                  <span>
                    reporter는 <code>source: "client"</code>와 함께 <code>BrowserError</code>를 받고, 그{" "}
                    <code>data</code>에는 다음이 들어 있습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={browserFieldItems} />
            <Docs.SubSubTitle>{l.trans({ en: "What the server drops", ko: "서버가 걸러 내는 것" })}</Docs.SubSubTitle>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Reports it did not ask for.</strong> It keeps only a <code>text/plain</code> POST from the
                      app's own origin, of 8 KB or less, carrying the id the server gave that page view, within the
                      limits above. It checks in that order, and only a report with such an id counts toward{" "}
                      <code>perServer</code>. Every request, kept or not, gets the same empty 204.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>요청하지 않은 보고.</strong> 앱 자신의 origin에서 온 8 KB 이하의 <code>text/plain</code>{" "}
                      POST로, 서버가 그 페이지 뷰에 준 id를 싣고 위 한도 안에 있는 것만 받습니다. 이 순서로 확인하며,
                      그런 id를 가진 보고만 <code>perServer</code>에 셉니다. 받든 버리든 모든 요청에 같은 빈 204로
                      답합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Terminal escapes and control characters.</strong> They are removed, and a line break in{" "}
                      <code>name</code> or <code>message</code> is written as <code>\n</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>터미널 escape와 제어 문자.</strong> 지우고, <code>name</code>이나 <code>message</code>의
                      줄바꿈은 <code>\n</code>으로 적습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Query strings, addresses and credentials.</strong> In the name, message and stack, a URL
                      or a path loses its query string and fragment and keeps its line and column, an email address
                      becomes <code>[email]</code>, a <code>Bearer …</code> value and a JWT become{" "}
                      <code>[redacted]</code>, and the characters that reorder how a line displays are removed. The page
                      does this before it sends, and the server again before the reporter or the log sees the text.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>query string, 주소, 인증 값.</strong> name·message·stack에서 URL이나 경로의 query string과
                      fragment를 지우고 줄과 열 번호는 남기며, 이메일 주소는 <code>[email]</code>로,{" "}
                      <code>Bearer …</code> 값과 JWT는 <code>[redacted]</code>로 바꾸고, 줄이 표시되는 순서를 바꾸는
                      문자는 지웁니다. 페이지가 보내기 전에 한 번, 서버가 reporter와 로그에 넘기기 전에 다시 한 번
                      합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>An id another deployment signed.</strong> An operator may set the secret{" "}
                      <code>AKAN_CLIENT_REPORT_KEY</code> to 32 characters or more, and every server that holds it takes
                      an id any of them gave; a gateway passes it to its replicas unchanged, and a shorter value is
                      ignored with one warning. Without it, the replicas behind one gateway share a key the gateway
                      makes at start, so a report is taken by any of them and by no other gateway's; a server run alone
                      uses its own key, so only the process that served the page takes its reports, and none after a
                      restart. The app name and the environment are signed in either way. Set the key, the same on each,
                      when more than one gateway or pod answers for the app.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>다른 배포가 서명한 id.</strong> 운영자는 비밀값 <code>AKAN_CLIENT_REPORT_KEY</code>를 32자
                      이상으로 설정할 수 있으며, 이 값을 가진 서버는 그중 누가 준 id든 받습니다. gateway는 이 값을
                      replica에 그대로 넘기고, 더 짧은 값은 경고 한 줄과 함께 무시됩니다. 설정하지 않으면 한 gateway
                      뒤의 replica들은 gateway가 시작할 때 만든 키를 함께 쓰므로 그 replica 중 누구든 보고를 받지만 다른
                      gateway의 것은 받지 않습니다. 혼자 도는 서버는 자기 키를 쓰므로 페이지를 내보낸 프로세스만 그
                      보고를 받고, 재시작한 뒤에는 받지 않습니다. 앱 이름과 환경은 어느 쪽이든 서명에 들어갑니다.
                      gateway나 pod가 둘 이상이면 모두에 같은 키를 설정하세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>What the limits leave.</strong> Each server process counts on its own, so N replicas take
                      up to N times <code>perServer</code> and five reports per id each. Visitors behind one address
                      share its <code>perAddress</code>. <code>perServer</code> is one budget for everyone who loaded a
                      page: once a minute's worth is taken, later reports that minute are dropped, never queued.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>한도가 남기는 것.</strong> 서버 프로세스마다 따로 세므로 replica가 N개면{" "}
                      <code>perServer</code>의 N배까지, id 하나당 프로세스마다 다섯 개까지 받습니다. 한 주소 뒤의
                      방문자들은 그 주소의 <code>perAddress</code>를 나눠 씁니다. <code>perServer</code>는 페이지를
                      불러온 모두가 함께 쓰는 한도입니다. 1분 치를 다 쓰면 그 분의 나머지 보고는 버리며 쌓아 두지
                      않습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>What leaves the browser.</strong> The id the server gave the page view, the route pattern,
                    and the error's name, message, stack and digest, cleaned as above. No cookies, no referrer and no
                    account. The cleaning knows a few shapes, not meanings: a message still holds whatever else the code
                    put into it, such as a value a user typed, so keep personal data out of error messages, and name the
                    service in your privacy notice when your reporter forwards to one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>브라우저를 떠나는 것.</strong> 서버가 페이지 뷰에 준 id, route 패턴, 위처럼 정리한 에러의
                    name·message·stack·digest입니다. 쿠키, referrer, 계정은 보내지 않습니다. 정리는 몇 가지 모양만 알 뿐
                    뜻은 모릅니다. message에는 코드가 넣은 다른 것(사용자가 입력한 값 등)이 그대로 남으므로 에러
                    메시지에 개인정보를 넣지 말고, reporter가 외부 서비스로 보낸다면 개인정보 처리방침에 그 서비스를
                    적으세요.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Pages that send nothing.</strong> The browser reads the request id from the page's{" "}
                    <code>Server-Timing</code> header, which it shows a script only over HTTPS and on{" "}
                    <code>localhost</code>. A page served with a <code>Cache-Control</code> that lets a shared cache
                    reuse it (<code>AKAN_HTML_CACHE_CONTROL</code> set to <code>public, max-age=…</code> or{" "}
                    <code>off</code>) carries no id, since a stored copy would give one page view's id to the next
                    visitor; the default <code>no-cache</code> and a signed-in page's <code>private, no-cache</code> do
                    carry it. The CSR bundle a native app loads sends none. A tab open for longer than the 30 to 60
                    minutes its id is taken for sends reports the server drops, until it loads a document again. The
                    page reads its id once, when the document loads: after an in-app navigation a report still carries
                    that first id, with the route pattern of the page the user is on.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>아무것도 보내지 않는 페이지.</strong> 브라우저는 페이지의 <code>Server-Timing</code>{" "}
                    헤더에서 요청 id를 읽는데, 이 헤더는 HTTPS와 <code>localhost</code>에서만 script에 보입니다. 공유
                    캐시가 다시 쓸 수 있는 <code>Cache-Control</code>(<code>AKAN_HTML_CACHE_CONTROL</code>을{" "}
                    <code>public, max-age=…</code>나 <code>off</code>로 둔 경우)로 나간 페이지는 저장된 사본이 다음
                    방문자에게 같은 id를 줄 수 있으므로 id를 싣지 않습니다. 기본값 <code>no-cache</code>와 로그인한
                    페이지의 <code>private, no-cache</code>는 id를 싣습니다. 네이티브 앱이 불러오는 CSR 번들은 보내지
                    않습니다. id를 받아 주는 30~60분보다 오래 열어 둔 탭의 보고는 문서를 다시 불러올 때까지 서버가
                    버립니다. 페이지는 문서를 불러올 때 id를 한 번만 읽습니다. 앱 안에서 이동한 뒤의 보고에도 그 첫 id가
                    실리고, route 패턴은 사용자가 보고 있는 페이지의 것입니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "팁" })}>
          <Docs.Title>{l.trans({ en: "Tips", ko: "팁" })}</Docs.Title>
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Name keys by domain and reason.</strong> For example <code>order.error.notDraft</code>,{" "}
                      <code>order.error.stockNotEnough</code>, <code>user.error.wrongPassword</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>key는 도메인과 이유가 보이게 짓습니다.</strong> 예: <code>order.error.notDraft</code>,{" "}
                      <code>order.error.stockNotEnough</code>, <code>user.error.wrongPassword</code>.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Do not translate on the server.</strong> Send the key and <code>data</code>, and let the
                      client pick the user's language.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>서버에서 번역하지 않습니다.</strong> key와 <code>data</code>만 보내고, 사용자 언어는
                      클라이언트가 고르게 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Pass a remote <code>Err</code> through as is.
                      </strong>{" "}
                      A server-to-server <code>fetch.x(…, {"{ origin }"})</code> restores the remote <code>Err</code>,
                      so rethrow it rather than wrapping it in <code>new Error</code> or a key of your own.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        원격 <code>Err</code>는 그대로 넘깁니다.
                      </strong>{" "}
                      서버 간 <code>fetch.x(…, {"{ origin }"})</code> 호출은 원격 <code>Err</code>를 그대로 복원하므로,{" "}
                      <code>new Error</code>로 감싸거나 새 key로 바꾸지 말고 그대로 다시 던지세요.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.LinkGrid
              items={[
                {
                  href: "/conventions/module/dictionary",
                  title: "model.dictionary.ts",
                  desc: l.trans({
                    en: (
                      <span>
                        The full dictionary chain, including <code>.error()</code> and <code>.translate()</code>.
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>.error()</code>와 <code>.translate()</code>를 포함한 dictionary 체인 전체입니다.
                      </span>
                    ),
                  }),
                },
                {
                  href: "/conventions/module/document",
                  title: "model.document.ts",
                  desc: l.trans({
                    en: (
                      <span>
                        Chain methods that validate, mutate and return <code>this</code>.
                      </span>
                    ),
                    ko: (
                      <span>
                        검증하고, 바꾸고, <code>this</code>를 돌려주는 체인 메서드입니다.
                      </span>
                    ),
                  }),
                },
                {
                  href: "/conventions/module/store",
                  title: "model.store.ts",
                  desc: l.trans({
                    en: "When a store needs a custom action, and how to write one.",
                    ko: "store에 직접 action이 필요한 경우와 그 action을 쓰는 법입니다.",
                  }),
                },
                {
                  href: "/cheatsheet/observability/logging",
                  title: l.trans({ en: "Logging", ko: "로깅" }),
                  desc: l.trans({
                    en: (
                      <span>
                        Tail and filter server logs with <code>akan logs</code> to find a 500's stack.
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>akan logs</code>로 서버 로그를 걸러 보며 500의 stack을 찾습니다.
                      </span>
                    ),
                  }),
                },
              ]}
            />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
