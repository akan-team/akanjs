import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "서비스: Service.Zone.tsx | Akan.js" : "Service: Service.Zone.tsx | Akan.js";
    const description =
      lang === "ko"
        ? "서비스 Zone은 마크업을 두지 않고 라우트에서 값을 받습니다."
        : "A service Zone holds no markup and is seeded from the route.";
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

    const termRows = [
      {
        name: "service module",
        desc: l.trans({
          en: "A `lib/_<name>` folder with no model: a service, a signal, a dictionary and often a store.",
          ko: "자기 model 없이 service, signal, dictionary, 그리고 흔히 store로 이루어진 `lib/_<name>` 폴더입니다.",
        }),
      },
      {
        name: "Zone",
        href: "/conventions/module/zone",
        desc: l.trans({
          en: "The file role for a section a page drops in whole. It is always a client component.",
          ko: "page가 통째로 끼워 넣는 구획을 맡는 파일 역할입니다. 언제나 클라이언트 컴포넌트입니다.",
        }),
      },
      {
        name: "server component",
        href: "/docs/arch/frontend#client-boundary",
        desc: l.trans({
          en: 'A file without "use client". It runs on the server and arrives as HTML.',
          ko: '"use client"가 없는 파일입니다. 서버에서 실행되어 HTML로 도착합니다.',
        }),
      },
      {
        name: "client component",
        href: "/docs/arch/frontend#client-boundary",
        desc: l.trans({
          en: 'A file that starts with "use client". It arrives as HTML, then again as JS the browser re-runs.',
          ko: '첫 줄이 "use client"인 파일입니다. HTML로 한 번, 브라우저가 다시 실행하는 JS로 한 번 더 도착합니다.',
        }),
      },
      {
        name: "slot",
        desc: l.trans({
          en: "A `ReactNode` prop such as `header`. The page renders its content on the server and passes it in.",
          ko: "`header` 같은 `ReactNode` prop입니다. page가 서버에서 내용을 그려 넘겨줍니다.",
        }),
      },
    ];

    const placeColumns = [
      { key: "page", label: "page/", code: true },
      { key: "ui", label: "ui/", code: true },
      { key: "zone", label: ".Zone.tsx", code: true },
    ];

    const placeGroups = [
      {
        label: l.trans({ en: "Not a Zone", ko: "Zone이 아닌 경우" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "A screen of its own", ko: "자기만의 화면" })}</span>,
            desc: l.trans({
              en: "A route, like the OAuth consent screen in `libs/shared/page/oauth`.",
              ko: "`libs/shared/page/oauth`의 OAuth 동의 화면처럼 route 하나입니다.",
            }),
            marks: { page: true, ui: false, zone: false },
          },
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "One button in another screen", ko: "다른 화면 속 버튼 하나" })}
              </span>
            ),
            desc: l.trans({
              en: "A `ui/` component the service store drives, or rarely a `Service.Util.tsx`.",
              ko: "service store가 움직이는 `ui/` 컴포넌트입니다. 드물게 `Service.Util.tsx`가 됩니다.",
            }),
            marks: { page: false, ui: true, zone: false },
          },
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "A section on exactly one route", ko: "route 하나에만 나오는 구획" })}
              </span>
            ),
            desc: l.trans({
              en: "It is that route. Write it in the page itself.",
              ko: "그 구획이 곧 그 route입니다. page 안에 바로 씁니다.",
            }),
            marks: { page: true, ui: false, zone: false },
          },
        ],
      },
      {
        label: l.trans({ en: "A Zone", ko: "Zone인 경우" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "A section reused on several routes", ko: "여러 route에서 다시 쓰는 구획" })}
              </span>
            ),
            desc: l.trans({
              en: "Several controls that share store state, laid out together.",
              ko: "store state를 함께 쓰는 컨트롤 여러 개가 한 덩어리로 배치된 것입니다.",
            }),
            marks: { page: false, ui: false, zone: true },
          },
        ],
      },
    ];

    const dataRows = [
      {
        name: (
          <span className="font-sans">
            {l.trans({ en: "Server data needed at once", ko: "바로 필요한 서버 데이터" })}
          </span>
        ),
        desc: l.trans({
          en: "Await it in the page and pass it down as a prop.",
          ko: "page에서 await하고 prop으로 내려보냅니다.",
        }),
      },
      {
        name: (
          <span className="font-sans">
            {l.trans({ en: "Server data the section can wait for", ko: "기다려도 되는 서버 데이터" })}
          </span>
        ),
        desc: l.trans({
          en: "Hand the unawaited promise to `<Load.Stream of={…}>`. It resolves behind its own boundary.",
          ko: "await하지 않은 promise를 `<Load.Stream of={…}>`에 넘깁니다. 자기 경계 뒤에서 채워집니다.",
        }),
      },
      {
        name: (
          <span className="font-sans">{l.trans({ en: "Anything a click asks for", ko: "클릭이 요청하는 것" })}</span>
        ),
        desc: l.trans({
          en: "A store action, called through `st.do.*`.",
          ko: "`st.do.*`로 부르는 store action입니다.",
        }),
      },
    ];

    const oauthRows = [
      {
        name: <span className="font-sans">{l.trans({ en: "Consent screen", ko: "동의 화면" })}</span>,
        desc: l.trans({
          en: "A route: `libs/shared/page/oauth/consent/_index.tsx`.",
          ko: "route 하나입니다: `libs/shared/page/oauth/consent/_index.tsx`",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Approve and deny buttons", ko: "승인 · 거부 버튼" })}</span>,
        desc: l.trans({
          en: 'A plain `<form method="post">` that the cookie session authenticates.',
          ko: '쿠키 세션이 인증하는 평범한 `<form method="post">`입니다.',
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "Connected-apps list", ko: "연결된 앱 목록" })}</span>,
        desc: l.trans({
          en: "An endpoint, `listOAuthConnections`, for the app's own page to call.",
          ko: "앱이 자기 page에서 부르는 endpoint `listOAuthConnections`입니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "What the module ships", ko: "module이 내보내는 것" })}</span>,
        desc: l.trans({ en: "Ten endpoints and zero components.", ko: "endpoint 10개, 컴포넌트 0개입니다." }),
      },
    ];

    const syncPageLibsRows = [
      {
        name: "true",
        desc: l.trans({
          en: "Every lib the app depends on that ships a `page` folder.",
          ko: "앱이 의존하는 lib 중 `page` 폴더가 있는 것 전부입니다.",
        }),
      },
      {
        name: '["shared"]',
        desc: l.trans({ en: "Exactly the libs listed.", ko: "나열한 lib만 가져옵니다." }),
      },
      {
        name: "false",
        desc: l.trans({ en: "The default. No lib routes.", ko: "기본값입니다. lib route를 가져오지 않습니다." }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="service-zone" title="Service.Zone.tsx">
          <Docs.Title>Service.Zone.tsx</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A Zone is a section a page drops in whole, such as a search console, an upload panel or a device dashboard. Most service modules never need one: of the eight in this workspace, none has a Zone, and none has a Util either.",
                ko: "Zone은 검색 콘솔, 업로드 패널, 장비 대시보드처럼 page가 통째로 끼워 넣는 화면 구획입니다. service module에는 대개 필요 없습니다. 이 워크스페이스의 service module 여덟 개 중 Zone을 가진 것은 하나도 없고, Util도 마찬가지입니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "The reason is that a service module has no records to list. Its UI is usually a screen of its own or one button inside another screen, not a section.",
                ko: "나열할 레코드가 없기 때문입니다. service module의 UI는 보통 구획이 아니라 자기만의 화면이거나, 다른 화면 속 버튼 하나입니다.",
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Where each kind of UI goes", ko: "UI 종류별 자리" })}</Docs.SubSubTitle>
            <Docs.Matrix
              type={l.trans({ en: "The UI is", ko: "UI의 모습" })}
              columns={placeColumns}
              groups={placeGroups}
              markLabel={l.trans({ en: "Goes here", ko: "여기에 둡니다" })}
              emptyLabel={l.trans({ en: "Not here", ko: "여기가 아닙니다" })}
            />
            <div>
              {l.trans({
                en: "A section earns a Zone only when all three of these hold:",
                ko: "구획이 Zone이 되려면 아래 세 가지를 모두 만족해야 합니다:",
              })}
            </div>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Several controls.</strong> More than one control, all reading the same store state.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>컨트롤이 여러 개입니다.</strong> 모두 같은 store state를 읽습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Laid out together.</strong> They form one block of the screen, not scattered pieces.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>한 덩어리로 배치됩니다.</strong> 화면 여기저기 흩어진 조각이 아니라 한 구획을 이룹니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Reused on two or more routes.</strong> If it appears on exactly one route, it is that
                      route.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>route 두 곳 이상에서 다시 씁니다.</strong> 정확히 한 route에만 나온다면, 그 구획이 곧 그
                      route입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>A Zone is always a client component.</strong> Every <code>.Zone.tsx</code> has{" "}
                    <code>{'"use client"'}</code> on line 1. That is a cost, not a licence: every JSX element left
                    inside ships twice, as HTML and again as bundled JS the browser re-runs.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Zone은 언제나 클라이언트 컴포넌트입니다.</strong> 모든 <code>.Zone.tsx</code>는 1행이{" "}
                    <code>{'"use client"'}</code>입니다. 이것은 허가가 아니라 비용입니다. 안에 남긴 JSX 엘리먼트는
                    HTML로 한 번, 브라우저가 다시 실행하는 번들 JS로 한 번, 모두 두 번 전송됩니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="no-markup" title={l.trans({ en: "Hold No Markup", ko: "마크업은 담지 않는다" })}>
          <Docs.Title>{l.trans({ en: "Hold No Markup", ko: "마크업은 담지 않는다" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A model module's Zone reads the store and leaves the drawing to its View, a server component in the
                    same folder. A service module has no View, so the component it hands off to lives in{" "}
                    <code>ui/</code>.
                  </span>
                ),
                ko: (
                  <span>
                    model module의 Zone은 store를 읽고, 그리기는 같은 폴더의 서버 컴포넌트인 View에 맡깁니다. service
                    module에는 View가 없으므로, 그리기를 맡길 컴포넌트는 <code>ui/</code>에 둡니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    The Zone below does both things a Zone can do: it hands store state to a <code>ui/</code> component
                    as props, and takes server content back as a slot:
                  </span>
                ),
                ko: (
                  <span>
                    아래 Zone은 Zone이 할 수 있는 두 가지를 모두 합니다. store state를 <code>ui/</code> 컴포넌트에
                    prop으로 건네고, 서버 콘텐츠는 slot으로 돌려받습니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/_receipt/Receipt.Zone.tsx"
              code={`"use client";

import { st } from "@apps/koyo/client";
import { ReceiptPreview } from "@apps/koyo/ui";
import type { ReactNode } from "react";

interface ConsoleProps {
  className?: string;
  header: ReactNode;
  templates: string[];
}
export const Console = ({ className, header, templates }: ConsoleProps) => {
  const preview = st.use.receiptPreview();
  const printing = st.use.printing();
  return (
    <section className={className}>
      {header}
      <ReceiptPreview
        preview={preview}
        templates={templates}
        disabled={printing}
      />
    </section>
  );
};`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Two store reads, one wrapper element.</strong> The Zone itself draws only a{" "}
                      <code>{"<section>"}</code>. What the user sees is in <code>ReceiptPreview</code> and the{" "}
                      <code>header</code> slot.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>store 읽기 둘, 감싸는 엘리먼트 하나.</strong> Zone이 직접 그리는 것은{" "}
                      <code>{"<section>"}</code>뿐입니다. 사용자가 보는 것은 <code>ReceiptPreview</code>와{" "}
                      <code>header</code> slot에 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Only a slot stays out of the bundle.</strong> The page renders <code>header</code> on the
                      server and passes it in finished. <code>ReceiptPreview</code> has no <code>{'"use client"'}</code>
                      , but because the Zone imports it, its code ships in the Zone's JS chunk.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>번들에서 빠지는 것은 slot뿐입니다.</strong> <code>header</code>는 page가 서버에서 그려
                      완성된 채로 넘깁니다. <code>ReceiptPreview</code>는 <code>{'"use client"'}</code>가 없지만, Zone이
                      import하므로 그 코드는 Zone의 JS 청크에 함께 실립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Prefer named slots to children.</strong> A slot lets the page put server content in a
                      named place instead of one anonymous one. That is why <code>Layout.Navbar</code> takes five:{" "}
                      <code>title</code>, <code>back</code>, <code>left</code>, <code>right</code> and{" "}
                      <code>children</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>children보다 이름 있는 slot을 씁니다.</strong> slot이 있으면 page가 서버 콘텐츠를 익명
                      자리 하나가 아니라 이름 붙은 자리에 놓을 수 있습니다. <code>Layout.Navbar</code>가{" "}
                      <code>title</code>, <code>back</code>, <code>left</code>, <code>right</code>,{" "}
                      <code>children</code> 다섯 개를 받는 이유입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>
              {l.trans({ en: "Keep the boundary small", ko: "경계를 작게 유지하는 법" })}
            </Docs.SubSubTitle>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Wrap the interaction, not the UI.</strong> The smallest useful client component adds one
                      behaviour and renders <code>children</code> untouched, so the markup inside never reaches the
                      bundle.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>UI가 아니라 인터랙션을 감쌉니다.</strong> 쓸모 있는 가장 작은 클라이언트 컴포넌트는 동작
                      하나만 더하고 <code>children</code>은 그대로 그립니다. 그러면 안쪽 마크업은 번들에 들어가지
                      않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Push the boundary down to the leaf.</strong> A Zone that reads three keys and renders
                      forty elements should become a Zone that reads three keys and a server component that renders
                      forty.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>경계를 말단까지 내립니다.</strong> key 셋을 읽고 엘리먼트 마흔 개를 그리는 Zone은, key
                      셋을 읽는 Zone과 마흔 개를 그리는 서버 컴포넌트로 나눕니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Take an id, not a model.</strong> A <code>cnst</code> model on a Zone prop loses its methods
                    crossing the boundary and arrives as a plain object wearing the model's type. Take{" "}
                    <code>orderId: string</code> and read the model from the store.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>model이 아니라 id를 받습니다.</strong> Zone의 prop으로 <code>cnst</code> model을 넘기면
                    경계를 넘으며 method를 잃고, model 타입을 걸친 평범한 객체로 도착합니다.{" "}
                    <code>orderId: string</code>을 받고 model은 store에서 읽으세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="seed-from-route"
          title={l.trans({ en: "Seed It From The Route", ko: "데이터는 route에서 채운다" })}
        >
          <Docs.Title>{l.trans({ en: "Seed It From The Route", ko: "데이터는 route에서 채운다" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Resist loading on mount. A <code>useEffect(…, [])</code> renders an empty shell, hydrates, and only
                    then asks the server a question it could have answered before the first byte.{" "}
                    <code>akan quality ssr</code> reports it as <code>akan.ssr.client-mount-load</code>.
                  </span>
                ),
                ko: (
                  <span>
                    마운트될 때 불러오고 싶은 마음을 참으세요. <code>useEffect(…, [])</code>는 빈 껍데기를 그리고
                    hydrate한 뒤에야, 서버가 첫 바이트 전에 답할 수 있었던 질문을 서버에 던집니다.{" "}
                    <code>akan quality ssr</code>은 이것을 <code>akan.ssr.client-mount-load</code>로 알려 줍니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Instead, the page fetches and awaits, and the Zone takes the result as a prop:",
                ko: "대신 page가 fetch하고 await한 뒤, Zone은 그 결과를 prop으로 받습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/page/receipt/_index.tsx"
              code={`import { fetch, Receipt, usePage } from "@apps/koyo/client";
import { signedIn } from "@libs/shared/webkit";
import { page } from "akanjs/client";

export default page()
  .guard(() => signedIn())
  .render(async () => {
    const { l } = usePage();
    const [templates] = await Promise.all([fetch.listReceiptTemplates()]);
    return (
      <Receipt.Zone.Console
        header={<h1 className="font-bold text-2xl">{l("receipt.console")}</h1>}
        templates={templates}
      />
    );
  });`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The page does the loading.</strong> <code>fetch.listReceiptTemplates()</code> finishes
                      before the first byte, so the console arrives already filled.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>불러오기는 page가 합니다.</strong> <code>fetch.listReceiptTemplates()</code>는 첫 바이트
                      전에 끝나므로, 콘솔은 이미 채워진 채로 도착합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A client component does not call </strong>
                      <code>fetch.*</code>
                      <strong>.</strong> It reads with <code>st.use.*</code> and writes with <code>st.do.*</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>클라이언트 컴포넌트는 </strong>
                      <code>fetch.*</code>
                      <strong>를 부르지 않습니다.</strong> 읽기는 <code>st.use.*</code>, 쓰기는 <code>st.do.*</code>로
                      합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Least of all </strong>
                      <code>fetch.init*</code>
                      <strong>.</strong> It is a hydration snapshot that only a <code>Load.*</code> <code>init</code>{" "}
                      prop reads. Called from the client, it costs two extra round-trips for a value nothing reads.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>특히 </strong>
                      <code>fetch.init*</code>
                      <strong>는 부르지 않습니다.</strong> 이것은 <code>Load.*</code>의 <code>init</code> prop만 읽는
                      hydration 스냅샷입니다. 클라이언트에서 부르면 왕복 두 번을 더 들여 아무도 읽지 않는 값을 받습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Where the data comes from", ko: "데이터가 오는 곳" })}</Docs.SubSubTitle>
            <Docs.IntroTable
              type={l.trans({ en: "Data", ko: "데이터" })}
              descLabel={l.trans({ en: "How it reaches the Zone", ko: "Zone에 닿는 방법" })}
              items={dataRows}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="or-a-page" title={l.trans({ en: "Or Just Write The Page", ko: "아니면 그냥 page를 쓴다" })}>
          <Docs.Title>{l.trans({ en: "Or Just Write The Page", ko: "아니면 그냥 page를 쓴다" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>_oauth</code> in <code>libs/shared</code> is the example to copy. It needed a consent screen,
                    approve and deny buttons and a connected-apps list, yet it has neither a Util nor a Zone.
                  </span>
                ),
                ko: (
                  <span>
                    <code>libs/shared</code>의 <code>_oauth</code>가 따라 할 만한 예입니다. 동의 화면, 승인·거부 버튼,
                    연결된 앱 목록이 필요했지만 Util도 Zone도 없습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "What _oauth needed", ko: "_oauth에 필요했던 것" })}
              descLabel={l.trans({ en: "How it got it", ko: "해결한 방법" })}
              items={oauthRows}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A form post needs no script.</strong> The consent page ships as HTML and works before any
                      bundle arrives.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>form post에는 스크립트가 필요 없습니다.</strong> 동의 화면은 HTML로 전송되고, 어떤 번들이
                      도착하기 전에도 동작합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>For this screen, that is the point.</strong> It authorizes another application to act as
                      you, so working without any script is the goal, not an optimization.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>이 화면에서는 그것이 핵심입니다.</strong> 다른 애플리케이션이 내 이름으로 행동하도록
                      허락하는 화면이라, 스크립트 없이 동작하는 것은 최적화가 아니라 목표입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The argument rides in the path.</strong> Both endpoints take{" "}
                      <code>.param("requestId", String)</code>. Each form posts under the API prefix to{" "}
                      <code>{"approveOAuthConsent/<requestId>"}</code> or <code>{"denyOAuthConsent/<requestId>"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>인자는 경로에 실립니다.</strong> 두 endpoint 모두 <code>.param("requestId", String)</code>
                      을 받습니다. 각 form은 API prefix 아래 <code>{"approveOAuthConsent/<requestId>"}</code>나{" "}
                      <code>{"denyOAuthConsent/<requestId>"}</code>로 post합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "Routes can live in a lib", ko: "route는 lib에도 둘 수 있다" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    A lib may own routes as well as modules. <code>{"libs/<lib>/page"}</code> follows the same rules as
                    an app's <code>page/</code>, and an app opts in with <code>syncPageLibs</code> in{" "}
                    <code>akan.config.ts</code>:
                  </span>
                ),
                ko: (
                  <span>
                    lib는 module뿐 아니라 route도 가질 수 있습니다. <code>{"libs/<lib>/page"}</code>는 앱의{" "}
                    <code>page/</code>와 같은 규칙을 따르고, 앱은 <code>akan.config.ts</code>의{" "}
                    <code>syncPageLibs</code>로 가져옵니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/akan.config.ts"
              language="typescript"
              code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  syncPageLibs: ["shared"],
};

export default config;`}
            />
            <Docs.IntroTable
              type={l.trans({ en: "syncPageLibs value", ko: "syncPageLibs 값" })}
              descLabel={l.trans({ en: "Brings in", ko: "가져오는 route" })}
              items={syncPageLibsRows}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    A lib route keeps its own path: <code>libs/shared/page/oauth/consent/_index.tsx</code> serves{" "}
                    <code>/oauth/consent</code> in every app that brings it in.
                  </span>
                ),
                ko: (
                  <span>
                    lib route는 경로가 바뀌지 않습니다. <code>libs/shared/page/oauth/consent/_index.tsx</code>는 이
                    route를 가져온 모든 앱에서 <code>/oauth/consent</code>로 열립니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
