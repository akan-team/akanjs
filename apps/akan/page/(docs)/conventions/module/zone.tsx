import { usePage } from "@apps/akan/client";
import {
  Code,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  type MatrixGroup,
  type OptionItem,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "도메인: model.Zone.tsx | Akan.js" : "Domain: model.Zone.tsx | Akan.js";
    const description =
      lang === "ko"
        ? "Load.Units와 Load.View로 쓰는 page 섹션의 클라이언트 조각."
        : "The client part of a page section, written with Load.Units and Load.View.";
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

    const bulletList = "my-4 list-disc space-y-2 pl-5";
    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
    const required = l.trans({ en: "required", ko: "필수" });

    const termRows: IntroItem[] = [
      {
        name: "init",
        desc: l.trans({
          en: "The `<model>Init<Suffix>` field of `fetch.init<Model><Suffix>()`: a `ClientInit`, awaited or not.",
          ko: "`fetch.init<Model><Suffix>()`가 주는 `<model>Init<Suffix>` 필드이며, promise 그대로든 await한 값이든 `ClientInit`입니다.",
        }),
      },
      {
        name: "view",
        desc: l.trans({
          en: "The `<model>View` field of `fetch.view<Model>(id)`: one record as a `ClientView`, awaited or not.",
          ko: "`fetch.view<Model>(id)`가 주는 `<model>View` 필드이며, promise 그대로든 await한 값이든 레코드 하나를 담은 `ClientView`입니다.",
        }),
      },
      {
        name: "hydrate",
        desc: l.trans({
          en: "Copy a server payload into the client store, so the screen and the store hold the same data.",
          ko: "서버가 준 payload를 클라이언트 store에 옮겨 담아, 화면과 store가 같은 데이터를 갖게 하는 일입니다.",
        }),
      },
      {
        name: "fetch.slice.<name>",
        desc: l.trans({
          en: "Tells a wrapper or control which model and which list it works with.",
          ko: "래퍼나 컨트롤에게 어떤 모델의 어떤 목록을 다루는지 알려 줍니다.",
        }),
      },
      {
        name: <span className="font-sans">Suspense boundary</span>,
        desc: l.trans({
          en: "A spot that shows a fallback until its promise lands, without holding up the rest of the page.",
          ko: "promise의 결과가 올 때까지 그 자리에만 대체 화면을 보여 주고, 나머지 page는 기다리지 않게 하는 경계입니다.",
        }),
      },
    ];

    const fileCards = [
      {
        title: l.trans({ en: "Path", ko: "경로" }),
        code: "apps/<app>/lib/<model>/<Model>.Zone.tsx",
        desc: l.trans({
          en: "Database and service modules may have one. Scalar modules may not.",
          ko: "데이터베이스 모듈과 서비스 모듈에 둘 수 있고, 스칼라 모듈에는 두지 않습니다.",
        }),
      },
      {
        title: l.trans({ en: "First Line", ko: "첫 줄" }),
        code: '"use client";',
        desc: l.trans({
          en: "Always, on line 1 above the imports.",
          ko: "언제나 import보다 먼저, 파일 첫 줄에 씁니다.",
        }),
      },
      {
        title: l.trans({ en: "List Props", ko: "목록 Zone의 props" }),
        code: "className · init · slice · <parent>Id",
        desc: l.trans({
          en: (
            <span>
              <code>init</code> is a <code>ClientInit</code>. <code>slice</code> goes to the wrappers and controls
              inside.
            </span>
          ),
          ko: (
            <span>
              <code>init</code>은 <code>ClientInit</code>입니다. <code>slice</code>는 안쪽의 래퍼와 컨트롤에 넘깁니다.
            </span>
          ),
        }),
      },
      {
        title: l.trans({ en: "View Props", ko: "상세 Zone의 props" }),
        code: "className · view · <parent>Id",
        desc: l.trans({
          en: (
            <span>
              <code>view</code> is a <code>ClientView</code>. The signed-in user comes from <code>st.use.self()</code>,
              not a prop.
            </span>
          ),
          ko: (
            <span>
              <code>view</code>는 <code>ClientView</code>입니다. 로그인한 사용자는 prop이 아니라{" "}
              <code>st.use.self()</code>로 읽습니다.
            </span>
          ),
        }),
      },
    ];

    const unitsOptions: OptionItem[] = [
      {
        key: "init",
        type: 'ClientInit<"model", LightModel>',
        tags: [required],
        desc: l.trans({
          en: "The list payload or its promise, handed down from the page.",
          ko: "page가 넘겨준 목록 payload나 그 promise입니다.",
        }),
      },
      {
        key: "renderItem",
        type: "(item, idx) => ReactNode",
        desc: l.trans({
          en: "Draws one row; required unless you pass `renderList`.",
          ko: "행 하나를 그리며, `renderList`를 넘기지 않으면 필수입니다.",
        }),
      },
      {
        key: "renderList",
        type: "(list: DataList) => ReactNode",
        desc: l.trans({
          en: "Draws the whole list, for grouping, tabs, boards or a custom order.",
          ko: "그룹, 탭, 보드, 직접 정한 순서가 필요할 때 목록 전체를 그립니다.",
        }),
      },
      {
        key: "renderEmpty",
        type: "(() => ReactNode) | false",
        default: "<Empty />",
        desc: l.trans({
          en: "Draws the no-rows state; `false` with `renderList` draws the empty list instead.",
          ko: "행이 없을 때의 화면을 그리며, `renderList`와 함께 `false`를 주면 빈 목록을 그대로 그립니다.",
        }),
      },
      {
        key: "empty",
        type: "ReactNode",
        desc: l.trans({
          en: "A ready-made no-rows placeholder that wins over `renderEmpty`.",
          ko: "`renderEmpty`보다 우선하는, 미리 만든 빈 상태 요소입니다.",
        }),
      },
      {
        key: "loading",
        type: "ReactNode",
        default: "Loading.Skeleton",
        desc: l.trans({
          en: "Shown while a promised `init` is pending and while the list reloads.",
          ko: "promise로 받은 `init`을 기다리는 동안과 목록을 다시 불러오는 동안 보입니다.",
        }),
      },
      {
        key: "pagination",
        type: "boolean",
        default: "true",
        desc: l.trans({
          en: "Adds a pager on desktop and infinite scroll on mobile.",
          ko: "데스크톱에서는 페이지 번호를, 모바일에서는 무한 스크롤을 붙입니다.",
        }),
      },
      {
        key: "className",
        type: "string",
        desc: l.trans({
          en: "Classes for the wrapping div, such as a grid layout.",
          ko: "행을 감싸는 div의 클래스로, 그리드 레이아웃 등을 여기에 줍니다.",
        }),
      },
    ];

    const viewOptions: OptionItem[] = [
      {
        key: "view",
        type: 'ClientView<"model", Model>',
        tags: [required],
        desc: l.trans({
          en: "The detail payload or its promise, handed down from the page.",
          ko: "page가 넘겨준 상세 payload나 그 promise입니다.",
        }),
      },
      {
        key: "renderView",
        type: "(model) => ReactNode",
        tags: [required],
        desc: l.trans({
          en: "Draws the full model, usually as `<Model>.View.General`.",
          ko: "full 모델을 그리며, 보통 `<Model>.View.General`을 씁니다.",
        }),
      },
      {
        key: "loading",
        type: "ReactNode",
        default: "Loading.Skeleton",
        desc: l.trans({
          en: "Shown while a promised `view` is pending.",
          ko: "promise로 받은 `view`를 기다리는 동안 보입니다.",
        }),
      },
      {
        key: "empty",
        type: "ReactNode",
        default: "<Empty />",
        desc: l.trans({
          en: "Shown when the record came back empty.",
          ko: "레코드가 비어서 돌아왔을 때 보입니다.",
        }),
      },
      {
        key: "className",
        type: "string",
        desc: l.trans({ en: "Classes for the wrapping div.", ko: "감싸는 div의 클래스입니다." }),
      },
      {
        key: "noDiv",
        type: "boolean",
        desc: l.trans({
          en: "Renders `renderView` without the wrapping div.",
          ko: "감싸는 div 없이 `renderView`만 그립니다.",
        }),
      },
    ];

    const sideColumns = [
      { key: "server", label: l.trans({ en: "Server", ko: "서버" }) },
      { key: "client", label: l.trans({ en: "Client", ko: "클라이언트" }), caption: '"use client"' },
    ];
    const onServer = { server: true, client: false };
    const onClient = { server: false, client: true };

    const roleGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "Fetches or draws", ko: "가져오거나 그리는 파일" }),
        rows: [
          {
            name: "page/**/*.tsx",
            desc: l.trans({
              en: "The route shell that reads params, starts `fetch.*` and passes the results down.",
              ko: "param을 읽고 `fetch.*`를 시작해 결과를 아래로 넘기는 route 셸입니다.",
            }),
            marks: onServer,
          },
          {
            name: "<Model>.Unit.tsx",
            desc: l.trans({
              en: "Draws one row or card from a light model.",
              ko: "light 모델로 행이나 카드 하나를 그립니다.",
            }),
            marks: onServer,
          },
          {
            name: "<Model>.View.tsx",
            desc: l.trans({
              en: "Draws the full detail of one record.",
              ko: "레코드 하나의 상세 화면을 그립니다.",
            }),
            marks: onServer,
          },
        ],
      },
      {
        label: l.trans({ en: "Holds state or an action", ko: "상태나 동작을 가진 파일" }),
        rows: [
          {
            name: "<Model>.Zone.tsx",
            desc: l.trans({
              en: "Composes a page section: Load wrappers, store reads and modals.",
              ko: "Load 래퍼, store 읽기, 모달로 page 섹션을 조립합니다.",
            }),
            marks: onClient,
          },
          {
            name: "<Model>.Template.tsx",
            desc: l.trans({
              en: "Form fields and form fragments, each bound to the store.",
              ko: "store에 묶인 폼 필드와 폼 조각입니다.",
            }),
            marks: onClient,
          },
          {
            name: "<Model>.Util.tsx",
            desc: l.trans({
              en: "Small actions, toolboxes and helpers, such as a filter or a remove button.",
              ko: "필터나 삭제 버튼 같은 작은 동작, 도구 모음, 헬퍼입니다.",
            }),
            marks: onClient,
          },
          {
            name: "<model>.store.ts",
            desc: l.trans({
              en: "State and actions, shipped only in the client bundle.",
              ko: "클라이언트 번들에만 들어가는 상태와 액션입니다.",
            }),
            marks: onClient,
          },
        ],
      },
    ];

    const mistakeColumns = [
      { key: "mistake", label: l.trans({ en: "Mistake, then the fix", ko: "실수와 고치는 법" }), code: true },
      { key: "fix", label: l.trans({ en: "Do this", ko: "이렇게 합니다" }) },
    ];
    const mistakeRows = [
      {
        mistake: "useEffect(() => { fetch… }, [])",
        fix: l.trans({
          en: "Fetch in the route and pass the result down as `init` or `view`.",
          ko: "route에서 fetch하고 결과를 `init`이나 `view`로 넘깁니다.",
        }),
      },
      {
        mistake: "fetch.initXInY()",
        fix: l.trans({
          en: "Lint rejects it in a client file; reload with `st.do.initXInY()` instead.",
          ko: "클라이언트 파일에서는 lint가 막으므로, 다시 불러올 때는 `st.do.initXInY()`를 씁니다.",
        }),
      },
      {
        mistake: "init={fetch.initXInY(id)}",
        fix: l.trans({
          en: "Pass the field, not the whole handle: `init={xInitInY}`.",
          ko: "handle 전체가 아니라 필드를 넘깁니다: `init={xInitInY}`.",
        }),
      },
      {
        mistake: "<X.Zone.Card list={xListInY} />",
        fix: l.trans({
          en: "`xListInY` holds model instances a client prop refuses, so pass `xInitInY`.",
          ko: "`xListInY`에는 클라이언트 prop이 거부하는 모델 인스턴스가 들어 있으므로 `xInitInY`를 넘깁니다.",
        }),
      },
      {
        mistake: "self: cnst.User",
        fix: l.trans({
          en: "Lint rejects a model prop, so read it with `st.use.self()` or take an id.",
          ko: "lint가 모델 prop을 막으므로 `st.use.self()`로 읽거나 id를 받습니다.",
        }),
      },
      {
        mistake: "useState<Mode>(…)",
        fix: l.trans({
          en: "Switch modes with `Tab` in the page or a View, so each panel stays server-rendered.",
          ko: "패널이 서버에서 그려지도록 page나 View에서 `Tab`으로 전환합니다.",
        }),
      },
      {
        mistake: "isLoading ? <Spinner /> : …",
        fix: l.trans({
          en: "Use the `loading` and `empty` props of `Load.Units` and `Load.View`.",
          ko: "`Load.Units`와 `Load.View`의 `loading`, `empty` prop을 씁니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="zone-overview" title="model.Zone.tsx">
          <Docs.Title>model.Zone.tsx</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A Zone is the client part of a page section. The page fetches the data; the Zone puts it into the store and hands each record to a Unit or View that draws it.",
                ko: "Zone은 page 섹션에서 클라이언트 쪽을 맡는 조각입니다. page가 데이터를 가져오면, Zone은 그 데이터를 store에 넣고 레코드마다 Unit이나 View에 넘겨 그리게 합니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Open this file when a page gets a new list or detail section, or when a section needs a modal or live updates. One section comes together in four steps:",
                ko: "page에 목록이나 상세 섹션을 새로 붙일 때, 또는 섹션에 모달이나 실시간 갱신이 필요할 때 이 파일을 엽니다. 섹션 하나는 네 단계로 완성됩니다:",
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The page starts the fetch.</strong> <code>fetch.init&lt;Model&gt;&lt;Suffix&gt;()</code>{" "}
                      loads a list and <code>fetch.view&lt;Model&gt;(id)</code> loads one record. The result goes down
                      as <code>init</code> or <code>view</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>page가 fetch를 시작합니다.</strong> 목록은{" "}
                      <code>fetch.init&lt;Model&gt;&lt;Suffix&gt;()</code>, 레코드 하나는{" "}
                      <code>fetch.view&lt;Model&gt;(id)</code>로 가져와 <code>init</code>이나 <code>view</code>로
                      넘깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        The Zone hands it to <code>Load.Units</code> or <code>Load.View</code>.
                      </strong>{" "}
                      They fill the store and draw the loading and empty states.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        Zone이 그것을 <code>Load.Units</code>나 <code>Load.View</code>에 넘깁니다.
                      </strong>{" "}
                      이 둘이 store를 채우고 로딩 화면과 빈 화면을 그립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Each record goes to a server component.</strong> A row goes to a <code>Unit</code>, the
                      detail to a <code>View</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>레코드는 서버 컴포넌트가 그립니다.</strong> 행 하나는 <code>Unit</code>이, 상세 화면은{" "}
                      <code>View</code>가 그립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Actions and forms live in their own files.</strong> A button is a <code>Util</code>, a
                      form is a <code>Template</code>, and state and actions live in the store.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>동작과 폼은 각자의 파일에 둡니다.</strong> 버튼은 <code>Util</code>, 폼은{" "}
                      <code>Template</code>에 두고, 상태와 액션은 store가 맡습니다.
                    </span>
                  ),
                })}
              </li>
            </ol>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="file-convention"
          title={l.trans({ en: "File Convention And Props", ko: "파일 규칙과 props" })}
        >
          <Docs.Title>{l.trans({ en: "File Convention And Props", ko: "파일 규칙과 props" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A Zone file always starts with <code>{'"use client"'}</code>. Its props must be able to cross from
                    server to client: an <code>init</code> or <code>view</code> payload, ids, and a{" "}
                    <code>className</code>.
                  </span>
                ),
                ko: (
                  <span>
                    Zone 파일은 언제나 <code>{'"use client"'}</code>로 시작합니다. props는 서버에서 클라이언트로 건너갈
                    수 있는 값이어야 합니다. <code>init</code>이나 <code>view</code> payload, id, <code>className</code>
                    이 그렇습니다.
                  </span>
                ),
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              {fileCards.map((card) => (
                <div key={card.code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                  <div className="font-semibold text-primary">{card.title}</div>
                  <code className={chip}>{card.code}</code>
                  <div className="mt-2 text-foreground/70 text-sm">{card.desc}</div>
                </div>
              ))}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    A new module starts with this Zone: one list export, <code>Card</code>, and one detail export,{" "}
                    <code>View</code>:
                  </span>
                ),
                ko: (
                  <span>
                    새 모듈은 이 Zone으로 시작합니다. 목록용 <code>Card</code>와 상세용 <code>View</code>를 하나씩
                    export합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
              code={`"use client";
import { type cnst, IcecreamOrder } from "@apps/koyo/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"icecreamOrder", cnst.LightIcecreamOrder>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(icecreamOrder) => (
        <IcecreamOrder.Unit.Card
          key={icecreamOrder.id}
          icecreamOrder={icecreamOrder}
        />
      )}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"icecreamOrder", cnst.IcecreamOrder>;
}
export const View = ({ className, view }: ViewProps) => {
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(icecreamOrder) => (
        <IcecreamOrder.View.General icecreamOrder={icecreamOrder} />
      )}
    />
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Exports are role names.</strong> The model comes from the namespace, so a page writes{" "}
                      <code>{"<IcecreamOrder.Zone.Card />"}</code>, never <code>IcecreamOrderCard</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>export 이름은 역할 이름입니다.</strong> 모델 이름은 네임스페이스가 붙여 주므로 page에서는{" "}
                      <code>{"<IcecreamOrder.Zone.Card />"}</code>로 쓰고, <code>IcecreamOrderCard</code>라고 짓지
                      않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>ClientInit</code>, <code>ClientView</code> and <code>ClientEdit</code> take either shape.
                      </strong>{" "}
                      The page may pass the resolved payload or the promise its fetch handed out, and the Zone stays the
                      same.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>ClientInit</code>, <code>ClientView</code>, <code>ClientEdit</code>는 두 모양을 다
                        받습니다.
                      </strong>{" "}
                      page가 await로 받아 둔 payload를 넘기든 fetch가 준 promise를 넘기든, Zone 코드는 그대로입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Declare <code>{"interface <Name>Props"}</code> right above the component,
                      </strong>{" "}
                      with <code>className?</code> first.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>{"interface <Name>Props"}</code>는 컴포넌트 바로 위에 선언합니다.
                      </strong>{" "}
                      첫 필드는 <code>className?</code>입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never type a Zone prop as a <code>cnst</code> model.
                    </strong>{" "}
                    A Zone is a client component, so a <code>cnst.IcecreamOrder</code> prop is a class instance crossing
                    the server boundary, and lint (<code>no-model-type-in-util-zone</code>) rejects it. Take an id, or a{" "}
                    <code>ClientInit</code> / <code>ClientView</code>, and read the model from the store.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      Zone의 prop 타입을 <code>cnst</code> 모델로 두지 마세요.
                    </strong>{" "}
                    Zone은 클라이언트 컴포넌트라서 <code>cnst.IcecreamOrder</code> prop은 서버 경계를 넘는 클래스
                    인스턴스가 되고, lint(<code>no-model-type-in-util-zone</code>)가 이를 막습니다. id나{" "}
                    <code>ClientInit</code> / <code>ClientView</code>를 받고, 모델은 store에서 읽으세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="load-units-zone"
          title={l.trans({ en: "List Zone With Load.Units", ko: "목록 Zone과 Load.Units" })}
        >
          <Docs.Title>{l.trans({ en: "List Zone With Load.Units", ko: "목록 Zone과 Load.Units" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A list section hands its <code>init</code> to <code>Load.Units</code>. It fills the store with the
                    rows, draws the loading and empty states, and calls your render function for each row.
                  </span>
                ),
                ko: (
                  <span>
                    목록 섹션은 받은 <code>init</code>을 <code>Load.Units</code>에 넘깁니다. <code>Load.Units</code>는
                    행을 store에 채우고, 로딩 화면과 빈 화면을 그리며, 행마다 render 함수를 부릅니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "The page starts the query and passes the promise down without awaiting it:",
                ko: "page는 query를 시작하고, await하지 않은 promise를 그대로 넘깁니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/page/devApp/[devAppId]/dbBackup.tsx"
              code={`import { DbBackup, fetch } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("devAppId", ID)
  .render(({ devAppId }) => {
    const { dbBackupInitInDevApp } = fetch.initDbBackupInDevApp(devAppId);
    return (
      <DbBackup.Zone.Card init={dbBackupInitInDevApp} devAppId={devAppId} />
    );
  });`}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    The Zone gives <code>Load.Units</code> a row renderer and an empty state:
                  </span>
                ),
                ko: (
                  <span>
                    Zone은 <code>Load.Units</code>에 행을 그리는 함수와 빈 화면을 넘깁니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/dbBackup/DbBackup.Zone.tsx"
              code={`"use client"; // [!code collapse:4]
import { type cnst, DbBackup, fetch, usePage } from "@apps/koyo/client";
import type { ClientInit } from "akanjs/fetch";
import { buttonRecipe, Load, Model } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"dbBackup", cnst.LightDbBackup>;
  devAppId: string;
}
export const Card = ({ className, init, devAppId }: CardProps) => {
  const { l } = usePage();
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderEmpty={() => (
          <Model.NewWrapper
            partial={{ devAppId }}
            slice={fetch.slice.dbBackupInDevApp}
          >
            <button type="button" className={buttonRecipe({ variant: "secondary" })}>
              {l("base.new")}
            </button>
          </Model.NewWrapper>
        )}
        renderItem={(dbBackup) => (
          <DbBackup.Unit.Card key={dbBackup.id} dbBackup={dbBackup} />
        )}
      />
      <Model.EditModal slice={fetch.slice.dbBackupInDevApp}>
        <DbBackup.Template.General />
      </Model.EditModal>
    </>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>renderItem</code> draws one row,
                      </strong>{" "}
                      usually by handing it to <code>Unit.Card</code> or <code>Unit.Abstract</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>renderItem</code>은 행 하나를 그립니다.
                      </strong>{" "}
                      보통 <code>Unit.Card</code>나 <code>Unit.Abstract</code>에 넘깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>renderEmpty</code> is the empty state,
                      </strong>{" "}
                      often a <code>Model.NewWrapper</code> or a link-style call to action.{" "}
                      <code>Model.NewWrapper</code> draws only the trigger, so the <code>Model.EditModal</code> beside
                      it draws the form.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>renderEmpty</code>는 빈 화면입니다.
                      </strong>{" "}
                      <code>Model.NewWrapper</code>나 링크 모양의 안내 버튼을 자주 둡니다. <code>Model.NewWrapper</code>
                      는 트리거만 그리므로, 폼은 옆에 둔 <code>Model.EditModal</code>이 그립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>An unawaited promise streams.</strong> <code>Load.Units</code> shows <code>loading</code>{" "}
                      behind a Suspense boundary of its own, and the rest of the page is sent without waiting.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>await하지 않은 promise는 스트리밍됩니다.</strong> <code>Load.Units</code>가 자기만의
                      Suspense boundary 뒤에서 <code>loading</code>을 보여 주고, page의 나머지는 기다리지 않고 먼저
                      전송됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Load.Units props", ko: "Load.Units의 props" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={unitsOptions} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="load-view-zone"
          title={l.trans({ en: "View Zone With Load.View", ko: "상세 Zone과 Load.View" })}
        >
          <Docs.Title>{l.trans({ en: "View Zone With Load.View", ko: "상세 Zone과 Load.View" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A detail section hands its <code>view</code> to <code>Load.View</code>. It puts the record into the
                    store, then passes the full model to your <code>renderView</code>.
                  </span>
                ),
                ko: (
                  <span>
                    상세 섹션은 받은 <code>view</code>를 <code>Load.View</code>에 넘깁니다. <code>Load.View</code>는
                    레코드를 store에 넣은 뒤 full 모델을 <code>renderView</code>에 건넵니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "A pending view promise gets its own boundary, so a slow detail never holds up the layout around it:",
                ko: "아직 도착하지 않은 view promise는 자기만의 boundary를 가지므로, 느린 상세 화면이 주변 레이아웃을 붙잡지 않습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/Ticket.Zone.tsx"
              code={`"use client"; // [!code collapse:4]
import { type cnst, st, Ticket } from "@apps/koyo/client";
import type { ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface ViewProps {
  className?: string;
  view: ClientView<"ticket", cnst.Ticket>;
}
export const View = ({ className, view }: ViewProps) => {
  const self = st.use.self();
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(ticket) => (
        <Ticket.View.General ticket={ticket} self={self} />
      )}
    />
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        The page passes <code>ticketView</code>.
                      </strong>{" "}
                      <code>fetch.viewTicket(ticketId)</code> hands out <code>ticketView</code> and <code>ticket</code>.
                      Keep <code>ticket</code>, a model instance, on the server.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        page는 <code>ticketView</code>를 넘깁니다.
                      </strong>{" "}
                      <code>fetch.viewTicket(ticketId)</code>는 <code>ticketView</code>와 <code>ticket</code>을 줍니다.
                      모델 인스턴스인 <code>ticket</code>은 서버에서만 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The signed-in user comes from the store.</strong> <code>st.use.self()</code> replaces a{" "}
                      <code>self</code> prop, which would be a <code>cnst</code> model crossing the boundary.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>로그인한 사용자는 store에서 읽습니다.</strong> <code>self</code> prop은 경계를 넘는{" "}
                      <code>cnst</code> 모델이 되므로, 대신 <code>st.use.self()</code>를 씁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Load.View props", ko: "Load.View의 props" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={viewOptions} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="orchestration-zones"
          title={l.trans({ en: "Section Orchestration Zones", ko: "여러 조각을 엮는 Zone" })}
        >
          <Docs.Title>{l.trans({ en: "Section Orchestration Zones", ko: "여러 조각을 엮는 Zone" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Some Zones assemble a whole section: a filter, the list, a create button and a modal. The Zone only wires them together; each piece still lives in its own file.",
                ko: "어떤 Zone은 섹션 전체를 조립합니다. 필터, 목록, 생성 버튼, 모달이 한자리에 모입니다. Zone은 이들을 엮기만 하고, 각 조각은 여전히 자기 파일에 있습니다.",
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "A board with renderList", ko: "renderList로 만드는 보드" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>renderList</code> receives the whole list, so the Zone can group rows into columns and put
                    controls around them:
                  </span>
                ),
                ko: (
                  <span>
                    <code>renderList</code>는 목록 전체를 받으므로, Zone이 행을 열별로 묶고 그 둘레에 컨트롤을 둘 수
                    있습니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/ticket/Ticket.Zone.tsx"
              code={`export const Kanban = ({
  className,
  init,
  projectId,
  slice = fetch.slice.ticketInProject,
}: KanbanProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderEmpty={false}
      renderList={(ticketList) => (
        <>
          <Ticket.Util.QueryMakerInSelf slice={slice} />
          <div className="grid grid-cols-3 gap-4">
            {cnst.TicketStatus.values.map((status) => (
              <div key={status} className="flex flex-col gap-2">
                {ticketList
                  .filter((ticket) => ticket.status === status)
                  .map((ticket) => (
                    <Ticket.Unit.Card key={ticket.id} ticket={ticket} />
                  ))}
              </div>
            ))}
          </div>
          <Model.New slice={slice} partial={{ project: projectId }}>
            <Ticket.Template.General />
          </Model.New>
        </>
      )}
    />
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The filter is a Util.</strong> <code>Ticket.Util.QueryMakerInSelf</code> owns the control;
                      the Zone only places it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>필터는 Util입니다.</strong> 컨트롤은 <code>Ticket.Util.QueryMakerInSelf</code>가 맡고,
                      Zone은 자리만 잡아 줍니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>Model.New</code> is the create button and its form in one.
                      </strong>{" "}
                      <code>partial</code> seeds the new ticket with the current project.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Model.New</code>는 생성 버튼과 폼을 한 번에 그립니다.
                      </strong>{" "}
                      <code>partial</code>로 새 티켓에 현재 프로젝트를 미리 채웁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>renderEmpty={"{false}"}</code> keeps the board up.
                      </strong>{" "}
                      With no tickets yet, the empty columns and the create button still render.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>renderEmpty={"{false}"}</code>로 보드를 유지합니다.
                      </strong>{" "}
                      티켓이 하나도 없어도 빈 열과 생성 버튼이 그대로 보입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Cards that open a modal", ko: "모달을 여는 카드" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>Model.ViewWrapper</code> makes each card open its record, and one{" "}
                    <code>Model.ViewEditModal</code> shows it with an edit button:
                  </span>
                ),
                ko: (
                  <span>
                    <code>Model.ViewWrapper</code>는 카드를 누르면 그 레코드를 열고, <code>Model.ViewEditModal</code>{" "}
                    하나가 편집 버튼과 함께 보여 줍니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/dessert/Dessert.Zone.tsx"
              code={`export const Card = ({ className, init }: CardProps) => {
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderItem={(dessert) => (
          <Model.ViewWrapper
            key={dessert.id}
            modelId={dessert.id}
            slice={fetch.slice.dessert}
          >
            <Dessert.Unit.Card dessert={dessert} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal
        slice={fetch.slice.dessert}
        renderView={(dessert) => <Dessert.View.General dessert={dessert} />}
        renderTemplate={() => <Dessert.Template.General />}
      />
    </>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One modal serves every card.</strong> <code>Model.ViewWrapper</code> only opens a record
                      by id; the single <code>Model.ViewEditModal</code> for that slice draws it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>모달 하나가 모든 카드를 맡습니다.</strong> <code>Model.ViewWrapper</code>는 id로 레코드를
                      열기만 하고, 그 slice의 <code>Model.ViewEditModal</code> 하나가 화면을 그립니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>renderTemplate</code> is required.
                      </strong>{" "}
                      The modal's edit button swaps the View for this form.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>renderTemplate</code>은 필수입니다.
                      </strong>{" "}
                      모달의 편집 버튼을 누르면 View가 이 폼으로 바뀝니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Keep local UI state small.</strong> <code>useState</code> is for modal-open, draft input
                      or drag state, never server data.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>로컬 UI 상태는 최소로 둡니다.</strong> <code>useState</code>는 모달 열림, 입력 중인 초안,
                      드래그 상태에만 쓰고 서버 데이터에는 쓰지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Switch modes with <code>Tab</code> from <code>akanjs/ui</code>,
                      </strong>{" "}
                      placed in the page or a View. <code>Tab.Panel</code> renders its children as-is, so a server{" "}
                      <code>View</code> passed in stays server-rendered.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        모드 전환은 <code>akanjs/ui</code>의 <code>Tab</code>으로 합니다.
                      </strong>{" "}
                      Tab은 page나 View에 둡니다. <code>Tab.Panel</code>은 children을 그대로 그리므로, 안에 넣은 서버{" "}
                      <code>View</code>는 서버에서 그려집니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="live-dashboard-zones"
          title={l.trans({ en: "Live And Dashboard Zones", ko: "실시간 Zone과 대시보드 Zone" })}
        >
          <Docs.Title>{l.trans({ en: "Live And Dashboard Zones", ko: "실시간 Zone과 대시보드 Zone" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A Zone can also be a dashboard or a live section, when the whole section follows store state, a subscription or a client-only layout.",
                ko: "섹션 전체가 store 상태, 구독, 클라이언트 전용 레이아웃을 따라 움직인다면 Zone은 대시보드나 실시간 섹션이 될 수도 있습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    A dashboard is a <code>Load.View</code> over a summary model:
                  </span>
                ),
                ko: (
                  <span>
                    대시보드는 요약 모델 위의 <code>Load.View</code>입니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/summary/Summary.Zone.tsx"
              code={`export const Dashboard = ({ view }: DashboardProps) => {
  return (
    <Load.View
      view={view}
      renderView={(summary) => <Summary.View.General summary={summary} />}
    />
  );
};`}
            />
            <div>
              {l.trans({
                en: "A live section subscribes in an effect and unsubscribes in the effect's cleanup:",
                ko: "실시간 섹션은 effect 안에서 구독하고, effect의 cleanup에서 구독을 끊습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/chatRoom/ChatRoom.Zone.tsx"
              code={`export const Room = ({ className, roomId, init }: RoomProps) => {
  useEffect(() => {
    st.do.readChat(roomId);
    const unsubscribe = fetch.subscribeChatAdded(roomId, (chat) => {
      st.do.chatAdded(roomId, chat);
    });
    return () => unsubscribe();
  }, [roomId]);
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(chat) => <Chat.Unit.Card key={chat.id} chat={chat} />}
    />
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A live list needs no effect.</strong> Declare <code>.live()</code> on the slice, and{" "}
                      <code>Load.Units</code> opens the room and applies each change by itself.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>실시간 목록에는 effect가 필요 없습니다.</strong> slice에 <code>.live()</code>를 선언하면{" "}
                      <code>Load.Units</code>가 알아서 room을 열고 변경분을 반영합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>useEffect</code> is for subscribe-with-cleanup.
                      </strong>{" "}
                      An effect that loads data on mount repeats a round trip the server already made;{" "}
                      <code>akan quality ssr</code> reports it as <code>client-mount-load</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>useEffect</code>는 구독과 cleanup에만 씁니다.
                      </strong>{" "}
                      mount 시점에 데이터를 불러오는 effect는 서버가 이미 한 왕복을 되풀이합니다.{" "}
                      <code>akan quality ssr</code>은 이것을 <code>client-mount-load</code>로 알려 줍니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Never hand-roll a loading branch.</strong> <code>Load.View</code> and{" "}
                      <code>Load.Units</code> already draw the pending and empty states, and the route fetched the data
                      before the first byte.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>로딩 분기를 직접 만들지 마세요.</strong> 대기 화면과 빈 화면은 <code>Load.View</code>와{" "}
                      <code>Load.Units</code>가 이미 그리고, 데이터는 route가 첫 바이트 전에 가져왔습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Use Zone", ko: "Zone을 쓰는 경우" })}>
          <Docs.Title>{l.trans({ en: "When To Use Zone", ko: "Zone을 쓰는 경우" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Every piece of a screen has one home. Reach for a Zone when a section needs the store; anything that only draws stays on the server.",
                ko: "화면의 조각마다 자리가 정해져 있습니다. 섹션이 store를 써야 할 때 Zone을 만들고, 그리기만 하는 것은 서버에 둡니다.",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "File", ko: "파일" })}
              columns={sideColumns}
              groups={roleGroups}
              markLabel={l.trans({ en: "Runs here", ko: "여기서 실행" })}
              emptyLabel={l.trans({ en: "Not here", ko: "여기가 아님" })}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
          <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Five rules keep a Zone small:",
                ko: "Zone을 작게 유지하는 다섯 가지 규칙입니다:",
              })}
            </div>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Keep pages thin.</strong> Pass server <code>init</code> or <code>view</code> data into a
                      Zone instead of building the section in the page.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>page는 얇게 둡니다.</strong> 섹션을 page에서 직접 만들지 말고, 서버의 <code>init</code>
                      이나 <code>view</code> 데이터를 Zone에 넘깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Lists use <code>Load.Units</code>, details use <code>Load.View</code>.
                      </strong>
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        목록에는 <code>Load.Units</code>, 상세에는 <code>Load.View</code>를 씁니다.
                      </strong>
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Drawing goes to Unit and View.</strong> A row is a <code>Unit</code> and the full detail
                      is a <code>View</code>, so a Zone holds almost no markup of its own.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>그리는 일은 Unit과 View에 맡깁니다.</strong> 행은 <code>Unit</code>, 상세 화면은{" "}
                      <code>View</code>가 그리므로 Zone 자체의 마크업은 거의 없습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Actions go to Util.</strong> Buttons and controls inside a Zone are <code>Util</code>{" "}
                      components.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>동작은 Util에 둡니다.</strong> Zone 안의 버튼과 컨트롤은 <code>Util</code> 컴포넌트입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Business rules stay out of render code.</strong> They belong in service, document, store
                      or constant.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>비즈니스 규칙은 render 코드에 두지 않습니다.</strong> service, document, store, constant에
                      둡니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Common mistakes", ko: "자주 하는 실수" })}</Docs.SubSubTitle>
            <Docs.Table columns={mistakeColumns} rows={mistakeRows} stacked />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
